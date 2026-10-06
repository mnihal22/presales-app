import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, canAccessProject } from "../auth.js";
import { logActivity } from "../audit.js";
import { computeRow, summarize, calcOptsForProject, type CostingRow } from "../calc.js";

export const costingRoutes = new Hono();
costingRoutes.use("*", requireAuth);

function revisionWithAccess(revisionId: number, user: any) {
  const rev = db.prepare("SELECT * FROM revisions WHERE id = ?").get(revisionId) as any;
  if (!rev) return { error: [404, "not found"] as const };
  if (!canAccessProject(user, rev.project_id)) return { error: [403, "forbidden"] as const };
  return { rev };
}

// Get the full costing sheet for a revision (with computed columns)
costingRoutes.get("/:revisionId", (c) => {
  const revisionId = Number(c.req.param("revisionId"));
  const { rev, error } = revisionWithAccess(revisionId, c.get("user")) as any;
  if (error) return c.json({ error: error[1] }, error[0]);

  const items = (db
    .prepare("SELECT * FROM costing_items WHERE revision_id = ? ORDER BY sort, id")
    .all(revisionId) as CostingRow[]).map((r) => computeRow(r, calcOptsForProject(rev.project_id)));
  return c.json({ revision: rev, items, summary: summarize(items) });
});

const itemSchema = z.object({
  category: z.string().default("Products (CAPEX)"),
  description: z.string().min(1),
  vendor: z.string().optional().nullable(),
  qty: z.number().positive(),
  unitCost: z.number().min(0),
  marginPct: z.number().min(0).max(99).default(25), // GPM %
  notes: z.string().optional().nullable(),
  quoteItemId: z.number().optional().nullable(),
  sort: z.number().default(0),
  partNo: z.string().optional().nullable(),
  bomQty: z.number().positive().default(1),
  months: z.number().positive().default(1),
  serviceTerms: z.string().optional().nullable(),
  listUnitPrice: z.number().min(0).optional().nullable(),
  partnerDiscountPct: z.number().min(0).max(100).default(0),
  discountedUnitBuyPrice: z.number().min(0).optional().nullable(),
  proposalDescription: z.string().optional().nullable(),
  exchRate: z.number().positive().default(3.68), // default cost currency is USD
  landedFactor: z.number().positive().default(1),
  sellOverride: z.number().min(0).optional().nullable(),
  isAmc: z.boolean().default(false),
  isSwSupport: z.boolean().default(false),
  itemGrouping: z.string().optional().nullable(),
  productGrouping: z.string().optional().nullable(),
  offerGrouping: z.string().optional().nullable(),
  inProposal: z.boolean().default(true),
  mapNo: z.string().optional().nullable(),
  autoMap: z.string().optional().nullable(),
  aplUnitPrice: z.number().min(0).optional().nullable(),
  aplDiscountPct: z.number().min(0).max(100).default(0),
  isAmcBasis: z.boolean().default(false),
  mpgCode: z.string().optional().nullable(),
  rowColor: z.string().optional().nullable(),
  discSellOverride: z.number().min(0).optional().nullable(),
  pricePeriod: z.enum(["monthly", "total"]).default("monthly"),
});

// Patch schema for PUT/bulk — every field optional, NO defaults (zod defaults
// would silently overwrite untouched fields, e.g. in_proposal back to 1).
const itemPatchSchema = z.object({
  category: z.string().optional(),
  description: z.string().min(1).optional(),
  vendor: z.string().optional().nullable(),
  qty: z.number().positive().optional(),
  unitCost: z.number().min(0).optional(),
  marginPct: z.number().min(0).max(99).optional(),
  notes: z.string().optional().nullable(),
  quoteItemId: z.number().optional().nullable(),
  sort: z.number().optional(),
  partNo: z.string().optional().nullable(),
  bomQty: z.number().positive().optional(),
  months: z.number().positive().optional(),
  serviceTerms: z.string().optional().nullable(),
  listUnitPrice: z.number().min(0).optional().nullable(),
  partnerDiscountPct: z.number().min(0).max(100).optional(),
  discountedUnitBuyPrice: z.number().min(0).optional().nullable(),
  proposalDescription: z.string().optional().nullable(),
  exchRate: z.number().positive().optional(),
  landedFactor: z.number().positive().optional(),
  sellOverride: z.number().min(0).optional().nullable(),
  isAmc: z.boolean().optional(),
  isSwSupport: z.boolean().optional(),
  itemGrouping: z.string().optional().nullable(),
  productGrouping: z.string().optional().nullable(),
  offerGrouping: z.string().optional().nullable(),
  inProposal: z.boolean().optional(),
  mapNo: z.string().optional().nullable(),
  autoMap: z.string().optional().nullable(),
  aplUnitPrice: z.number().min(0).optional().nullable(),
  aplDiscountPct: z.number().min(0).max(100).optional(),
  isAmcBasis: z.boolean().optional(),
  mpgCode: z.string().optional().nullable(),
  rowColor: z.string().optional().nullable(),
  discSellOverride: z.number().min(0).optional().nullable(),
  pricePeriod: z.enum(["monthly", "total"]).optional(),
});

