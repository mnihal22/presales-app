import { Hono } from "hono";
import { db } from "../db.js";
import { requireAuth, canAccessProject } from "../auth.js";
import { computeRow, summarize, calcOptsForProject, type CostingRow } from "../calc.js";

export const summaryRoutes = new Hono();
summaryRoutes.use("*", requireAuth);

// Summary for a revision: buy FCR / landed AED / GP / GPM / sale per category
summaryRoutes.get("/revision/:revisionId", (c) => {
  const revisionId = Number(c.req.param("revisionId"));
  const rev = db.prepare("SELECT * FROM revisions WHERE id = ?").get(revisionId) as any;
  if (!rev) return c.json({ error: "not found" }, 404);
  if (!canAccessProject(c.get("user"), rev.project_id)) return c.json({ error: "forbidden" }, 403);

  const rows = (db
    .prepare("SELECT * FROM costing_items WHERE revision_id = ? ORDER BY sort, id")
    .all(revisionId) as CostingRow[]).map((r) => computeRow(r, calcOptsForProject(rev.project_id)));

  const project = db
    .prepare(`SELECT p.code, p.name, cu.name AS customer_name FROM projects p LEFT JOIN customers cu ON cu.id = p.customer_id WHERE p.id = ?`)
    .get(rev.project_id);

  return c.json({ project, revision: rev, ...summarize(rows), itemCount: rows.length });
});

// Summary for a proposal option (only items assigned to that option)
summaryRoutes.get("/option/:optionId", (c) => {
  const optionId = Number(c.req.param("optionId"));
  const opt = db.prepare("SELECT * FROM proposal_options WHERE id = ?").get(optionId) as any;
  if (!opt) return c.json({ error: "not found" }, 404);
  if (!canAccessProject(c.get("user"), opt.project_id)) return c.json({ error: "forbidden" }, 403);

  const rows = (db
    .prepare(
      `SELECT ci.* FROM costing_items ci
       JOIN option_items oi ON oi.costing_item_id = ci.id
       WHERE oi.option_id = ? ORDER BY ci.sort, ci.id`
    )
    .all(optionId) as CostingRow[]).map((r) => computeRow(r, calcOptsForProject(opt.project_id)));

  return c.json({ option: opt, ...summarize(rows), itemCount: rows.length });
});
