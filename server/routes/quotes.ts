import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, canAccessProject } from "../auth.js";
import { logActivity } from "../audit.js";

export const quoteRoutes = new Hono();
quoteRoutes.use("*", requireAuth);

const quoteSchema = z.object({
  projectId: z.number(),
  revisionId: z.number().optional().nullable(),
  vendor: z.string().min(1),
  reference: z.string().optional().nullable(),
  currency: z.string().default("USD"),
  notes: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        description: z.string().min(1),
        partNo: z.string().optional().nullable(),
        qty: z.number().positive(),
        unitPrice: z.number().min(0),
        leadTime: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      })
    )
    .default([]),
});

quoteRoutes.post("/", async (c) => {
  const parsed = quoteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  const user = c.get("user");
  if (!canAccessProject(user, d.projectId)) return c.json({ error: "forbidden" }, 403);

  const tx = db.transaction(() => {
    const res = db
      .prepare("INSERT INTO quotes (project_id, revision_id, vendor, reference, currency, notes, created_by) VALUES (?,?,?,?,?,?,?)")
      .run(d.projectId, d.revisionId ?? null, d.vendor, d.reference ?? null, d.currency, d.notes ?? null, user.id);
    const quoteId = Number(res.lastInsertRowid);
    d.items.forEach((item, i) => {
      db.prepare(
        "INSERT INTO quote_items (quote_id, line_no, description, part_no, qty, unit_price, lead_time, notes) VALUES (?,?,?,?,?,?,?,?)"
      ).run(quoteId, i + 1, item.description, item.partNo ?? null, item.qty, item.unitPrice, item.leadTime ?? null, item.notes ?? null);
    });
    logActivity({ projectId: d.projectId, userId: user.id, action: "quote.created", entityType: "quote", entityId: quoteId, details: `${d.vendor} (${d.items.length} items)` });
    return quoteId;
  });
  const id = tx();
  return c.json({ id }, 201);
});

// List quotes for a project
quoteRoutes.get("/project/:projectId", (c) => {
  const projectId = Number(c.req.param("projectId"));
  if (!canAccessProject(c.get("user"), projectId)) return c.json({ error: "forbidden" }, 403);
  const quotes = db
    .prepare(
      `SELECT q.*, u.display_name AS created_by_name,
        (SELECT COUNT(*) FROM quote_items qi WHERE qi.quote_id = q.id) AS item_count,
        (SELECT COALESCE(SUM(qi.qty * qi.unit_price), 0) FROM quote_items qi WHERE qi.quote_id = q.id) AS total
       FROM quotes q JOIN users u ON u.id = q.created_by
       WHERE q.project_id = ? ORDER BY q.created_at DESC`
    )
    .all(projectId);
  return c.json(quotes);
});

// All quotes across projects — picker for "import quotes from other proposals"
quoteRoutes.get("/all", (c) => {
  const rows = db
    .prepare(
      `SELECT q.id, q.vendor, q.reference, q.currency, q.created_at, q.project_id,
              p.code AS project_code, p.name AS project_name, cu.name AS customer_name,
              (SELECT COUNT(*) FROM quote_items i WHERE i.quote_id = q.id) AS item_count,
              (SELECT COALESCE(SUM(i.qty * i.unit_price), 0) FROM quote_items i WHERE i.quote_id = q.id) AS total
       FROM quotes q JOIN projects p ON p.id = q.project_id LEFT JOIN customers cu ON cu.id = p.customer_id
       ORDER BY q.created_at DESC LIMIT 300`
    )
    .all();
  return c.json(rows);
});

// Copy a quote (with all items) into another project
const copySchema = z.object({ projectId: z.number(), revisionId: z.number().optional().nullable() });

quoteRoutes.post("/:id/copy-to", async (c) => {
  const id = Number(c.req.param("id"));
  const q = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as any;
  if (!q) return c.json({ error: "not found" }, 404);
  const user = c.get("user");
  const parsed = copySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  if (!canAccessProject(user, q.project_id) || !canAccessProject(user, d.projectId))
    return c.json({ error: "forbidden" }, 403);
  if (d.projectId === q.project_id) return c.json({ error: "quote is already in this project" }, 400);
  const srcProject = db.prepare("SELECT code FROM projects WHERE id = ?").get(q.project_id) as any;

  const tx = db.transaction(() => {
    const res = db
      .prepare("INSERT INTO quotes (project_id, revision_id, vendor, reference, currency, notes, created_by) VALUES (?,?,?,?,?,?,?)")
      .run(d.projectId, d.revisionId ?? null, q.vendor, q.reference, q.currency,
        `${q.notes ? q.notes + " · " : ""}Copied from ${srcProject?.code ?? "another project"}`, user.id);
    const newId = Number(res.lastInsertRowid);
    for (const it of db.prepare("SELECT * FROM quote_items WHERE quote_id = ? ORDER BY line_no").all(id) as any[]) {
      db.prepare("INSERT INTO quote_items (quote_id, line_no, description, part_no, qty, unit_price, list_unit_price, extended_buy, lead_time, notes) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .run(newId, it.line_no, it.description, it.part_no, it.qty, it.unit_price, it.list_unit_price, it.extended_buy, it.lead_time, it.notes);
    }
    logActivity({ projectId: d.projectId, userId: user.id, action: "quote.copied_in", entityType: "quote", entityId: newId, details: `${q.vendor} — from ${srcProject?.code}` });
    return newId;
  });
  return c.json({ id: tx() }, 201);
});

quoteRoutes.get("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as any;
  if (!quote) return c.json({ error: "not found" }, 404);
  if (!canAccessProject(c.get("user"), quote.project_id)) return c.json({ error: "forbidden" }, 403);
  const items = db.prepare("SELECT * FROM quote_items WHERE quote_id = ? ORDER BY line_no").all(id);
  return c.json({ quote, items });
});

quoteRoutes.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const quote = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as any;
  if (!quote) return c.json({ error: "not found" }, 404);
  const user = c.get("user");
  if (!canAccessProject(user, quote.project_id)) return c.json({ error: "forbidden" }, 403);
  db.prepare("DELETE FROM quotes WHERE id = ?").run(id);
  logActivity({ projectId: quote.project_id, userId: user.id, action: "quote.deleted", entityType: "quote", entityId: id, details: quote.vendor });
  return c.json({ ok: true });
});