const INSERT_COLS = `revision_id, quote_item_id, category, description, vendor, qty, unit_cost, margin_pct, notes, sort,
  part_no, bom_qty, months, service_terms, list_unit_price, partner_discount_pct, discounted_unit_buy_price,
  proposal_description, exch_rate, landed_factor, sell_override, is_amc, is_sw_support,
  item_grouping, product_grouping, offer_grouping, in_proposal, map_no, auto_map, apl_unit_price, apl_discount_pct, is_amc_basis,
  mpg_code, row_color, disc_sell_override, price_period`;

function itemValues(revisionId: number, d: z.infer<typeof itemSchema>) {
  return [
    revisionId, d.quoteItemId ?? null, d.category, d.description, d.vendor ?? null, d.qty, d.unitCost, d.marginPct,
    d.notes ?? null, d.sort, d.partNo ?? null, d.bomQty, d.months, d.serviceTerms ?? null, d.listUnitPrice ?? null,
    d.partnerDiscountPct, d.discountedUnitBuyPrice ?? null, d.proposalDescription ?? null, d.exchRate, d.landedFactor,
    d.sellOverride ?? null, d.isAmc ? 1 : 0, d.isSwSupport ? 1 : 0, d.itemGrouping ?? null, d.productGrouping ?? null,
    d.offerGrouping ?? null, d.inProposal ? 1 : 0, d.mapNo ?? null, d.autoMap ?? null, d.aplUnitPrice ?? null, d.aplDiscountPct, d.isAmcBasis ? 1 : 0,
    d.mpgCode ?? null, d.rowColor ?? null, d.discSellOverride ?? null, d.pricePeriod ?? "monthly",
  ];
}

function assertOpen(rev: any) {
  return rev.status === "open";
}

costingRoutes.post("/:revisionId/items", async (c) => {
  const revisionId = Number(c.req.param("revisionId"));
  const user = c.get("user");
  const { rev, error } = revisionWithAccess(revisionId, user) as any;
  if (error) return c.json({ error: error[1] }, error[0]);
  if (!assertOpen(rev)) return c.json({ error: "revision is locked" }, 409);

  const parsed = itemSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input", issues: parsed.error.issues }, 400);
  const res = db
    .prepare(`INSERT INTO costing_items (${INSERT_COLS}) VALUES (${INSERT_COLS.split(",").map(() => "?").join(",")})`)
    .run(...itemValues(revisionId, parsed.data));
  logActivity({ projectId: rev.project_id, userId: user.id, action: "costing.item_added", entityType: "costing_item", entityId: Number(res.lastInsertRowid), details: parsed.data.description });
  return c.json({ id: Number(res.lastInsertRowid) }, 201);
});

