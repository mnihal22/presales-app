import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Context, Next } from "hono";
import { db } from "./db.js";

export const JWT_SECRET =
  process.env.JWT_SECRET || "change-me-in-production-" + Math.random().toString(36).slice(2);

if (!process.env.JWT_SECRET) {
  console.warn("[auth] JWT_SECRET not set — set it in the environment for stable sessions across restarts");
}

export type Role = "admin" | "sales" | "presales";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  role: Role;
}

// ---------------------------------------------------------------------------
// Pluggable authentication provider. Today: local SQLite accounts.
// Later: implement AuthProvider for LDAP / Active Directory and switch via
// AUTH_PROVIDER=ldap — no other code changes needed.
// ---------------------------------------------------------------------------
export interface AuthProvider {
  name: string;
  authenticate(username: string, password: string): Promise<AuthUser | null>;
}

const localProvider: AuthProvider = {
  name: "local",
  async authenticate(username, password) {
    const row = db
      .prepare("SELECT * FROM users WHERE username = ? AND active = 1")
      .get(username) as any;
    if (!row) return null;
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return null;
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      role: row.role,
    };
  },
};

export function getAuthProvider(): AuthProvider {
  // Future: if (process.env.AUTH_PROVIDER === "ldap") return ldapProvider;
  return localProvider;
}

// ---------------------------------------------------------------------------
// JWT helpers + middleware
// ---------------------------------------------------------------------------
export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: "12h" });
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return c.json({ error: "unauthorized" }, 401);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: number };
    const row = db
      .prepare("SELECT id, username, display_name, email, role FROM users WHERE id = ? AND active = 1")
      .get(payload.sub) as any;
    if (!row) return c.json({ error: "unauthorized" }, 401);
    c.set("user", {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      role: row.role,
    });
    await next();
  } catch {
    return c.json({ error: "unauthorized" }, 401);
  }
}

export function requireRole(...roles: Role[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    if (!roles.includes(user.role)) return c.json({ error: "forbidden" }, 403);
    await next();
  };
}

/** Admins and sales can see all projects; presales only projects they are a member of. */
export function canAccessProject(user: AuthUser, projectId: number): boolean {
  if (user.role === "admin" || user.role === "sales") return true;
  const row = db
    .prepare("SELECT 1 AS ok FROM project_members WHERE project_id = ? AND user_id = ?")
    .get(projectId, user.id);
  return !!row;
}
