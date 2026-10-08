import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, requireRole, canAccessProject, canUnlockRevision, moduleRoleAtLeast } from "../auth.js";
import { logActivity } from "../audit.js";

export const projectRoutes = new Hono();
projectRoutes.use("*", requireAuth);

function nextProjectCode(): string {
  const year = new Date().getFullYear();
  const row = db
    .prepare("SELECT code FROM projects WHERE code LIKE ? ORDER BY code DESC LIMIT 1")
    .get(`PRJ-${year}-%`) as any;
  const seq = row ? parseInt(row.code.split("-")[2], 10) + 1 : 1;
  return `PRJ-${year}-${String(seq).padStart(3, "0")}`;
}

// --- List projects (role-scoped) -------------------------------------------
projectRoutes.get("/", (c) => {
  const base = `
    SELECT p.*, cu.name AS customer_name, u.display_name AS owner_name,
      (SELECT COUNT(*) FROM revisions r WHERE r.project_id = p.id) AS revision_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status != 'done') AS open_tasks
    FROM projects p
    LEFT JOIN customers cu ON cu.id = p.customer_id
    JOIN users u ON u.id = p.owner_id`;
  const rows = db.prepare(`${base} ORDER BY p.updated_at DESC`).all();
  return c.json(rows);
});

// --- Create project (sales / admin) -----------------------------------------
const createSchema = z.object({
  name: z.string().min(1),
  customerId: z.number().optional().nullable(),
  description: z.string().optional().nullable(),
  memberIds: z.array(z.number()).default([]),
});

projectRoutes.post("/", async (c) => {
  const user0 = c.get("user");
  if (user0.role === "presales" && !moduleRoleAtLeast(user0, "presales", "manager"))
    return c.json({ error: "forbidden" }, 403);
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  const user = c.get("user");

  const tx = db.transaction(() => {
    const res = db
      .prepare("INSERT INTO projects (code, name, customer_id, description, owner_id, created_by) VALUES (?,?,?,?,?,?)")
      .run(nextProjectCode(), d.name, d.customerId ?? null, d.description ?? null, user.id, user.id);
    const projectId = Number(res.lastInsertRowid);
    for (const mid of d.memberIds) {
      db.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?,?)").run(projectId, mid);
    }
    // First revision is created automatically
    db.prepare("INSERT INTO revisions (project_id, rev_no, label, created_by) VALUES (?,?,?,?)")
      .run(projectId, 1, "R1", user.id);
    logActivity({ projectId, userId: user.id, action: "project.created", entityType: "project", entityId: projectId, details: d.name });
    return projectId;
  });
  const projectId = tx();
  return c.json({ id: projectId }, 201);
});

// --- Project detail ----------------------------------------------------------
projectRoutes.get("/:id", (c) => {
  const id = Number(c.req.param("id"));
  if (!canAccessProject(c.get("user"), id)) return c.json({ error: "forbidden" }, 403);
  const project = db
    .prepare(
      `SELECT p.*, cu.name AS customer_name, cu.entity AS customer_entity, u.display_name AS owner_name
       FROM projects p LEFT JOIN customers cu ON cu.id = p.customer_id JOIN users u ON u.id = p.owner_id
       WHERE p.id = ?`
    )
    .get(id);
  if (!project) return c.json({ error: "not found" }, 404);
  const members = db
    .prepare("SELECT u.id, u.display_name, u.role FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ?")
    .all(id);
  const revisions = db
    .prepare(
      `SELECT r.*, u.display_name AS created_by_name, lu.display_name AS locked_by_name, cu.display_name AS committed_by_name
       FROM revisions r JOIN users u ON u.id = r.created_by LEFT JOIN users lu ON lu.id = r.locked_by
       LEFT JOIN users cu ON cu.id = r.committed_by
       WHERE r.project_id = ? ORDER BY r.rev_no DESC`
    )
    .all(id);
  return c.json({ project, members, revisions });
});

// --- Update project ----------------------------------------------------------
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  customerId: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["draft", "in_progress", "in_review", "approved", "submitted", "won", "lost", "cancelled"]).optional(),
  memberIds: z.array(z.number()).optional(),
  roundSellUp: z.boolean().optional(),
});

projectRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  if (!canAccessProject(user, id)) return c.json({ error: "forbidden" }, 403);
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  // Only sales/admin may change status or membership
  if ((d.status || d.memberIds) && user.role === "presales" && !moduleRoleAtLeast(user, "presales", "manager"))
    return c.json({ error: "forbidden" }, 403);

  if (d.name) db.prepare("UPDATE projects SET name = ? WHERE id = ?").run(d.name, id);
  if (d.customerId !== undefined) db.prepare("UPDATE projects SET customer_id = ? WHERE id = ?").run(d.customerId, id);
  if (d.description !== undefined) db.prepare("UPDATE projects SET description = ? WHERE id = ?").run(d.description, id);
  if (d.roundSellUp !== undefined) db.prepare("UPDATE projects SET round_sell_up = ? WHERE id = ?").run(d.roundSellUp ? 1 : 0, id);
  if (d.status) {
    db.prepare("UPDATE projects SET status = ? WHERE id = ?").run(d.status, id);
    logActivity({ projectId: id, userId: user.id, action: "project.status_changed", entityType: "project", entityId: id, details: d.status });
  }
  if (d.memberIds) {
    db.prepare("DELETE FROM project_members WHERE project_id = ?").run(id);
    for (const mid of d.memberIds) {
      db.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?,?)").run(id, mid);
    }
    logActivity({ projectId: id, userId: user.id, action: "project.members_updated", entityType: "project", entityId: id });
  }
  db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(id);
  return c.json({ ok: true });
});

// --- Delete project (admin only) ---------------------------------------------
projectRoutes.delete("/:id", (c) => {
  const user = c.get("user");
  if (user.role !== "admin" && !moduleRoleAtLeast(user, "presales", "admin"))
    return c.json({ error: "forbidden" }, 403);
  const id = Number(c.req.param("id"));
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
  if (!project) return c.json({ error: "not found" }, 404);
  // FK ON DELETE CASCADE handles members, revisions→costing, quotes→items,
  // tasks, activity, options→option_items, service_calcs, attachments rows.
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  logActivity({ userId: user.id, action: "project.deleted", entityType: "project", entityId: id, details: `${project.code} — ${project.name}` });
  return c.json({ ok: true });
});

// --- Revisions ---------------------------------------------------------------
// --- Duplicate a whole quote process -----------------------------------------
// Deep copy: members, quotes (+items), revisions (+costing items), proposal
// options (+item links), service calcs. Attachments and tasks stay behind.
const ITEM_COLS = [
  "quote_item_id", "category", "description", "vendor", "qty", "unit_cost", "margin_pct", "notes", "sort",
  "part_no", "bom_qty", "months", "service_terms", "list_unit_price", "partner_discount_pct",
  "discounted_unit_buy_price", "proposal_description", "exch_rate", "landed_factor", "sell_override",
  "is_amc", "is_sw_support", "item_grouping", "product_grouping", "offer_grouping", "in_proposal",
  "map_no", "auto_map", "is_amc_basis", "apl_unit_price", "apl_discount_pct", "mpg_code", "row_color",
  "disc_sell_override", "price_period",
];

