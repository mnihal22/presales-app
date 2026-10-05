import { Hono } from "hono";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { db } from "../db.js";
import { requireAuth, canAccessProject } from "../auth.js";
import { logActivity } from "../audit.js";

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const importRoutes = new Hono();
importRoutes.use("*", requireAuth);

// ---- Step 1: upload + parse a vendor sheet (xlsx/xls/csv) -------------------
importRoutes.post("/parse", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!file || typeof file === "string") return c.json({ error: "file required" }, 400);

  const origName = file.name || "upload";
  const ext = path.extname(origName).toLowerCase();
  if (![".xlsx", ".xls", ".csv"].includes(ext)) return c.json({ error: "only .xlsx, .xls or .csv files" }, 400);

  const storedName = `${crypto.randomUUID()}${ext}`;
  const storedPath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(storedPath, Buffer.from(await file.arrayBuffer()));

  try {
    const { sheetNames, rows } = await extractRows(storedPath, ext);
    const formats = db.prepare("SELECT * FROM vendor_formats ORDER BY vendor, name").all();
    return c.json({
      storedName,
      filename: origName,
      size: file.size,
      sheetNames,
      preview: rows.slice(0, 50),
      totalRows: rows.length,
      savedFormats: formats,
    });
  } catch (e: any) {
    fs.unlinkSync(storedPath);
    return c.json({ error: `could not parse file: ${e.message}` }, 400);
  }
});

async function extractRows(filePath: string, ext: string): Promise<{ sheetNames: string[]; rows: any[][] }> {
  if (ext === ".csv") {
    const text = fs.readFileSync(filePath, "utf-8");
    const rows = parseCsv(text);
    return { sheetNames: ["Sheet1"], rows };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  const rows: any[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals: any[] = [];
    for (let i = 1; i <= ws.columnCount; i++) {
      const v = row.getCell(i).value;
      vals.push(v == null ? "" : typeof v === "object" ? (v as any).text ?? (v as any).result ?? String(v) : v);
    }
    rows.push(vals);
  });
  return { sheetNames: wb.worksheets.map((w) => w.name), rows };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { cur.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); field = "";
      if (cur.some((f) => f.trim() !== "")) rows.push(cur);
      cur = [];
    } else field += ch;
  }
  cur.push(field);
  if (cur.some((f) => f.trim() !== "")) rows.push(cur);
  return rows;
}

// ---- Step 2: commit import with a column mapping -----------------------------
const commitSchema = z.object({
  storedName: z.string(),
  filename: z.string(),
  size: z.number().default(0),
  projectId: z.number(),
  revisionId: z.number().optional().nullable(),
  vendor: z.string().min(1),
  reference: z.string().optional().nullable(),
  currency: z.string().default("USD"),
  mapping: z.object({
    description: z.number(),
    partNo: z.number().optional().nullable(),
    qty: z.number().optional().nullable(),
    unitPrice: z.number().optional().nullable(),
    leadTime: z.number().optional().nullable(),
  }),
  skipRows: z.number().default(0),
  saveFormatAs: z.string().optional().nullable(), // save mapping as a reusable vendor format
});

