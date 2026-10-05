import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, requireRole, canAccessProject } from "../auth.js";
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
  const user = c.get("user");
  let rows;
  const base = `
    SELECT p.*, cu.name AS customer_name, u.display_name AS owner_name,
      (SELECT COUNT(*) FROM revisions r WHERE r.project_id = p.id) AS revision_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status != 'done') AS open_tasks
    FROM projects p
    LEFT JOIN customers cu ON cu.id = p.customer_id
    JOIN users u ON u.id = p.owner_id`;
  if (user.role === "presales") {
    rows = db
      .prepare(`${base} JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ? ORDER BY p.updated_at DESC`)
      .all(user.id);
  } else {
    rows = db.prepare(`${base} ORDER BY p.updated_at DESC`).all();
  }
  return c.json(rows);
});

// --- Create project (sales / admin) -----------------------------------------
const createSchema = z.object({
  name: z.string().min(1),
  customerId: z.number().optional().nullable(),
  description: z.string().optional().nullable(),
  memberIds: z.array(z.number()).default([]),
});

projectRoutes.post("/", requireRole("admin", "sales"), async (c) => {
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
    .prepare("SELECT r.*, u.display_name AS created_by_name FROM revisions r JOIN users u ON u.id = r.created_by WHERE r.project_id = ? ORDER BY r.rev_no DESC")
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
});

projectRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");
  if (!canAccessProject(user, id)) return c.json({ error: "forbidden" }, 403);
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  // Only sales/admin may change status or membership
  if ((d.status || d.memberIds) && user.role === "presales") return c.json({ error: "forbidden" }, 403);

  if (d.name) db.prepare("UPDATE projects SET name = ? WHERE id = ?").run(d.name, id);
  if (d.customerId !== undefined) db.prepare("UPDATE projects SET customer_id = ? WHERE id = ?").run(d.customerId, id);
  if (d.description !== undefined) db.prepare("UPDATE projects SET description = ? WHERE id = ?").run(d.description, id);
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

// --- Revisions ---------------------------------------------------------------
projectRoutes.post("/:id/revisions", (c) => {
  const projectId = Number(c.req.param("id"));
  const user = c.get("user");
  if (!canAccessProject(user, projectId)) return c.json({ error: "forbidden" }, 403);

  const tx = db.transaction(() => {
    const latest = db
      .prepare("SELECT MAX(rev_no) AS m FROM revisions WHERE project_id = ?")
      .get(projectId) as any;
    const revNo = (latest?.m || 0) + 1;
    const res = db
      .prepare("INSERT INTO revisions (project_id, rev_no, label, created_by) VALUES (?,?,?,?)")
      .run(projectId, revNo, `R${revNo}`, user.id);
    const newRevId = Number(res.lastInsertRowid);
    // Carry forward costing items from the previous revision
    const prev = db
      .prepare("SELECT id FROM revisions WHERE project_id = ? AND rev_no = ?")
      .get(projectId, revNo - 1) as any;
    if (prev) {
      db.prepare(
        `INSERT INTO costing_items (revision_id, quote_item_id, category, description, vendor, qty, unit_cost, margin_pct, notes, sort)
         SELECT ?, quote_item_id, category, description, vendor, qty, unit_cost, margin_pct, notes, sort
         FROM costing_items WHERE revision_id = ?`
      ).run(newRevId, prev.id);
    }
    logActivity({ projectId, userId: user.id, action: "revision.created", entityType: "revision", entityId: newRevId, details: `R${revNo}` });
    return newRevId;
  });
  const id = tx();
  return c.json({ id }, 201);
});

projectRoutes.post("/:id/revisions/:revId/lock", (c) => {
  const projectId = Number(c.req.param("id"));
  const revId = Number(c.req.param("revId"));
  if (!canAccessProject(c.get("user"), projectId)) return c.json({ error: "forbidden" }, 403);
  db.prepare("UPDATE revisions SET status = 'locked' WHERE id = ? AND project_id = ?").run(revId, projectId);
  logActivity({ projectId, userId: c.get("user").id, action: "revision.locked", entityType: "revision", entityId: revId });
  return c.json({ ok: true });
});