projectRoutes.post("/:id/duplicate", (c) => {
  const srcId = Number(c.req.param("id"));
  const user = c.get("user");
  if (!canAccessProject(user, srcId)) return c.json({ error: "forbidden" }, 403);
  const src = db.prepare("SELECT * FROM projects WHERE id = ?").get(srcId) as any;
  if (!src) return c.json({ error: "not found" }, 404);

  const tx = db.transaction(() => {
    const res = db
      .prepare("INSERT INTO projects (code, name, customer_id, description, status, owner_id, created_by, round_sell_up) VALUES (?,?,?,?,'draft',?,?,?)")
      .run(nextProjectCode(), `${src.name} (copy)`, src.customer_id, src.description, user.id, user.id, src.round_sell_up);
    const newId = Number(res.lastInsertRowid);

    for (const m of db.prepare("SELECT user_id FROM project_members WHERE project_id = ?").all(srcId) as any[])
      db.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?,?)").run(newId, m.user_id);

    // Quotes first — costing items reference quote_items, revision links patched below
    const quoteItemMap = new Map<number, number>();
    const quoteRevLinks: [number, number | null][] = [];
    for (const q of db.prepare("SELECT * FROM quotes WHERE project_id = ?").all(srcId) as any[]) {
      const qr = db
        .prepare("INSERT INTO quotes (project_id, revision_id, vendor, reference, currency, notes, created_by) VALUES (?,?,?,?,?,?,?)")
        .run(newId, null, q.vendor, q.reference, q.currency, q.notes, user.id);
      const newQid = Number(qr.lastInsertRowid);
      quoteRevLinks.push([newQid, q.revision_id]);
      for (const it of db.prepare("SELECT * FROM quote_items WHERE quote_id = ? ORDER BY line_no").all(q.id) as any[]) {
        const ir = db
          .prepare("INSERT INTO quote_items (quote_id, line_no, description, part_no, qty, unit_price, list_unit_price, extended_buy, lead_time, notes) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(newQid, it.line_no, it.description, it.part_no, it.qty, it.unit_price, it.list_unit_price, it.extended_buy, it.lead_time, it.notes);
        quoteItemMap.set(it.id, Number(ir.lastInsertRowid));
      }
    }

    // Revisions + costing items (full field set)
    const revMap = new Map<number, number>();
    const itemMap = new Map<number, number>();
    const itemInsert = db.prepare(
      `INSERT INTO costing_items (revision_id, ${ITEM_COLS.join(", ")}) VALUES (?, ${ITEM_COLS.map(() => "?").join(",")})`
    );
    for (const rev of db.prepare("SELECT * FROM revisions WHERE project_id = ? ORDER BY rev_no").all(srcId) as any[]) {
      const rr = db
        .prepare("INSERT INTO revisions (project_id, rev_no, label, notes, note, status, created_by) VALUES (?,?,?,?,?,'open',?)")
        .run(newId, rev.rev_no, rev.label, rev.notes, rev.note, user.id);
      const newRevId = Number(rr.lastInsertRowid);
      revMap.set(rev.id, newRevId);
      for (const it of db.prepare("SELECT * FROM costing_items WHERE revision_id = ? ORDER BY sort, id").all(rev.id) as any[]) {
        const vals = ITEM_COLS.map((col) =>
          col === "quote_item_id" ? (it.quote_item_id != null ? quoteItemMap.get(it.quote_item_id) ?? null : null) : it[col]);
        const ir = itemInsert.run(newRevId, ...vals);
        itemMap.set(it.id, Number(ir.lastInsertRowid));
      }
    }
    for (const [newQid, oldRevId] of quoteRevLinks)
      if (oldRevId != null) db.prepare("UPDATE quotes SET revision_id = ? WHERE id = ?").run(revMap.get(oldRevId) ?? null, newQid);

    // Proposal options + their item links
    for (const o of db.prepare("SELECT * FROM proposal_options WHERE project_id = ?").all(srcId) as any[]) {
      const newRevId = revMap.get(o.revision_id);
      if (!newRevId) continue;
      const or2 = db
        .prepare("INSERT INTO proposal_options (project_id, revision_id, name, description, template_id, created_by, discount_display, discount_mode, currency, price_view) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .run(newId, newRevId, o.name, o.description, o.template_id, user.id, o.discount_display, o.discount_mode, o.currency, o.price_view ?? "unit");
      const newOptId = Number(or2.lastInsertRowid);
      for (const oi of db.prepare("SELECT costing_item_id, section, custom_description FROM option_items WHERE option_id = ?").all(o.id) as any[]) {
        const mapped = itemMap.get(oi.costing_item_id);
        if (mapped) db.prepare("INSERT OR IGNORE INTO option_items (option_id, costing_item_id, section, custom_description) VALUES (?,?,?,?)").run(newOptId, mapped, oi.section ?? null, oi.custom_description ?? null);
      }
    }

    // Service calculations
    for (const s of db.prepare("SELECT * FROM service_calcs WHERE project_id = ?").all(srcId) as any[]) {
      db.prepare(
        "INSERT INTO service_calcs (project_id, revision_id, name, method, rate, effort, effort_unit, percent, amount, costing_item_id, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
      ).run(
        newId, s.revision_id != null ? revMap.get(s.revision_id) ?? null : null,
        s.name, s.method, s.rate, s.effort, s.effort_unit, s.percent, s.amount,
        s.costing_item_id != null ? itemMap.get(s.costing_item_id) ?? null : null,
        s.notes, user.id
      );
    }

    logActivity({ projectId: newId, userId: user.id, action: "project.duplicated", entityType: "project", entityId: newId, details: `from ${src.code} — costing, quotes, options, services copied; attachments and tasks stay with the original` });
    return newId;
  });
  const id = tx();
  return c.json({ id }, 201);
});

// Full column carry-forward list (everything except id/revision_id/created_at)
const CARRY_COLS = `quote_item_id, category, description, vendor, qty, unit_cost, margin_pct, notes, sort,
  part_no, bom_qty, months, service_terms, list_unit_price, partner_discount_pct, discounted_unit_buy_price,
  proposal_description, exch_rate, landed_factor, sell_override, is_amc, is_sw_support,
  item_grouping, product_grouping, offer_grouping, in_proposal, map_no, auto_map, is_amc_basis,
  apl_unit_price, apl_discount_pct, mpg_code, row_color, disc_sell_override, price_period`;

projectRoutes.post("/:id/revisions", async (c) => {
  const projectId = Number(c.req.param("id"));
  const user = c.get("user");
  if (!canAccessProject(user, projectId)) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

  const tx = db.transaction(() => {
    const latest = db
      .prepare("SELECT MAX(rev_no) AS m FROM revisions WHERE project_id = ?")
      .get(projectId) as any;
    const revNo = (latest?.m || 0) + 1;
    const res = db
      .prepare("INSERT INTO revisions (project_id, rev_no, label, created_by, note) VALUES (?,?,?,?,?)")
      .run(projectId, revNo, `R${revNo}`, user.id, note);
    const newRevId = Number(res.lastInsertRowid);
    // Carry forward ALL costing item fields from the previous revision
    const prev = db
      .prepare("SELECT id FROM revisions WHERE project_id = ? AND rev_no = ?")
      .get(projectId, revNo - 1) as any;
    if (prev) {
      db.prepare(
        `INSERT INTO costing_items (revision_id, ${CARRY_COLS})
         SELECT ?, ${CARRY_COLS}
         FROM costing_items WHERE revision_id = ?`
      ).run(newRevId, prev.id);
    }
    logActivity({ projectId, userId: user.id, action: "revision.created", entityType: "revision", entityId: newRevId, details: `R${revNo}${note ? ` — ${note}` : ""}` });
    return newRevId;
  });
  const id = tx();
  return c.json({ id }, 201);
});

projectRoutes.post("/:id/revisions/:revId/lock", (c) => {
  const projectId = Number(c.req.param("id"));
  const revId = Number(c.req.param("revId"));
  const user = c.get("user");
  if (!canAccessProject(user, projectId)) return c.json({ error: "forbidden" }, 403);
  db.prepare("UPDATE revisions SET status = 'locked', locked_by = ? WHERE id = ? AND project_id = ?").run(user.id, revId, projectId);
  logActivity({ projectId, userId: user.id, action: "revision.locked", entityType: "revision", entityId: revId });
  return c.json({ ok: true });
});

// Commit = "costing & proposal build is complete". Afterwards only sell-side
// adjusters (GPM, sell overrides, APL/discounted-sell) stay editable, and
// Professional Services lines can still be added/edited/removed.
projectRoutes.post("/:id/revisions/:revId/commit", (c) => {
  const projectId = Number(c.req.param("id"));
  const revId = Number(c.req.param("revId"));
  const user = c.get("user");
  if (!canAccessProject(user, projectId)) return c.json({ error: "forbidden" }, 403);
  const rev = db.prepare("SELECT * FROM revisions WHERE id = ? AND project_id = ?").get(revId, projectId) as any;
  if (!rev) return c.json({ error: "not found" }, 404);
  if (rev.status === "locked") return c.json({ error: "revision is locked — unlock it first" }, 409);
  if (rev.committed_at) return c.json({ error: "revision is already committed" }, 409);
  db.prepare("UPDATE revisions SET committed_at = datetime('now'), committed_by = ? WHERE id = ?").run(user.id, revId);
  logActivity({ projectId, userId: user.id, action: "revision.committed", entityType: "revision", entityId: revId, details: `${rev.label || "R" + rev.rev_no} — costing & proposal build complete` });
  return c.json({ ok: true });
});

projectRoutes.post("/:id/revisions/:revId/uncommit", (c) => {
  const projectId = Number(c.req.param("id"));
  const revId = Number(c.req.param("revId"));
  const user = c.get("user");
  if (!canAccessProject(user, projectId)) return c.json({ error: "forbidden" }, 403);
  const rev = db.prepare("SELECT * FROM revisions WHERE id = ? AND project_id = ?").get(revId, projectId) as any;
  if (!rev) return c.json({ error: "not found" }, 404);
  if (!rev.committed_at) return c.json({ error: "revision is not committed" }, 409);
  const allowed = user.role === "admin" || user.role === "presales" || rev.committed_by === user.id;
  if (!allowed) return c.json({ error: "only an admin, presales, or the person who committed can un-commit" }, 403);
  db.prepare("UPDATE revisions SET committed_at = NULL, committed_by = NULL WHERE id = ?").run(revId);
  logActivity({ projectId, userId: user.id, action: "revision.uncommitted", entityType: "revision", entityId: revId, details: rev.label || `R${rev.rev_no}` });
  return c.json({ ok: true });
});

projectRoutes.post("/:id/revisions/:revId/unlock", (c) => {
  const projectId = Number(c.req.param("id"));
  const revId = Number(c.req.param("revId"));
  const user = c.get("user");
  if (!canAccessProject(user, projectId)) return c.json({ error: "forbidden" }, 403);
  const rev = db.prepare("SELECT * FROM revisions WHERE id = ? AND project_id = ?").get(revId, projectId) as any;
  if (!rev) return c.json({ error: "not found" }, 404);
  if (rev.status !== "locked") return c.json({ error: "revision is not locked" }, 409);
  if (!canUnlockRevision(user, rev)) {
    return c.json({ error: "only an admin or the person who locked this revision can unlock it" }, 403);
  }
  db.prepare("UPDATE revisions SET status = 'open', locked_by = NULL WHERE id = ?").run(revId);
  logActivity({ projectId, userId: user.id, action: "revision.unlocked", entityType: "revision", entityId: revId });
  return c.json({ ok: true });
});
