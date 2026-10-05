import { Hono } from "hono";
import { z } from "zod";
import { getAuthProvider, signToken, requireAuth } from "../auth.js";

export const authRoutes = new Hono();

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "username and password required" }, 400);

  const provider = getAuthProvider();
  const user = await provider.authenticate(parsed.data.username, parsed.data.password);
  if (!user) return c.json({ error: "invalid credentials" }, 401);

  return c.json({ token: signToken(user), user, provider: provider.name });
});

authRoutes.get("/me", requireAuth, (c) => {
  return c.json({ user: c.get("user") });
});
