import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, canAccessProject } from "../auth.js";
import { logActivity } from "../audit.js";

export const taskRoutes = new Hono();
taskRoutes.use("*", requireAuth);

const taskSchema = z.object({
  projectId: z.number().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  assigneeId: z.number().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

taskRoutes.post("/", async (c) => {
  const parsed = taskSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  const user = c.get("user");
  if (d.projectId && !canAccessProject(user, d.projectId)) return c.json({ error: "forbidden" }, 403);

  const res = db
    .prepare("INSERT INTO tasks (project_id, title, description, priority, assignee_id, created_by, due_date) VALUES (?,?,?,?,?,?,?)")
    .run(d.projectId ?? null, d.title, d.description ?? null, d.priority, d.assigneeId ?? null, user.id, d.dueDate ?? null);
  logActivity({ projectId: d.projectId ?? null, userId: user.id, action: "task.created", entityType: "task", entityId: Number(res.lastInsertRowid), details: d.title });
  return c.json({ id: Number(res.lastInsertRowid) }, 201);
});

taskRoutes.get("/project/:projectId", (c) => {
  const projectId = Number(c.req.param("projectId"));
  if (!canAccessProject(c.get("user"), projectId)) return c.json({ error: "forbidden" }, 403);
  const rows = db
    .prepare(
      `SELECT t.*, a.display_name AS assignee_name, cb.display_name AS created_by_name
       FROM tasks t
       LEFT JOIN users a ON a.id = t.assignee_id
       JOIN users cb ON cb.id = t.created_by
       WHERE t.project_id = ? ORDER BY t.created_at DESC`
    )
    .all(projectId);
  return c.json(rows);
});

taskRoutes.get("/mine", (c) => {
  const user = c.get("user");
  const rows = db
    .prepare(
      `SELECT t.*, p.name AS project_name, p.code AS project_code
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.assignee_id = ? AND t.status != 'done'
       ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.due_date`
    )
    .all(user.id);
  return c.json(rows);
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assigneeId: z.number().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

taskRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
  if (!task) return c.json({ error: "not found" }, 404);
  const user = c.get("user");
  if (task.project_id && !canAccessProject(user, task.project_id)) return c.json({ error: "forbidden" }, 403);

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  db.prepare(
    `UPDATE tasks SET
      title = COALESCE(?, title), description = COALESCE(?, description),
      status = COALESCE(?, status), priority = COALESCE(?, priority),
      assignee_id = COALESCE(?, assignee_id), due_date = COALESCE(?, due_date),
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(d.title ?? null, d.description ?? null, d.status ?? null, d.priority ?? null, d.assigneeId ?? null, d.dueDate ?? null, id);
  if (d.status) {
    logActivity({ projectId: task.project_id, userId: user.id, action: `task.${d.status === "done" ? "completed" : "status_changed"}`, entityType: "task", entityId: id, details: `${task.title} → ${d.status}` });
  }
  return c.json({ ok: true });
});

taskRoutes.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
  if (!task) return c.json({ error: "not found" }, 404);
  const user = c.get("user");
  if (task.project_id && !canAccessProject(user, task.project_id)) return c.json({ error: "forbidden" }, 403);
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  return c.json({ ok: true });
});
