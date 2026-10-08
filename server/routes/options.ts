import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, canAccessProject } from "../auth.js";
import { logActivity } from "../audit.js";
import { computeRow, calcOptsForProject, type CostingRow } from "../calc.js";

export const optionRoutes = new Hono();
optionRoutes.use("*", requireAuth);

// List options for a project (with item counts)
optionRoutes.get("/project/:projectId", (c) => {
  const projectId = Number(c.req.param("projectId"));
  if (!canAccessProject(c.get("user"), projectId)) return c.json({ error: "forbidden" }, 403);
  const rows = db
    .prepare(
      `SELECT po.*, t.name AS template_name, u.display_name AS created_by_name,
        (SELECT COUNT(*) FROM option_items oi WHERE oi.option_id = po.id) AS item_count
       FROM proposal_options po
       LEFT JOIN templates t ON t.id = po.template_id
       JOIN users u ON u.id = po.created_by
       WHERE po.project_id = ? ORDER BY po.created_at`
    )
    .all(projectId);
  return c.json(rows);
});

const schema = z.object({
  projectId: z.number(),
  revisionId: z.number(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  templateId: z.number().optional().nullable(),
  itemIds: z.array(z.number()).default([]),
  // Rich per-item proposal metadata: custom section header + customer-facing redraft
  items: z.array(z.object({
    id: z.number(),
    section: z.string().optional().nullable(),
    customDescription: z.string().optional().nullable(),
  })).optional(),
  discountMode: z.boolean().optional(),
  currency: z.enum(["AED", "USD"]).optional(),
  discountDisplay: z.enum(["lumpsum", "line_item"]).optional(),
  priceView: z.enum(["unit", "monthly", "yearly", "total"]).optional(),
});

function insertOptionItems(optionId: number, d: { itemIds: number[]; items?: { id: number; section?: string | null; customDescription?: string | null }[] }) {
  if (d.items) {
    const ins = db.prepare("INSERT OR REPLACE INTO option_items (option_id, costing_item_id, section, custom_description) VALUES (?,?,?,?)");
    for (const it of d.items) ins.run(optionId, it.id, it.section?.trim() || null, it.customDescription?.trim() || null);
  } else {
    for (const itemId of d.itemIds) {
      db.prepare("INSERT OR IGNORE INTO option_items (option_id, costing_item_id) VALUES (?,?)").run(optionId, itemId);
    }
  }
}

optionRoutes.post("/", async (c) => {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  const user = c.get("user");
  if (!canAccessProject(user, d.projectId)) return c.json({ error: "forbidden" }, 403);

  const tx = db.transaction(() => {
    const res = db
      .prepare("INSERT INTO proposal_options (project_id, revision_id, name, description, template_id, discount_mode, currency, discount_display, price_view, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(d.projectId, d.revisionId, d.name, d.description ?? null, d.templateId ?? null, d.discountMode ? 1 : 0, d.currency ?? "AED", d.discountDisplay ?? "lumpsum", d.priceView ?? "unit", user.id);
    const optionId = Number(res.lastInsertRowid);
    insertOptionItems(optionId, d);
    logActivity({ projectId: d.projectId, userId: user.id, action: "option.created", entityType: "proposal_option", entityId: optionId, details: d.name });
    return optionId;
  });
  return c.json({ id: tx() }, 201);
});

optionRoutes.get("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const opt = db.prepare("SELECT * FROM proposal_options WHERE id = ?").get(id) as any;
  if (!opt) return c.json({ error: "not found" }, 404);
  if (!canAccessProject(c.get("user"), opt.project_id)) return c.json({ error: "forbidden" }, 403);
  const linkRows = db.prepare("SELECT costing_item_id, section, custom_description FROM option_items WHERE option_id = ?").all(id) as any[];
  return c.json({
    option: opt,
    itemIds: linkRows.map((r) => r.costing_item_id),
    items: linkRows.map((r) => ({ id: r.costing_item_id, section: r.section, customDescription: r.custom_description })),
  });
});

const updateSchema = schema.partial().omit({ projectId: true, revisionId: true });

optionRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const opt = db.prepare("SELECT * FROM proposal_options WHERE id = ?").get(id) as any;
  if (!opt) return c.json({ error: "not found" }, 404);
  const user = c.get("user");
  if (!canAccessProject(user, opt.project_id)) return c.json({ error: "forbidden" }, 403);

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  if (d.name) db.prepare("UPDATE proposal_options SET name = ? WHERE id = ?").run(d.name, id);
  if (d.description !== undefined) db.prepare("UPDATE proposal_options SET description = ? WHERE id = ?").run(d.description ?? null, id);
  if (d.templateId !== undefined) db.prepare("UPDATE proposal_options SET template_id = ? WHERE id = ?").run(d.templateId ?? null, id);
  if (d.discountMode !== undefined) db.prepare("UPDATE proposal_options SET discount_mode = ? WHERE id = ?").run(d.discountMode ? 1 : 0, id);
  if (d.currency !== undefined) db.prepare("UPDATE proposal_options SET currency = ? WHERE id = ?").run(d.currency, id);
  if (d.discountDisplay !== undefined) db.prepare("UPDATE proposal_options SET discount_display = ? WHERE id = ?").run(d.discountDisplay, id);
  if (d.priceView !== undefined) db.prepare("UPDATE proposal_options SET price_view = ? WHERE id = ?").run(d.priceView, id);
  if (d.items || d.itemIds) {
    db.prepare("DELETE FROM option_items WHERE option_id = ?").run(id);
    insertOptionItems(id, d as any);
  }
  logActivity({ projectId: opt.project_id, userId: user.id, action: "option.updated", entityType: "proposal_option", entityId: id, details: d.name });
  return c.json({ ok: true });
});

