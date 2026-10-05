import { Hono } from "hono";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { logActivity } from "../audit.js";

export const userRoutes = new Hono();
userRoutes.use("*", requireAuth);

// Any authenticated user may list active users (needed for assignment pickers)
userRoutes.get("/", (c) => {
  const rows = db
    .prepare("SELECT id, username, display_name, email, role, active, created_at FROM users ORDER BY display_name")
    .all();
  return c.json(rows);
});

const upsertSchema = z.object({
  username: z.string().min(2),
  password: z.string().min(6).optional(),
  displayName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum(["admin", "sales", "presales"]),
});

userRoutes.post("/", requireRole("admin"), async (c) => {
  const parsed = upsertSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  if (!parsed.data.password) return c.json({ error: "password required for new user" }, 400);
  const d = parsed.data;
  try {
    const res = db
      .prepare("INSERT INTO users (username, password_hash, display_name, email, role) VALUES (?,?,?,?,?)")
      .run(d.username, bcrypt.hashSync(d.password, 10), d.displayName, d.email || null, d.role);
    logActivity({ module: "core", userId: c.get("user").id, action: "user.created", entityType: "user", entityId: Number(res.lastInsertRowid), details: d.username });
    return c.json({ id: Number(res.lastInsertRowid) }, 201);
  } catch (e: any) {
    if (String(e.message).includes("UNIQUE")) return c.json({ error: "username already exists" }, 409);
    throw e;
  }
});

userRoutes.put("/:id", requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const parsed = upsertSchema.partial().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!existing) return c.json({ error: "not found" }, 404);

  if (d.displayName) db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(d.displayName, id);
  if (d.email !== undefined) db.prepare("UPDATE users SET email = ? WHERE id = ?").run(d.email || null, id);
  if (d.role) db.prepare("UPDATE users SET role = ? WHERE id = ?").run(d.role, id);
  if (d.password) db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(d.password, 10), id);
  logActivity({ module: "core", userId: c.get("user").id, action: "user.updated", entityType: "user", entityId: id });
  return c.json({ ok: true });
});

userRoutes.post("/:id/toggle-active", requireRole("admin"), (c) => {
  const id = Number(c.req.param("id"));
  if (id === c.get("user").id) return c.json({ error: "cannot deactivate yourself" }, 400);
  db.prepare("UPDATE users SET active = 1 - active WHERE id = ?").run(id);
  return c.json({ ok: true });
});
