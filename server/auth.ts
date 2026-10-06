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
    const payload = jwt.verify(token, JWT_SECRET) as unknown as { sub: number };
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

/** All internal roles can access all projects by default (sales ≈ presales; refine later). */
export function canAccessProject(user: AuthUser, projectId: number): boolean {
  if (user.role === "admin" || user.role === "sales" || user.role === "presales") return true;
  const mr = getModuleRole(user, "presales");
  if (mr === "admin" || mr === "manager") return true;
  const row = db
    .prepare("SELECT 1 AS ok FROM project_members WHERE project_id = ? AND user_id = ?")
    .get(projectId, user.id);
  return !!row;
}

// ---------------------------------------------------------------------------
// Per-module roles (granular access). Global 'admin' is admin of every module.
// Module roles: admin > manager > member > viewer
// ---------------------------------------------------------------------------
export type ModuleRole = "admin" | "manager" | "member" | "viewer";
const MODULE_RANK: Record<ModuleRole, number> = { admin: 3, manager: 2, member: 1, viewer: 0 };

export function getModuleRole(user: AuthUser, module: string): ModuleRole | null {
  if (user.role === "admin") return "admin";
  // Sensible defaults from the global role when no override exists
  const row = db.prepare("SELECT role FROM module_roles WHERE user_id = ? AND module = ?").get(user.id, module) as any;
  if (row) return row.role as ModuleRole;
  if (user.role === "sales" || user.role === "presales") return "manager";
  return "member";
}

export function moduleRoleAtLeast(user: AuthUser, module: string, min: ModuleRole): boolean {
  const r = getModuleRole(user, module);
  return r !== null && MODULE_RANK[r] >= MODULE_RANK[min];
}

/** Who may unlock a locked revision: global admin, presales (module admin/manager or global role), or the user who locked it. */
export function canUnlockRevision(user: AuthUser, rev: any): boolean {
  if (user.role === "admin") return true;
  if (user.role === "presales") return true; // presales owns the costing sheet — a bit more modify privilege than sales
  if (moduleRoleAtLeast(user, "presales", "admin")) return true;
  return rev.locked_by != null && rev.locked_by === user.id;
}
