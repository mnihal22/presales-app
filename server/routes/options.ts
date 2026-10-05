import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, canAccessProject } from "../auth.js";
import { logActivity } from "../audit.js";

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
});

optionRoutes.post("/", async (c) => {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  const user = c.get("user");
  if (!canAccessProject(user, d.projectId)) return c.json({ error: "forbidden" }, 403);

  const tx = db.transaction(() => {
    const res = db
      .prepare("INSERT INTO proposal_options (project_id, revision_id, name, description, template_id, created_by) VALUES (?,?,?,?,?,?)")
      .run(d.projectId, d.revisionId, d.name, d.description ?? null, d.templateId ?? null, user.id);
    const optionId = Number(res.lastInsertRowid);
    for (const itemId of d.itemIds) {
      db.prepare("INSERT OR IGNORE INTO option_items (option_id, costing_item_id) VALUES (?,?)").run(optionId, itemId);
    }
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
  const itemIds = (db.prepare("SELECT costing_item_id FROM option_items WHERE option_id = ?").all(id) as any[]).map((r) => r.costing_item_id);
  return c.json({ option: opt, itemIds });
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
  if (d.itemIds) {
    db.prepare("DELETE FROM option_items WHERE option_id = ?").run(id);
    for (const itemId of d.itemIds) {
      db.prepare("INSERT OR IGNORE INTO option_items (option_id, costing_item_id) VALUES (?,?)").run(id, itemId);
    }
  }
  logActivity({ projectId: opt.project_id, userId: user.id, action: "option.updated", entityType: "proposal_option", entityId: id, details: d.name });
  return c.json({ ok: true });
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
