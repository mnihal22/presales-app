import { Hono } from "hono";
import { db } from "../db.js";
import { requireAuth, canAccessProject } from "../auth.js";
import { computeRow, summarize, calcOptsForProject, type CostingRow } from "../calc.js";

export const activityRoutes = new Hono();
activityRoutes.use("*", requireAuth);

// Shared filter builder for the feed and the CSV export
function buildFilters(c: any) {
  const conds: string[] = [];
  const params: any[] = [];
  const q = (k: string) => c.req.query(k);
  if (q("projectId")) { conds.push("a.project_id = ?"); params.push(Number(q("projectId"))); }
  if (q("userId")) { conds.push("a.user_id = ?"); params.push(Number(q("userId"))); }
  if (q("action")) { conds.push("a.action LIKE ?"); params.push(`${q("action")}%`); }
  if (q("from")) { conds.push("a.created_at >= ?"); params.push(`${q("from")} 00:00:00`); }
  if (q("to")) { conds.push("a.created_at <= ?"); params.push(`${q("to")} 23:59:59`); }
  return { where: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

const FEED_SELECT = `
  SELECT a.*, u.display_name AS user_name, p.name AS project_name, p.code AS project_code
  FROM activity a
  LEFT JOIN users u ON u.id = a.user_id
  LEFT JOIN projects p ON p.id = a.project_id`;

// Global activity feed (filterable)
activityRoutes.get("/", (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
  const { where, params } = buildFilters(c);
  const rows = db.prepare(`${FEED_SELECT} ${where} ORDER BY a.id DESC LIMIT ?`).all(...params, limit);
  return c.json(rows);
});

// Distinct action names for the filter dropdown
activityRoutes.get("/actions", (c) => {
  const rows = db.prepare("SELECT DISTINCT action FROM activity ORDER BY action").all() as any[];
  return c.json(rows.map((r) => r.action));
});

// CSV export of the filtered feed
activityRoutes.get("/export.csv", (c) => {
  const { where, params } = buildFilters(c);
  const rows = db.prepare(`${FEED_SELECT} ${where} ORDER BY a.id DESC LIMIT 5000`).all(...params) as any[];
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    "id,date_time,user,action,project_code,project,entity_type,entity_id,details",
    ...rows.map((a) =>
      [a.id, a.created_at, a.user_name, a.action, a.project_code, a.project_name, a.entity_type, a.entity_id, a.details].map(esc).join(",")),
  ];
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="activity-${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.body(lines.join("\n"));
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

  const whereMember = ""; // all roles see the full pipeline (sales ≈ presales; refine later)
  const params = {};

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

  // Pipeline with commercial values from each active project's latest revision
  const activeProjects = db
    .prepare(
      `SELECT p.id, p.code, p.name, p.status, p.updated_at, cu.name AS customer_name, cu.entity AS customer_entity, u.display_name AS owner_name
       FROM projects p LEFT JOIN customers cu ON cu.id = p.customer_id JOIN users u ON u.id = p.owner_id
       WHERE p.status NOT IN ('won','lost','cancelled')
       ORDER BY p.updated_at DESC`
    )
    .all() as any[];

  let pipelineSale = 0, pipelineGp = 0, pipelineAmcBase = 0;
  const pipeline = activeProjects.map((p) => {
    const rev = db.prepare("SELECT id, project_id FROM revisions WHERE project_id = ? ORDER BY id DESC LIMIT 1").get(p.id) as any;
    let sale = 0, gp = 0, amc = 0;
    if (rev) {
      const items = db.prepare("SELECT * FROM costing_items WHERE revision_id = ?").all(rev.id) as CostingRow[];
      const s = summarize(items.map((it) => computeRow(it, calcOptsForProject(rev.project_id))));
      sale = s.total.sale_aed; gp = s.total.gp_aed; amc = s.amc_basis_sale_aed;
    }
    pipelineSale += sale; pipelineGp += gp; pipelineAmcBase += amc;
    return {
      id: p.id, code: p.code, name: p.name, status: p.status, updated_at: p.updated_at,
      customer_name: p.customer_name, customer_entity: p.customer_entity, owner_name: p.owner_name,
      sale_aed: Math.round(sale), gp_aed: Math.round(gp), gpm: sale ? gp / sale : null,
    };
  });

  // Won / lost totals (won value from latest revision of each won project)
  const wonProjects = db.prepare("SELECT id FROM projects WHERE status = 'won'").all() as any[];
  let wonSale = 0;
  for (const p of wonProjects) {
    const rev = db.prepare("SELECT id, project_id FROM revisions WHERE project_id = ? ORDER BY id DESC LIMIT 1").get(p.id) as any;
    if (!rev) continue;
    const items = db.prepare("SELECT * FROM costing_items WHERE revision_id = ?").all(rev.id) as CostingRow[];
    wonSale += summarize(items.map((it) => computeRow(it, calcOptsForProject(rev.project_id)))).total.sale_aed;
  }
  const lostCount = (db.prepare("SELECT COUNT(*) AS c FROM projects WHERE status = 'lost'").get() as any).c;

  const recentActivity = db
    .prepare(
      `SELECT a.id, a.action, a.details, a.created_at, u.display_name AS user_name, p.code AS project_code, a.project_id
       FROM activity a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN projects p ON p.id = a.project_id
       ORDER BY a.id DESC LIMIT 8`
    )
    .all();

  return c.json({
    totalProjects: totalProjects.c,
    statusCounts,
    workload,
    myOpenTasks: myOpenTasks.c,
    pipeline: pipeline.slice(0, 10),
    pipelineTotals: {
      count: activeProjects.length,
      sale_aed: Math.round(pipelineSale),
      gp_aed: Math.round(pipelineGp),
      gpm: pipelineSale ? pipelineGp / pipelineSale : 0,
      amc_base_aed: Math.round(pipelineAmcBase),
    },
    won: { count: wonProjects.length, sale_aed: Math.round(wonSale) },
    lostCount,
    recentActivity,
  });
});
