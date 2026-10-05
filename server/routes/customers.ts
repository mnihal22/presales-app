import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { logActivity } from "../audit.js";

export const customerRoutes = new Hono();
customerRoutes.use("*", requireAuth);

customerRoutes.get("/", (c) => {
  const rows = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id) AS project_count
       FROM customers c ORDER BY c.name`
    )
    .all();
  return c.json(rows);
});

const schema = z.object({
  name: z.string().min(1),
  entity: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

customerRoutes.post("/", requireRole("admin", "sales"), async (c) => {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  const res = db
    .prepare("INSERT INTO customers (name, entity, contact_name, contact_email, contact_phone, notes) VALUES (?,?,?,?,?,?)")
    .run(d.name, d.entity || null, d.contactName || null, d.contactEmail || null, d.contactPhone || null, d.notes || null);
  logActivity({ module: "core", userId: c.get("user").id, action: "customer.created", entityType: "customer", entityId: Number(res.lastInsertRowid), details: d.name });
  return c.json({ id: Number(res.lastInsertRowid) }, 201);
});

customerRoutes.put("/:id", requireRole("admin", "sales"), async (c) => {
  const id = Number(c.req.param("id"));
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  db.prepare(
    "UPDATE customers SET name=?, entity=?, contact_name=?, contact_email=?, contact_phone=?, notes=? WHERE id=?"
  ).run(d.name, d.entity || null, d.contactName || null, d.contactEmail || null, d.contactPhone || null, d.notes || null, id);
  return c.json({ ok: true });
});