costingRoutes.put("/items/:itemId", async (c) => {
  const itemId = Number(c.req.param("itemId"));
  const item = db.prepare("SELECT * FROM costing_items WHERE id = ?").get(itemId) as any;
  if (!item) return c.json({ error: "not found" }, 404);
  const user = c.get("user");
  const { rev, error } = revisionWithAccess(item.revision_id, user) as any;
  if (error) return c.json({ error: error[1] }, error[0]);
  if (!assertOpen(rev)) return c.json({ error: "revision is locked" }, 409);

  const parsed = itemPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;

  const fieldMap: [string, any, string][] = [
    ["category", d.category, "category"], ["description", d.description, "description"], ["vendor", d.vendor, "vendor"],
    ["qty", d.qty, "qty"], ["unitCost", d.unitCost, "unit_cost"], ["marginPct", d.marginPct, "margin_pct"],
    ["notes", d.notes, "notes"], ["sort", d.sort, "sort"], ["partNo", d.partNo, "part_no"], ["bomQty", d.bomQty, "bom_qty"],
    ["months", d.months, "months"], ["serviceTerms", d.serviceTerms, "service_terms"], ["listUnitPrice", d.listUnitPrice, "list_unit_price"],
    ["partnerDiscountPct", d.partnerDiscountPct, "partner_discount_pct"], ["discountedUnitBuyPrice", d.discountedUnitBuyPrice, "discounted_unit_buy_price"],
    ["proposalDescription", d.proposalDescription, "proposal_description"], ["exchRate", d.exchRate, "exch_rate"],
    ["landedFactor", d.landedFactor, "landed_factor"], ["sellOverride", d.sellOverride, "sell_override"],
    ["isAmc", d.isAmc === undefined ? undefined : d.isAmc ? 1 : 0, "is_amc"],
    ["isSwSupport", d.isSwSupport === undefined ? undefined : d.isSwSupport ? 1 : 0, "is_sw_support"],
    ["itemGrouping", d.itemGrouping, "item_grouping"], ["productGrouping", d.productGrouping, "product_grouping"],
    ["offerGrouping", d.offerGrouping, "offer_grouping"],
    ["inProposal", d.inProposal === undefined ? undefined : d.inProposal ? 1 : 0, "in_proposal"],
    ["mapNo", d.mapNo, "map_no"], ["autoMap", d.autoMap, "auto_map"],
    ["aplUnitPrice", d.aplUnitPrice, "apl_unit_price"], ["aplDiscountPct", d.aplDiscountPct, "apl_discount_pct"],
    ["isAmcBasis", d.isAmcBasis === undefined ? undefined : d.isAmcBasis ? 1 : 0, "is_amc_basis"],
    ["mpgCode", d.mpgCode, "mpg_code"], ["rowColor", d.rowColor, "row_color"], ["discSellOverride", d.discSellOverride, "disc_sell_override"],
    ["pricePeriod", d.pricePeriod, "price_period"],
  ];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const [, v, col] of fieldMap) {
    if (v !== undefined) { sets.push(`${col} = ?`); vals.push(v); }
  }
  if (sets.length) {
    vals.push(itemId);
    db.prepare(`UPDATE costing_items SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }
  return c.json({ ok: true });
});

// --- Bulk update / delete (multi-select in the costing grid) ----------------
const bulkSchema = z.object({
  itemIds: z.array(z.number()).min(1).max(5000),
  fields: itemPatchSchema,
});

costingRoutes.post("/:revisionId/bulk-update", async (c) => {
  const revisionId = Number(c.req.param("revisionId"));
  const user = c.get("user");
  const { rev, error } = revisionWithAccess(revisionId, user) as any;
  if (error) return c.json({ error: error[1] }, error[0]);
  if (!assertOpen(rev)) return c.json({ error: "revision is locked" }, 409);

  const parsed = bulkSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const { itemIds, fields: d } = parsed.data;

  const fieldMap: [any, string][] = [
    [d.category, "category"], [d.vendor, "vendor"], [d.marginPct, "margin_pct"],
    [d.serviceTerms, "service_terms"], [d.partnerDiscountPct, "partner_discount_pct"],
    [d.exchRate, "exch_rate"], [d.landedFactor, "landed_factor"],
    [d.itemGrouping, "item_grouping"], [d.productGrouping, "product_grouping"], [d.offerGrouping, "offer_grouping"],
    [d.isAmc === undefined ? undefined : d.isAmc ? 1 : 0, "is_amc"],
    [d.isSwSupport === undefined ? undefined : d.isSwSupport ? 1 : 0, "is_sw_support"],
    [d.inProposal === undefined ? undefined : d.inProposal ? 1 : 0, "in_proposal"],
    [d.isAmcBasis === undefined ? undefined : d.isAmcBasis ? 1 : 0, "is_amc_basis"],
    [d.mpgCode, "mpg_code"], [d.rowColor, "row_color"], [d.discSellOverride, "disc_sell_override"],
    [d.pricePeriod, "price_period"],
  ];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const [v, col] of fieldMap) {
    if (v !== undefined) { sets.push(`${col} = ?`); vals.push(v); }
  }
  if (!sets.length) return c.json({ error: "no fields to update" }, 400);

  const placeholders = itemIds.map(() => "?").join(",");
  const res = db
    .prepare(`UPDATE costing_items SET ${sets.join(", ")} WHERE revision_id = ? AND id IN (${placeholders})`)
    .run(...vals, revisionId, ...itemIds);
  logActivity({ projectId: rev.project_id, userId: user.id, action: "costing.bulk_updated", entityType: "revision", entityId: revisionId, details: `${res.changes} items: ${sets.join(", ")}` });
  return c.json({ ok: true, updated: res.changes });
});

costingRoutes.post("/:revisionId/bulk-delete", async (c) => {
  const revisionId = Number(c.req.param("revisionId"));
  const user = c.get("user");
  const { rev, error } = revisionWithAccess(revisionId, user) as any;
  if (error) return c.json({ error: error[1] }, error[0]);
  if (!assertOpen(rev)) return c.json({ error: "revision is locked" }, 409);

  const parsed = z.object({ itemIds: z.array(z.number()).min(1).max(5000) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const placeholders = parsed.data.itemIds.map(() => "?").join(",");
  const res = db.prepare(`DELETE FROM costing_items WHERE revision_id = ? AND id IN (${placeholders})`).run(revisionId, ...parsed.data.itemIds);
  logActivity({ projectId: rev.project_id, userId: user.id, action: "costing.bulk_deleted", entityType: "revision", entityId: revisionId, details: `${res.changes} items` });
  return c.json({ ok: true, deleted: res.changes });
});

costingRoutes.delete("/items/:itemId", (c) => {
  const itemId = Number(c.req.param("itemId"));
  const item = db.prepare("SELECT * FROM costing_items WHERE id = ?").get(itemId) as any;
  if (!item) return c.json({ error: "not found" }, 404);
  const user = c.get("user");
  const { rev, error } = revisionWithAccess(item.revision_id, user) as any;
  if (error) return c.json({ error: error[1] }, error[0]);
  if (!assertOpen(rev)) return c.json({ error: "revision is locked" }, 409);
  db.prepare("DELETE FROM costing_items WHERE id = ?").run(itemId);
  return c.json({ ok: true });
});

// Pull selected quote items into the costing sheet
costingRoutes.post("/:revisionId/import-from-quote", async (c) => {
  const revisionId = Number(c.req.param("revisionId"));
  const user = c.get("user");
  const { rev, error } = revisionWithAccess(revisionId, user) as any;
  if (error) return c.json({ error: error[1] }, error[0]);
  if (!assertOpen(rev)) return c.json({ error: "revision is locked" }, 409);

  const parsed = z
    .object({
      quoteItemIds: z.array(z.number()).min(1),
      marginPct: z.number().min(0).max(99).default(25),
      exchRate: z.number().positive().default(1),
      landedFactor: z.number().positive().default(1),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);

  const insert = db.prepare(
    `INSERT INTO costing_items (revision_id, quote_item_id, category, description, vendor, qty, unit_cost, margin_pct, part_no, exch_rate, landed_factor, sort)
     SELECT ?, qi.id, 'Products (CAPEX)', qi.description, q.vendor, qi.qty, qi.unit_price, ?, qi.part_no, ?, ?, qi.line_no
     FROM quote_items qi JOIN quotes q ON q.id = qi.quote_id
     WHERE qi.id = ? AND q.project_id = ?`
  );
  let count = 0;
  const tx = db.transaction(() => {
    for (const qid of parsed.data.quoteItemIds) {
      const r = insert.run(revisionId, parsed.data.marginPct, parsed.data.exchRate, parsed.data.landedFactor, qid, rev.project_id);
      count += r.changes;
    }
  });
  tx();
  logActivity({ projectId: rev.project_id, userId: user.id, action: "costing.imported_from_quote", entityType: "revision", entityId: revisionId, details: `${count} items` });
  return c.json({ imported: count });
});