// Reverse-engineer a uniform GPM from a target total sale value for the option.
// Rows with fixed pricing (sell override or 171H/APL-DDP) don't move; the GPM
// is solved against the remaining free rows: target = fixedSale + landedFree/(1−GPM).
optionRoutes.post("/:id/target-gpm", async (c) => {
  const id = Number(c.req.param("id"));
  const opt = db.prepare("SELECT * FROM proposal_options WHERE id = ?").get(id) as any;
  if (!opt) return c.json({ error: "not found" }, 404);
  const user = c.get("user");
  if (!canAccessProject(user, opt.project_id)) return c.json({ error: "forbidden" }, 403);

  const parsed = z.object({ targetSale: z.number().positive(), apply: z.boolean().optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const { targetSale, apply } = parsed.data;

  const rows = (db
    .prepare(
      `SELECT ci.* FROM costing_items ci
       JOIN option_items oi ON oi.costing_item_id = ci.id
       WHERE oi.option_id = ? ORDER BY ci.sort, ci.id`
    )
    .all(id) as CostingRow[]).map((r) => computeRow(r, calcOptsForProject(opt.project_id)));

  // legacy AMC-only rows carry no sale value in the proposal — ignore them
  const commercial = rows.filter((r) => !(r.is_amc_basis && !r.in_proposal));
  const isFixed = (r: CostingRow) => r.sell_override != null || r.apl_unit_price != null;
  const fixed = commercial.filter(isFixed);
  const free = commercial.filter((r) => !isFixed(r));

  const currentSale = commercial.reduce((s, r) => s + r.sell_price_for_summary, 0);
  const fixedSale = fixed.reduce((s, r) => s + r.sell_price_for_summary, 0);
  const landedFree = free.reduce((s, r) => s + r.landed_total_aed, 0);

  const room = targetSale - fixedSale;
  if (room <= 0) return c.json({ error: "Target is at or below the fixed-price rows' total — no GPM can achieve it." }, 400);
  if (free.length === 0) return c.json({ error: "Every row in this option has fixed pricing (sell override or APL/DDP) — nothing to adjust." }, 400);
  const impliedGpm = 1 - landedFree / room;
  if (impliedGpm < 0) return c.json({ error: `Target is below the landed cost of the adjustable rows (${Math.round(landedFree).toLocaleString()} AED).`, currentSale, fixedSale, landedFree }, 400);

  const result: any = {
    currentSale, fixedSale, landedFree,
    freeCount: free.length, fixedCount: fixed.length,
    impliedGpmPct: impliedGpm * 100,
  };

  if (apply) {
    const rev = db.prepare("SELECT * FROM revisions WHERE id = ?").get(opt.revision_id) as any;
    if (!rev || rev.status !== "open") return c.json({ error: "revision is locked — unlock it to apply a target GPM" }, 409);
    const stmt = db.prepare("UPDATE costing_items SET margin_pct = ? WHERE id = ?");
    const tx = db.transaction(() => { for (const r of free) stmt.run(impliedGpm * 100, r.id); });
    tx();
    logActivity({ projectId: opt.project_id, userId: user.id, action: "option.target_gpm_applied", entityType: "proposal_option", entityId: id, details: `${opt.name}: GPM ${(impliedGpm * 100).toFixed(2)}% on ${free.length} rows toward target ${targetSale}` });
    // recompute to show the achieved total (rounding may shift it slightly)
    const after = (db
      .prepare(
        `SELECT ci.* FROM costing_items ci
         JOIN option_items oi ON oi.costing_item_id = ci.id
         WHERE oi.option_id = ?`
      )
      .all(id) as CostingRow[]).map((r) => computeRow(r, calcOptsForProject(opt.project_id)))
      .filter((r) => !(r.is_amc_basis && !r.in_proposal));
    result.applied = true;
    result.achievedSale = after.reduce((s, r) => s + r.sell_price_for_summary, 0);
  }

  return c.json(result);
});

optionRoutes.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const opt = db.prepare("SELECT * FROM proposal_options WHERE id = ?").get(id) as any;
  if (!opt) return c.json({ error: "not found" }, 404);
  if (!canAccessProject(c.get("user"), opt.project_id)) return c.json({ error: "forbidden" }, 403);
  db.prepare("DELETE FROM proposal_options WHERE id = ?").run(id);
  logActivity({ projectId: opt.project_id, userId: c.get("user").id, action: "option.deleted", entityType: "proposal_option", entityId: id, details: opt.name });
  return c.json({ ok: true });
});
