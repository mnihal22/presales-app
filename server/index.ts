import "./env.js"; // load .env before anything reads process.env
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "node:path";
import fs from "node:fs";
import "./db.js"; // initializes schema + seed
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { customerRoutes } from "./routes/customers.js";
import { projectRoutes } from "./routes/projects.js";
import { quoteRoutes } from "./routes/quotes.js";
import { costingRoutes } from "./routes/costing.js";
import { taskRoutes } from "./routes/tasks.js";
import { activityRoutes } from "./routes/activity.js";
import { templateRoutes } from "./routes/templates.js";
import { exportRoutes } from "./routes/export.js";
import { summaryRoutes } from "./routes/summary.js";
import { optionRoutes } from "./routes/options.js";
import { serviceRoutes } from "./routes/services.js";
import { importRoutes } from "./routes/imports.js";

const app = new Hono();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/version", (c) => {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
    return c.json({ version: pkg.version });
  } catch {
    return c.json({ version: "unknown" });
  }
});
app.route("/api/auth", authRoutes);
app.route("/api/users", userRoutes);
app.route("/api/customers", customerRoutes);
app.route("/api/projects", projectRoutes);
app.route("/api/quotes", quoteRoutes);
app.route("/api/costing", costingRoutes);
app.route("/api/tasks", taskRoutes);
app.route("/api/activity", activityRoutes);
app.route("/api/templates", templateRoutes);
app.route("/api/export", exportRoutes);
app.route("/api/summary", summaryRoutes);
app.route("/api/options", optionRoutes);
app.route("/api/services", serviceRoutes);
app.route("/api/import", importRoutes);

// Serve the built frontend (production / single-process deployment)
const distDir = path.resolve(process.cwd(), "dist");
if (fs.existsSync(distDir)) {
  app.use("/*", serveStatic({ root: "./dist" }));
  // SPA fallback
  app.get("*", (c) => {
    const html = fs.readFileSync(path.join(distDir, "index.html"), "utf-8");
    return c.html(html);
  });
}

const port = Number(process.env.PORT) || 8787;
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`Server listening on http://0.0.0.0:${info.port}`);
});
