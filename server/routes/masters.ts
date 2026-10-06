import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, moduleRoleAtLeast } from "../auth.js";
import { logActivity } from "../audit.js";

// ---------------------------------------------------------------------------
// Global reusable masters: service rate card, support types (AMC %),
// vendor MPG discount tables (171H). Readable by everyone; writable by
// global admins and presales-module managers/admins.
// ---------------------------------------------------------------------------

export const masterRoutes = new Hono();
masterRoutes.use("*", requireAuth);

function canWrite(user: any): boolean {
  return user.role === "admin" || moduleRoleAtLeast(user, "presales", "manager");
}

const rateSchema = z.object({ code: z.string().min(1), description: z.string().optional().nullable(), rateAed: z.number().min(0) });
const entitySchema = z.object({ name: z.string().min(1) });
const supportSchema = z.object({ name: z.string().min(1), amcPct: z.number() });
const mpgSchema = z.object({
  vendor: z.string().min(1),
  mpg: z.string().min(1),
  category: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  discountPct: z.number(),
});

const TABLES: Record<string, { table: string; schema: z.ZodTypeAny; cols: (d: any) => [string[], any[]] }> = {
  "rate-card": {
    table: "rate_card",
    schema: rateSchema,
    cols: (d) => [["code", "description", "rate_aed"], [d.code, d.description ?? null, d.rateAed]],
  },
  "support-types": {
    table: "support_types",
    schema: supportSchema,
    cols: (d) => [["name", "amc_pct"], [d.name, d.amcPct]],
  },
  "mpg-discounts": {
    table: "mpg_discounts",
    schema: mpgSchema,
    cols: (d) => [["vendor", "mpg", "category", "type", "discount_pct"], [d.vendor, d.mpg, d.category ?? null, d.type ?? null, d.discountPct]],
  },
  entities: {
    table: "entities",
    schema: entitySchema,
    cols: (d) => [["name"], [d.name]],
  },
};

masterRoutes.get("/:kind", (c) => {
  const t = TABLES[c.req.param("kind")];
  if (!t) return c.json({ error: "unknown master" }, 404);
  const orderBy = t.table === "mpg_discounts" ? "vendor, mpg" : t.table === "rate_card" ? "code" : "name";
  return c.json(db.prepare(`SELECT * FROM ${t.table} ORDER BY ${orderBy}`).all());
});

masterRoutes.post("/:kind", async (c) => {
  const user = c.get("user");
  if (!canWrite(user)) return c.json({ error: "forbidden" }, 403);
  const t = TABLES[c.req.param("kind")];
  if (!t) return c.json({ error: "unknown master" }, 404);
  const parsed = t.schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const [cols, vals] = t.cols(parsed.data);
  try {
    const res = db.prepare(`INSERT INTO ${t.table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...vals);
    logActivity({ module: "core", userId: user.id, action: "master.created", entityType: t.table, entityId: Number(res.lastInsertRowid), details: String(vals[0]) });
    return c.json({ id: Number(res.lastInsertRowid) }, 201);
  } catch (e: any) {
    if (String(e.message).includes("UNIQUE")) return c.json({ error: "duplicate entry" }, 409);
    throw e;
  }
});

masterRoutes.put("/:kind/:id", async (c) => {
  const user = c.get("user");
  if (!canWrite(user)) return c.json({ error: "forbidden" }, 403);
  const t = TABLES[c.req.param("kind")];
  if (!t) return c.json({ error: "unknown master" }, 404);
  const parsed = t.schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const [cols, vals] = t.cols(parsed.data);
  db.prepare(`UPDATE ${t.table} SET ${cols.map((x) => `${x} = ?`).join(", ")} WHERE id = ?`).run(...vals, Number(c.req.param("id")));
  return c.json({ ok: true });
});

masterRoutes.delete("/:kind/:id", (c) => {
  const user = c.get("user");
  if (!canWrite(user)) return c.json({ error: "forbidden" }, 403);
  const t = TABLES[c.req.param("kind")];
  if (!t) return c.json({ error: "unknown master" }, 404);
  db.prepare(`DELETE FROM ${t.table} WHERE id = ?`).run(Number(c.req.param("id")));
  return c.json({ ok: true });
});

// Lookup: 171H APL discount for a vendor+MPG (helper only — never mandatory)
masterRoutes.get("/mpg-discounts/lookup/:vendor/:mpg", (c) => {
  const row = db
    .prepare("SELECT * FROM mpg_discounts WHERE vendor = ? AND UPPER(mpg) = UPPER(?)")
    .get(c.req.param("vendor"), c.req.param("mpg"));
  return c.json(row ? { found: true, ...(row as object) } : { found: false });
});