importRoutes.post("/commit", async (c) => {
  const parsed = commitSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid input" }, 400);
  const d = parsed.data;
  const user = c.get("user");
  if (!canAccessProject(user, d.projectId)) return c.json({ error: "forbidden" }, 403);

  const storedPath = path.join(UPLOAD_DIR, path.basename(d.storedName));
  if (!fs.existsSync(storedPath)) return c.json({ error: "uploaded file expired — upload again" }, 400);

  const ext = path.extname(storedPath).toLowerCase();
  const { rows } = await extractRows(storedPath, ext);
  const dataRows = rows.slice(d.skipRows);

  const items: { description: string; partNo: string | null; qty: number; unitPrice: number; leadTime: string | null }[] = [];
  for (const r of dataRows) {
    const desc = String(r[d.mapping.description] ?? "").trim();
    if (!desc) continue;
    items.push({
      description: desc,
      partNo: d.mapping.partNo != null ? String(r[d.mapping.partNo] ?? "").trim() || null : null,
      qty: d.mapping.qty != null ? Number(r[d.mapping.qty]) || 1 : 1,
      unitPrice: d.mapping.unitPrice != null ? Number(r[d.mapping.unitPrice]) || 0 : 0,
      leadTime: d.mapping.leadTime != null ? String(r[d.mapping.leadTime] ?? "").trim() || null : null,
    });
  }
  if (items.length === 0) return c.json({ error: "no importable rows found — check column mapping and skip rows" }, 400);

  const tx = db.transaction(() => {
    const qres = db
      .prepare("INSERT INTO quotes (project_id, revision_id, vendor, reference, currency, notes, created_by) VALUES (?,?,?,?,?,?,?)")
      .run(d.projectId, d.revisionId ?? null, d.vendor, d.reference ?? null, d.currency, `Imported from ${d.filename}`, user.id);
    const quoteId = Number(qres.lastInsertRowid);
    items.forEach((item, i) => {
      db.prepare("INSERT INTO quote_items (quote_id, line_no, description, part_no, qty, unit_price, lead_time) VALUES (?,?,?,?,?,?,?)")
        .run(quoteId, i + 1, item.description, item.partNo, item.qty, item.unitPrice, item.leadTime);
    });
    // Keep the original vendor sheet as a tracked record
    db.prepare(
      "INSERT INTO attachments (project_id, quote_id, reference, filename, stored_name, content_type, size, uploaded_by) VALUES (?,?,?,?,?,?,?,?)"
    ).run(d.projectId, quoteId, d.reference ?? null, d.filename, path.basename(d.storedName), null, d.size, user.id);
    if (d.saveFormatAs) {
      db.prepare("INSERT INTO vendor_formats (vendor, name, columns_json, notes) VALUES (?,?,?,?)")
        .run(d.vendor, d.saveFormatAs, JSON.stringify({ mapping: d.mapping, skipRows: d.skipRows }), null);
    }
    logActivity({ projectId: d.projectId, userId: user.id, action: "quote.imported_from_file", entityType: "quote", entityId: quoteId, details: `${d.vendor}: ${items.length} items from ${d.filename}` });
    return quoteId;
  });
  const quoteId = tx();
  return c.json({ quoteId, imported: items.length }, 201);
});

// List attachments (cost sheet records) for a project
importRoutes.get("/attachments/project/:projectId", (c) => {
  const projectId = Number(c.req.param("projectId"));
  if (!canAccessProject(c.get("user"), projectId)) return c.json({ error: "forbidden" }, 403);
  const rows = db
    .prepare(
      `SELECT a.id, a.project_id, a.quote_id, a.reference, a.filename, a.size, a.created_at, u.display_name AS uploaded_by_name
       FROM attachments a JOIN users u ON u.id = a.uploaded_by
       WHERE a.project_id = ? ORDER BY a.created_at DESC`
    )
    .all(projectId);
  return c.json(rows);
});

importRoutes.get("/attachments/:id/download", (c) => {
  const id = Number(c.req.param("id"));
  const a = db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as any;
  if (!a) return c.json({ error: "not found" }, 404);
  if (!canAccessProject(c.get("user"), a.project_id)) return c.json({ error: "forbidden" }, 403);
  const p = path.join(UPLOAD_DIR, a.stored_name);
  if (!fs.existsSync(p)) return c.json({ error: "file missing on server" }, 404);
  const buf = fs.readFileSync(p);
  c.header("Content-Type", "application/octet-stream");
  c.header("Content-Disposition", `attachment; filename="${a.filename.replace(/"/g, "")}"`);
  return c.body(buf);
});

// Saved vendor formats (reusable column mappings)
importRoutes.get("/formats", (c) => {
  return c.json(db.prepare("SELECT * FROM vendor_formats ORDER BY vendor, name").all());
});
