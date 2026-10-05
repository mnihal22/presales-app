import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, canAccessProject } from "../auth.js";
import { logActivity } from "../audit.js";
import { computeRow, type CostingRow } from "../calc.js";

export const serviceRoutes = new Hono();
serviceRoutes.use("*", requireAuth);

serviceRoutes.get("/project/:projectId", (c) => {
  const projectId = Number(c.req.param("projectId"));
  if (!canAccessProject(c.get("user"), projectId)) return c.json({ error: "forbidden" }, 403);
  const rows = db
    .prepare(
      `SELECT s.*, u.display_name AS created_by_name
       FROM service_calcs s JOIN users u ON u.id = s.created_by
       WHERE s.project_id = ? ORDER BY s.created_at DESC`
    )
    .all(projectId);
  // Product (CAPEX) landed+ sale totals for the percent method's live preview
  const capex = db
    .prepare(
      `SELECT ci.* FROM costing_items ci
       JOIN revisions r ON r.id = ci.revision_id
       WHERE r.project_id = ? AND ci.category = 'Products (CAPEX)'`
    )
    .all(projectId) as CostingRow[];
  const capexSale = capex.map(computeRow).reduce((s, r) => s + r.selling_total_aed, 0);
  const amcBasis = db
    .prepare(
      `SELECT ci.* FROM costing_items ci
       JOIN revisions r ON r.id = ci.revision_id
       WHERE r.project_id = ? AND ci.is_amc_basis = 1`
    )
    .all(projectId) as CostingRow[];
  const amcBasisSale = amcBasis.map(computeRow).reduce((s, r) => s + (r.sell_price_for_summary || r.landed_total_aed), 0);
  return c.json({ services: rows, capexSaleAed: capexSale, amcBasisSaleAed: amcBasisSale });
});

const schema = z.object({
  projectId: z.number(),
  revisionId: z.number().optional().nullable(),
  name: z.string().min(1),
  method: z.enum(["fixed", "rate", "percent"]),
  rate: z.number().min(0).optional().nullable(),
  effort: z.number().min(0).optional().nullable(),
  effortUnit: z.string().optional().nullable(),
  percent: z.number().min(0).optional().nullable(),
  percentBase: z.enum(["capex", "amc_basis"]).default("capex"),
  amount: z.number().min(0).default(0),
  notes: z.string().optional().nullable(),
});

function computeAmount(d: z.infer<typeof schema>): number {
  if (d.method === "fixed") return d.amount;
  if (d.method === "rate") return (d.rate ?? 0) * (d.effort ?? 0);
  return 0; // percent is computed against the capex total at push time
}

serviceRoutes.post("/", async (c) => {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  const user = c.get("user");
  if (!canAccessProject(user, d.projectId)) return c.json({ error: "forbidden" }, 403);

  const res = db
    .prepare(
      `INSERT INTO service_calcs (project_id, revision_id, name, method, rate, effort, effort_unit, percent, percent_base, amount, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(d.projectId, d.revisionId ?? null, d.name, d.method, d.rate ?? null, d.effort ?? null, d.effortUnit ?? null, d.percent ?? null, d.percentBase, computeAmount(d), d.notes ?? null, user.id);
  logActivity({ projectId: d.projectId, userId: user.id, action: "service.created", entityType: "service_calc", entityId: Number(res.lastInsertRowid), details: d.name });
  return c.json({ id: Number(res.lastInsertRowid) }, 201);
});

serviceRoutes.put("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const svc = db.prepare("SELECT * FROM service_calcs WHERE id = ?").get(id) as any;
  if (!svc) return c.json({ error: "not found" }, 404);
  if (!canAccessProject(c.get("user"), svc.project_id)) return c.json({ error: "forbidden" }, 403);
  const parsed = schema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  const merged = { ...svc, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) };
  db.prepare(
    `UPDATE service_calcs SET name=?, method=?, rate=?, effort=?, effort_unit=?, percent=?, percent_base=?, amount=?, notes=? WHERE id=?`
  ).run(merged.name, merged.method, merged.rate, merged.effort, merged.effortUnit ?? merged.effort_unit, merged.percent, merged.percentBase ?? merged.percent_base ?? "capex", computeAmount(merged as any), merged.notes, id);
  return c.json({ ok: true });
});

serviceRoutes.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const svc = db.prepare("SELECT * FROM service_calcs WHERE id = ?").get(id) as any;
  if (!svc) return c.json({ error: "not found" }, 404);
  if (!canAccessProject(c.get("user"), svc.project_id)) return c.json({ error: "forbidden" }, 403);
  db.prepare("DELETE FROM service_calcs WHERE id = ?").run(id);
  return c.json({ ok: true });
});

// Push a service calculation into a revision's costing sheet as a line item
serviceRoutes.post("/:id/push", async (c) => {
  const id = Number(c.req.param("id"));
  const svc = db.prepare("SELECT * FROM service_calcs WHERE id = ?").get(id) as any;
  if (!svc) return c.json({ error: "not found" }, 404);
  const user = c.get("user");
  if (!canAccessProject(user, svc.project_id)) return c.json({ error: "forbidden" }, 403);

  const parsed = z.object({
    revisionId: z.number(),
    category: z.enum(["Professional Services", "AMC"]).default("Professional Services"),
    marginPct: z.number().min(0).max(99).default(25),
  }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);

  const rev = db.prepare("SELECT * FROM revisions WHERE id = ? AND project_id = ?").get(parsed.data.revisionId, svc.project_id) as any;
  if (!rev) return c.json({ error: "revision not found in this project" }, 404);
  if (rev.status !== "open") return c.json({ error: "revision is locked" }, 409);

  let amount = Number(svc.amount);
  if (svc.method === "percent") {
    let baseSale: number;
    if ((svc.percent_base ?? "capex") === "amc_basis") {
      // % of all AMC-basis items (new + legacy equipment covered by the AMC)
      const rows = db
        .prepare("SELECT * FROM costing_items WHERE revision_id = ? AND is_amc_basis = 1")
        .all(rev.id) as CostingRow[];
      baseSale = rows.map(computeRow).reduce((s, r) => s + (r.sell_price_for_summary || r.landed_total_aed), 0);
    } else {
      const capex = db
        .prepare("SELECT * FROM costing_items WHERE revision_id = ? AND category = 'Products (CAPEX)'")
        .all(rev.id) as CostingRow[];
      baseSale = capex.map(computeRow).reduce((s, r) => s + r.selling_total_aed, 0);
    }
    // cost base for a % service is the chosen sale value; the service's buy cost
    amount = (baseSale * Number(svc.percent || 0)) / 100;
  }

  const res = db
    .prepare(
      `INSERT INTO costing_items (revision_id, category, description, qty, unit_cost, margin_pct, notes, sort)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(rev.id, parsed.data.category, svc.name, 1, amount, parsed.data.marginPct, svc.notes ?? null, 9000);
  const itemId = Number(res.lastInsertRowid);
  db.prepare("UPDATE service_calcs SET costing_item_id = ?, revision_id = ?, amount = ? WHERE id = ?").run(itemId, rev.id, amount, id);
  logActivity({ projectId: svc.project_id, userId: user.id, action: "service.pushed_to_costing", entityType: "service_calc", entityId: id, details: `${svc.name} → ${rev.label}` });
  return c.json({ costingItemId: itemId, amount });
});
