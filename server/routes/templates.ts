import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export const templateRoutes = new Hono();
templateRoutes.use("*", requireAuth);

templateRoutes.get("/", (c) => {
  const module = c.req.query("module") || "presales";
  const rows = db
    .prepare("SELECT * FROM templates WHERE module = ? ORDER BY is_default DESC, name")
    .all(module) as any[];
  return c.json(rows.map((r) => ({ ...r, config: JSON.parse(r.config_json || "{}") })));
});

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  config: z.record(z.string(), z.any()).default({}),
});

templateRoutes.post("/", requireRole("admin", "sales", "presales"), async (c) => {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  const res = db
    .prepare("INSERT INTO templates (module, name, description, config_json, created_by) VALUES (?,?,?,?,?)")
    .run("presales", d.name, d.description ?? null, JSON.stringify(d.config), c.get("user").id);
  return c.json({ id: Number(res.lastInsertRowid) }, 201);
});

templateRoutes.put("/:id", requireRole("admin", "sales", "presales"), async (c) => {
  const id = Number(c.req.param("id"));
  const parsed = schema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  if (d.name) db.prepare("UPDATE templates SET name = ? WHERE id = ?").run(d.name, id);
  if (d.description !== undefined) db.prepare("UPDATE templates SET description = ? WHERE id = ?").run(d.description, id);
  if (d.config) db.prepare("UPDATE templates SET config_json = ? WHERE id = ?").run(JSON.stringify(d.config), id);
  return c.json({ ok: true });
});

templateRoutes.post("/:id/set-default", requireRole("admin", "sales", "presales"), (c) => {
  const id = Number(c.req.param("id"));
  db.prepare("UPDATE templates SET is_default = 0 WHERE module = 'presales'").run();
  db.prepare("UPDATE templates SET is_default = 1 WHERE id = ?").run(id);
  return c.json({ ok: true });
});

templateRoutes.delete("/:id", requireRole("admin", "sales", "presales"), (c) => {
  const id = Number(c.req.param("id"));
  const t = db.prepare("SELECT is_default FROM templates WHERE id = ?").get(id) as any;
  if (t?.is_default) return c.json({ error: "cannot delete the default template" }, 400);
  db.prepare("DELETE FROM templates WHERE id = ?").run(id);
  return c.json({ ok: true });
});
