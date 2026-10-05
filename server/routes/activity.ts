import { Hono } from "hono";
import { db } from "../db.js";
import { requireAuth, canAccessProject } from "../auth.js";

export const activityRoutes = new Hono();
activityRoutes.use("*", requireAuth);

// Global activity feed (role-scoped for presales)
activityRoutes.get("/", (c) => {
  const user = c.get("user");
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  let rows;
  const base = `
    SELECT a.*, u.display_name AS user_name, p.name AS project_name, p.code AS project_code
    FROM activity a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN projects p ON p.id = a.project_id`;
  if (user.role === "presales") {
    rows = db
      .prepare(`${base} WHERE a.project_id IS NULL OR a.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?) ORDER BY a.id DESC LIMIT ?`)
      .all(user.id, limit);
  } else {
    rows = db.prepare(`${base} ORDER BY a.id DESC LIMIT ?`).all(limit);
  }
  return c.json(rows);
});

activityRoutes.get("/project/:projectId", (c) => {
  const projectId = Number(c.req.param("projectId"));
  if (!canAccessProject(c.get("user"), projectId)) return c.json({ error: "forbidden" }, 403);
  const rows = db
    .prepare(
      `SELECT a.*, u.display_name AS user_name
       FROM activity a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.project_id = ? ORDER BY a.id DESC LIMIT 100`
    )
    .all(projectId);
  return c.json(rows);
});

// Dashboard summary
activityRoutes.get("/dashboard", (c) => {
  const user = c.get("user");

  const whereMember = user.role === "presales" ? "AND p.id IN (SELECT project_id FROM project_members WHERE user_id = @uid)" : "";
  const params = user.role === "presales" ? { uid: user.id } : {};

  const statusCounts = db
    .prepare(`SELECT p.status, COUNT(*) AS count FROM projects p WHERE 1=1 ${whereMember} GROUP BY p.status`)
    .all(params);
  const totalProjects = db
    .prepare(`SELECT COUNT(*) AS c FROM projects p WHERE 1=1 ${whereMember}`)
    .get(params) as any;

  // Who is working on what: open tasks joined with projects and assignees
  const workload = db
    .prepare(
      `SELECT u.id, u.display_name, u.role,
              COUNT(t.id) AS open_tasks,
              GROUP_CONCAT(DISTINCT p.code) AS project_codes
       FROM users u
       LEFT JOIN tasks t ON t.assignee_id = u.id AND t.status IN ('todo','in_progress','blocked')
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE u.active = 1
       GROUP BY u.id ORDER BY open_tasks DESC`
    )
    .all();

  const myOpenTasks = db
    .prepare("SELECT COUNT(*) AS c FROM tasks WHERE assignee_id = ? AND status != 'done'")
    .get(user.id) as any;

  const pipeline = db
    .prepare(
      `SELECT p.id, p.code, p.name, p.status, p.updated_at, cu.name AS customer_name, u.display_name AS owner_name
       FROM projects p LEFT JOIN customers cu ON cu.id = p.customer_id JOIN users u ON u.id = p.owner_id
       WHERE p.status NOT IN ('won','lost','cancelled') ${whereMember}
       ORDER BY p.updated_at DESC LIMIT 10`
    )
    .all(params);

  return c.json({
    totalProjects: totalProjects.c,
    statusCounts,
    workload,
    myOpenTasks: myOpenTasks.c,
    pipeline,
  });
});
