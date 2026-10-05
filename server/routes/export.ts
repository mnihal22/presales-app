import { Hono } from "hono";
import { db } from "../db.js";
import { requireAuth, canAccessProject } from "../auth.js";
import { logActivity } from "../audit.js";
import { computeRow, amountInWords, calcOptsForProject, type CostingRow, type ComputedRow } from "../calc.js";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel } from "docx";
import PDFDocument from "pdfkit";

export const exportRoutes = new Hono();
exportRoutes.use("*", requireAuth);

// Section display labels, in proposal order
const SECTION_LABELS: [string, string][] = [
  ["Products (CAPEX)", "Hardware, Software & Licenses"],
  ["Subscriptions & Support (OPEX)", "Support Registration"],
  ["Professional Services", "Professional Services"],
  ["AMC", "Annual Maintenance"],
];

type LayoutId = "standard" | "item_code" | "apl";

interface TemplateConfig {
  name: string;
  layout: LayoutId;
  companyName: string;
  title: string;
  vatPct: number;
  currencyLabel: string;
  currencyMinor: string;
  showSpecialDiscount: boolean;
  specialDiscountPct: number;
  amountInWords: boolean;
  accentColor: string;
  footerNote?: string;
  terms: string[];
}

function getTemplateConfig(templateId?: number): TemplateConfig {
  let t: any;
  if (templateId) t = db.prepare("SELECT * FROM templates WHERE id = ?").get(templateId);
  if (!t) t = db.prepare("SELECT * FROM templates WHERE module = 'presales' AND is_default = 1").get();
  const cfg = t ? JSON.parse(t.config_json || "{}") : {};
  return {
    name: t?.name || "Standard Proposal",
    layout: cfg.layout || "standard",
    companyName: cfg.companyName || "Your Company",
    title: cfg.title || "Commercial Proposal",
    vatPct: cfg.vatPct ?? 5,
    currencyLabel: cfg.currencyLabel || "UAE Dirhams",
    currencyMinor: cfg.currencyMinor || "Fils",
    showSpecialDiscount: cfg.showSpecialDiscount ?? false,
    specialDiscountPct: cfg.specialDiscountPct ?? 0,
    amountInWords: cfg.amountInWords ?? true,
    accentColor: cfg.accentColor || "#1e40af",
    footerNote: cfg.footerNote,
    terms: cfg.terms || [],
  };
}

// One proposal line = one Map# group (rows sharing a Map# merge; unique Map#
// or blank = its own line), matching the Excel VLOOKUP(Map#&"Y") behavior.
interface ProposalLine {
  mapNo: string;           // shown as the item number when present
  description: string;
  partNo: string;
  mpg: string;
  qtyText: string;
  qty: number;
  unit: number;            // display currency
  total: number;           // display currency
  aplUnit: number | null;
  aplDiscPct: number;
  ddpUnit: number | null;
  ddpTotal: number | null;
  category: string;
}

interface ProposalData {
  project: any;
  revision: any;
  option?: any;
  sections: { label: string; rows: ProposalLine[] }[];
  totalSale: number;
  discountedTotal: number;
  vatAmount: number;
  grandTotal: number;
  currency: string;         // AED | USD
  currencyLabel: string;
  currencyMinor: string;
  discountMode: boolean;
  discountDisplay: string;  // lumpsum | line_item
  optionDiscount: number;   // display currency; >0 only when lumpsum discount applies
  fmtMoney: (v: number) => string;
}

const USD_RATE = 3.68;

function buildProposalData(revisionId: number, optionId: number | undefined, cfg: TemplateConfig): ProposalData | null {
  const revision = db.prepare("SELECT * FROM revisions WHERE id = ?").get(revisionId) as any;
  if (!revision) return null;
  const project = db
    .prepare(
      `SELECT p.*, cu.name AS customer_name, cu.entity AS customer_entity, cu.contact_name AS customer_contact,
              u.display_name AS owner_name
       FROM projects p LEFT JOIN customers cu ON cu.id = p.customer_id JOIN users u ON u.id = p.owner_id
       WHERE p.id = ?`
    )
    .get(revision.project_id) as any;

  let rows: CostingRow[];
  let option: any;
  if (optionId) {
    option = db.prepare("SELECT * FROM proposal_options WHERE id = ?").get(optionId) as any;
    rows = db
      .prepare(
        `SELECT ci.* FROM costing_items ci JOIN option_items oi ON oi.costing_item_id = ci.id
         WHERE oi.option_id = ? AND ci.in_proposal = 1 ORDER BY ci.sort, ci.id`
      )
      .all(optionId) as CostingRow[];
  } else {
    rows = db
      .prepare("SELECT * FROM costing_items WHERE revision_id = ? AND in_proposal = 1 ORDER BY sort, id")
      .all(revisionId) as CostingRow[];
  }
  const opts = calcOptsForProject(revision.project_id);
  const computed = rows.map((r) => computeRow(r, opts));

  const discountMode = !!option?.discount_mode;
  const discountDisplay = option?.discount_display === "line_item" ? "line_item" : "lumpsum";
  const currency = option?.currency === "USD" ? "USD" : "AED";
  const curFactor = currency === "USD" ? USD_RATE : 1;
  const dp = currency === "USD" ? 0 : 2;
  const fmtMoney = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  // Standard vs discounted sell per row. Discount mode with "line_item" display
  // prices every line at its discounted value; "lumpsum" keeps lines at the
  // standard offer and shows one discount amount at the bottom.
  const stdTotal = (r: ComputedRow) => r.sell_price_for_summary;
  const discTotal = (r: ComputedRow) => r.disc_selling_total_aed ?? r.sell_price_for_summary;
  const lineItemDiscount = discountMode && discountDisplay === "line_item";
  const effTotal = (r: ComputedRow) => (lineItemDiscount ? discTotal(r) : stdTotal(r));

  // --- aggregate rows into proposal lines by Map# ---
  const groups = new Map<string, ComputedRow[]>();
  for (const r of computed) {
    const key = (r.map_no && r.map_no.trim()) || `#${r.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const lines: ProposalLine[] = [];
  let discountedSumAed = 0;
  for (const [key, g] of groups) {
    const rep = g[0];
    const totalAed = g.reduce((s, r) => s + effTotal(r), 0);
    discountedSumAed += g.reduce((s, r) => s + discTotal(r), 0);
    const ddpTotalAed = g.some((r) => r.ddp_total_aed != null) ? g.reduce((s, r) => s + (r.ddp_total_aed ?? 0), 0) : null;
    const qty = rep.qty || 1;
    // USD proposals carry integer totals (template convention); AED keeps 2dp
    const total = dp === 0 ? Math.round(totalAed / curFactor) : totalAed / curFactor;
    const ddpTotal = ddpTotalAed != null ? (dp === 0 ? Math.round(ddpTotalAed / curFactor) : ddpTotalAed / curFactor) : null;
    lines.push({
      mapNo: key.startsWith("#") ? "" : key,
      description: rep.proposal_description || rep.description,
      partNo: rep.part_no || "",
      mpg: rep.mpg_code || "",
      qtyText: rep.months > 1 ? `${rep.qty} × ${rep.months}mo` : String(rep.qty),
      qty,
      unit: qty ? total / qty : total,
      total,
      aplUnit: rep.apl_unit_price != null ? rep.apl_unit_price / curFactor : null,
      aplDiscPct: rep.apl_discount_pct || 0,
      ddpUnit: ddpTotal != null && qty ? ddpTotal / qty : null,
      ddpTotal,
      category: rep.category,
    });
  }

  const sections = SECTION_LABELS.map(([cat, label]) => ({
    label,
    rows: lines.filter((r) => r.category === cat || (!SECTION_LABELS.some(([cc]) => cc === r.category) && cat === "Products (CAPEX)")),
  })).filter((s) => s.rows.length > 0);

  const totalSale = lines.reduce((s, r) => s + r.total, 0);
  // Lump-sum option discount: difference between standard and discounted offer,
  // shown as one discount line. (Line-item mode already priced lines discounted.)
  const optionDiscount = discountMode && discountDisplay === "lumpsum"
    ? Math.max(0, totalSale - (dp === 0 ? Math.round(discountedSumAed / curFactor) : discountedSumAed / curFactor))
    : 0;
  const afterOptionDiscount = totalSale - optionDiscount;
  const r0 = (v: number) => (dp === 0 ? Math.round(v) : v); // whole-dollar totals for USD
  const discountedTotal = r0(cfg.showSpecialDiscount ? afterOptionDiscount * (1 - cfg.specialDiscountPct / 100) : afterOptionDiscount);
  const vatAmount = r0((discountedTotal * cfg.vatPct) / 100);
  const grandTotal = r0(discountedTotal + vatAmount);

  const currencyLabel = currency === "USD" ? "US Dollars" : cfg.currencyLabel;
  const currencyMinor = currency === "USD" ? "Cents" : cfg.currencyMinor;

  return { project, revision, option, sections, totalSale, discountedTotal, vatAmount, grandTotal, currency, currencyLabel, currencyMinor, discountMode, discountDisplay, optionDiscount, fmtMoney };
}

// Column definitions per layout
function layoutColumns(layout: LayoutId) {
  if (layout === "item_code")
    return {
      headers: ["Item", "Item Code", "Description", "Unit Price", "Qty", "Total Price"],
      values: (r: ProposalLine, idx: string, f: (v: number) => string) => [r.mapNo || idx, r.partNo, r.description, f(r.unit), r.qtyText, f(r.total)],
    };
  if (layout === "apl")
    return {
      headers: ["Item", "MPG", "Description", "APL Unit Price", "Disc. on APL %", "DDP Unit Price", "Qty", "DDP Total Price"],
      values: (r: ProposalLine, idx: string, f: (v: number) => string) => [
        r.mapNo || idx, r.mpg || r.partNo, r.description,
        r.aplUnit != null ? f(r.aplUnit) : "NA",
        r.aplDiscPct ? `${r.aplDiscPct}%` : "-",
        r.ddpUnit != null ? f(r.ddpUnit) : "NA",
        r.qtyText,
        f(r.ddpTotal ?? r.total),
      ],
    };
  return {
    headers: ["Item", "Description", "Unit Price", "Qty", "Total Price"],
    values: (r: ProposalLine, idx: string, f: (v: number) => string) => [r.mapNo || idx, r.description, f(r.unit), r.qtyText, f(r.total)],
  };
}

// ---------------------------------------------------------------------------
exportRoutes.get("/revision/:id", (c) => handleExport(c, Number(c.req.param("id")), undefined));
exportRoutes.get("/option/:id", (c) => {
  const optionId = Number(c.req.param("id"));
  const opt = db.prepare("SELECT * FROM proposal_options WHERE id = ?").get(optionId) as any;
  if (!opt) return c.json({ error: "not found" }, 404);
  const templateId = c.req.query("templateId") ? Number(c.req.query("templateId")) : (opt.template_id ?? undefined);
  return handleExport(c, opt.revision_id, optionId, templateId);
});

async function handleExport(c: any, revisionId: number, optionId?: number, templateIdOverride?: number) {
  const format = c.req.query("format") || "xlsx";
  const templateId = templateIdOverride ?? (c.req.query("templateId") ? Number(c.req.query("templateId")) : undefined);
  const cfg = getTemplateConfig(templateId);

  const data = buildProposalData(revisionId, optionId, cfg);
  if (!data) return c.json({ error: "not found" }, 404);
  if (!canAccessProject(c.get("user"), data.revision.project_id)) return c.json({ error: "forbidden" }, 403);

  const filename = `${data.project.code}-${data.revision.label || "R" + data.revision.rev_no}${data.option ? "-" + data.option.name.replace(/\s+/g, "") : ""}-proposal`;
  logActivity({ projectId: data.project.id, userId: c.get("user").id, action: "proposal.exported", entityType: "revision", entityId: revisionId, details: `${format.toUpperCase()} · ${cfg.name}${data.option ? " · " + data.option.name : ""}` });

  if (format === "xlsx") return exportXlsx(c, cfg, data, filename);
  if (format === "docx") return exportDocx(c, cfg, data, filename);
  if (format === "pdf") return exportPdf(c, cfg, data, filename);
  return c.json({ error: "unknown format" }, 400);
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------
async function exportXlsx(c: any, cfg: TemplateConfig, d: ProposalData, filename: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Proposal");
  const accent = cfg.accentColor.replace("#", "FF");
  const cols = layoutColumns(cfg.layout);
  const ncols = cols.headers.length;

  ws.columns = cols.headers.map((h, i) => ({ width: i === 0 ? 7 : h === "Description" ? 48 : 16 }));

  // Header block
  let r = 1;
  ws.mergeCells(r, 1, r, ncols);
  ws.getCell(r, 1).value = cfg.companyName;
  ws.getCell(r, 1).font = { size: 18, bold: true, color: { argb: accent } };
  r++;
  ws.mergeCells(r, 1, r, ncols);
  ws.getCell(r, 1).value = cfg.title + (d.option ? ` — ${d.option.name}` : "");
  ws.getCell(r, 1).font = { size: 13, bold: true };
  r += 2;
  const meta: [string, string][] = [
    ["Customer:", d.project.customer_name || "-"],
    ["Project:", `${d.project.code} — ${d.project.name}`],
    ["Revision:", d.revision.label || `R${d.revision.rev_no}`],
    ["Offer Date:", new Date().toISOString().slice(0, 10)],
    ["Currency:", d.currencyLabel],
    ["Account Manager:", d.project.owner_name],
  ];
  for (const [k, v] of meta) {
    ws.getCell(r, 1).value = k;
    ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 2).value = v;
    r++;
  }
  r++;

  // Table header
  cols.headers.forEach((h, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accent } };
    cell.border = { bottom: { style: "thin" } };
  });
  r++;

  // Sections
  let sectionNo = 0;
  for (const sec of d.sections) {
    sectionNo++;
    ws.mergeCells(r, 1, r, ncols);
    const sc = ws.getCell(r, 1);
    sc.value = `${sectionNo}.00  ${sec.label}`;
    sc.font = { bold: true };
    sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    r++;
    sec.rows.forEach((row, i) => {
      const idx = `${sectionNo}.${String(i + 1).padStart(2, "0")}`;
      cols.values(row, idx, d.fmtMoney).forEach((v, j) => {
        ws.getCell(r, j + 1).value = v as any;
      });
      r++;
    });
  }
  r++;

  // Totals block
  const totalsRows: [string, number | string][] = [
    [`Total Investment (${d.currencyLabel})`, d.fmtMoney(d.totalSale)],
  ];
  if (d.optionDiscount > 0) {
    totalsRows.push(["Special Discount", `-${d.fmtMoney(d.optionDiscount)}`]);
    totalsRows.push([`Total after Discount (${d.currencyLabel})`, d.fmtMoney(d.totalSale - d.optionDiscount)]);
  }
  if (cfg.showSpecialDiscount) {
    totalsRows.push([`Total after Special Discount (${cfg.specialDiscountPct}%)`, d.fmtMoney(d.discountedTotal)]);
  }
  totalsRows.push([`${cfg.vatPct}% VAT Charges`, d.fmtMoney(d.vatAmount)]);
  totalsRows.push([`Total Investment including VAT (${d.currencyLabel})`, d.fmtMoney(d.grandTotal)]);

  for (const [label, val] of totalsRows) {
    ws.mergeCells(r, 1, r, ncols - 1);
    const lc = ws.getCell(r, 1);
    lc.value = label;
    lc.font = { bold: true };
    lc.alignment = { horizontal: "right" };
    lc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9CA3AF" } };
    const vc = ws.getCell(r, ncols);
    vc.value = val;
    vc.font = { bold: true };
    vc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9CA3AF" } };
    r++;
  }
  if (cfg.amountInWords) {
    ws.mergeCells(r, 1, r, ncols);
    const wc = ws.getCell(r, 1);
    wc.value = `(In Words: ${amountInWords(d.grandTotal, d.currencyLabel, d.currencyMinor)})`;
    wc.font = { bold: true, size: 9 };
    wc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    r++;
  }
  r++;
  if (cfg.footerNote) { ws.getCell(r++, 1).value = cfg.footerNote; }
  for (const t of cfg.terms) ws.getCell(r++, 1).value = `• ${t}`;

  const buf = await wb.xlsx.writeBuffer();
  c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  c.header("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
  return c.body(Buffer.from(buf));
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------
async function exportDocx(c: any, cfg: TemplateConfig, d: ProposalData, filename: string) {
  const cols = layoutColumns(cfg.layout);
  const cell = (text: string, bold = false) =>
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold })] })] });

  const tableRows: TableRow[] = [
    new TableRow({ children: cols.headers.map((h) => cell(h, true)), tableHeader: true }),
  ];
  let sectionNo = 0;
  for (const sec of d.sections) {
    sectionNo++;
    tableRows.push(
      new TableRow({
        children: [new TableCell({ columnSpan: cols.headers.length, children: [new Paragraph({ children: [new TextRun({ text: `${sectionNo}.00  ${sec.label}`, bold: true })] })] })],
      })
    );
    sec.rows.forEach((row, i) => {
      const idx = `${sectionNo}.${String(i + 1).padStart(2, "0")}`;
      tableRows.push(new TableRow({ children: cols.values(row, idx, d.fmtMoney).map((v) => cell(String(v))) }));
    });
  }

  const totals: [string, string][] = [[`Total Investment (${d.currencyLabel})`, d.fmtMoney(d.totalSale)]];
  if (d.optionDiscount > 0) {
    totals.push(["Special Discount", `-${d.fmtMoney(d.optionDiscount)}`]);
    totals.push([`Total after Discount (${d.currencyLabel})`, d.fmtMoney(d.totalSale - d.optionDiscount)]);
  }
  if (cfg.showSpecialDiscount) totals.push([`Total after Special Discount (${cfg.specialDiscountPct}%)`, d.fmtMoney(d.discountedTotal)]);
  totals.push([`${cfg.vatPct}% VAT Charges`, d.fmtMoney(d.vatAmount)]);
  totals.push([`Total including VAT (${d.currencyLabel})`, d.fmtMoney(d.grandTotal)]);
  for (const [label, val] of totals) {
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({ columnSpan: cols.headers.length - 1, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
          cell(val, true),
        ],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, text: cfg.companyName }),
          new Paragraph({ heading: HeadingLevel.HEADING_2, text: cfg.title + (d.option ? ` — ${d.option.name}` : "") }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: `Customer: ${d.project.customer_name || "-"}` }),
          new Paragraph({ text: `Project: ${d.project.code} — ${d.project.name}` }),
          new Paragraph({ text: `Revision: ${d.revision.label || "R" + d.revision.rev_no}` }),
          new Paragraph({ text: `Offer Date: ${new Date().toISOString().slice(0, 10)}` }),
          new Paragraph({ text: `Currency: ${d.currencyLabel}` }),
          new Paragraph({ text: `Account Manager: ${d.project.owner_name}` }),
          new Paragraph({ text: "" }),
          new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
          ...(cfg.amountInWords
            ? [new Paragraph({ children: [new TextRun({ text: `(In Words: ${amountInWords(d.grandTotal, d.currencyLabel, d.currencyMinor)})`, italics: true })] })]
            : []),
          new Paragraph({ text: "" }),
          ...(cfg.footerNote ? [new Paragraph({ children: [new TextRun({ text: cfg.footerNote, italics: true })] })] : []),
          ...cfg.terms.map((t) => new Paragraph({ text: `• ${t}` })),
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  c.header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  c.header("Content-Disposition", `attachment; filename="${filename}.docx"`);
  return c.body(buf);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
async function exportPdf(c: any, cfg: TemplateConfig, d: ProposalData, filename: string) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (ch) => chunks.push(ch));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const cols = layoutColumns(cfg.layout);
  const ncols = cols.headers.length;
  const tableWidth = 515;
  const startX = 40;
  // proportional widths: description column widest
  const widths = cols.headers.map((h) => (h === "Description" ? tableWidth * 0.34 : h === "Item" ? tableWidth * 0.07 : tableWidth * (0.59 / (ncols - 2))));

  doc.fontSize(18).fillColor(cfg.accentColor).text(cfg.companyName);
  doc.fontSize(12).fillColor("#000").text(cfg.title + (d.option ? ` — ${d.option.name}` : ""));
  doc.moveDown(0.5);
  doc.fontSize(9);
  doc.text(`Customer: ${d.project.customer_name || "-"}     Project: ${d.project.code} — ${d.project.name}`);
  doc.text(`Revision: ${d.revision.label || "R" + d.revision.rev_no}     Offer Date: ${new Date().toISOString().slice(0, 10)}     Currency: ${d.currencyLabel}`);
  doc.text(`Account Manager: ${d.project.owner_name}`);
  doc.moveDown();

  let y = doc.y;
  const rowH = 16;
  const drawRow = (values: string[], opts: { bold?: boolean; fill?: string; span?: boolean } = {}) => {
    if (y > 780) { doc.addPage(); y = 50; }
    if (opts.fill) doc.rect(startX, y, tableWidth, rowH).fill(opts.fill);
    doc.fillColor(opts.fill && opts.fill !== "#e5e7eb" && opts.fill !== "#f3f4f6" ? "#ffffff" : "#000000");
    doc.fontSize(8);
    if (opts.bold) doc.font("Helvetica-Bold");
    let x = startX;
    if (opts.span) {
      doc.text(values[0], x + 3, y + 4, { width: tableWidth - 6, ellipsis: true });
    } else {
      values.forEach((v, i) => {
        doc.text(String(v), x + 3, y + 4, { width: widths[i] - 6, ellipsis: true });
        x += widths[i];
      });
    }
    doc.font("Helvetica").fillColor("#000000");
    y += rowH;
  };

  drawRow(cols.headers, { bold: true, fill: cfg.accentColor });
  let sectionNo = 0;
  for (const sec of d.sections) {
    sectionNo++;
    drawRow([`${sectionNo}.00  ${sec.label}`], { bold: true, fill: "#e5e7eb", span: true });
    sec.rows.forEach((row, i) => {
      const idx = `${sectionNo}.${String(i + 1).padStart(2, "0")}`;
      drawRow(cols.values(row, idx, d.fmtMoney).map(String));
    });
  }
  y += 6;

  const totals: [string, string][] = [[`Total Investment (${d.currencyLabel})`, d.fmtMoney(d.totalSale)]];
  if (d.optionDiscount > 0) {
    totals.push(["Special Discount", `-${d.fmtMoney(d.optionDiscount)}`]);
    totals.push([`Total after Discount (${d.currencyLabel})`, d.fmtMoney(d.totalSale - d.optionDiscount)]);
  }
  if (cfg.showSpecialDiscount) totals.push([`Total after Special Discount (${cfg.specialDiscountPct}%)`, d.fmtMoney(d.discountedTotal)]);
  totals.push([`${cfg.vatPct}% VAT Charges`, d.fmtMoney(d.vatAmount)]);
  totals.push([`Total Investment including VAT (${d.currencyLabel})`, d.fmtMoney(d.grandTotal)]);
  for (const [label, val] of totals) {
    if (y > 780) { doc.addPage(); y = 50; }
    doc.rect(startX, y, tableWidth, rowH).fill("#9ca3af");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
    doc.text(label, startX + 3, y + 4, { width: tableWidth - 90, align: "right" });
    doc.text(val, startX + tableWidth - 85, y + 4, { width: 80, align: "right" });
    doc.font("Helvetica").fillColor("#000000");
    y += rowH;
  }
  if (cfg.amountInWords) {
    y += 4;
    doc.fontSize(8).fillColor("#333").text(`(In Words: ${amountInWords(d.grandTotal, d.currencyLabel, d.currencyMinor)})`, startX, y, { width: tableWidth });
    y = doc.y;
  }
  y += 10;
  if (cfg.footerNote) { doc.fontSize(8).text(cfg.footerNote, startX, y); y = doc.y + 4; }
  cfg.terms.forEach((t) => { doc.fontSize(8).text(`• ${t}`, startX, y); y = doc.y + 2; });

  doc.end();
  const buf = await done;
  c.header("Content-Type", "application/pdf");
  c.header("Content-Disposition", `attachment; filename="${filename}.pdf"`);
  return c.body(buf);
}
