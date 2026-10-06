import { useEffect, useRef, useState } from "react";
import { api, getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Upload, Download, FileSpreadsheet, FolderInput } from "lucide-react";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ItemRow { description: string; partNo: string; qty: string; unitPrice: string; leadTime: string }
const emptyItem: ItemRow = { description: "", partNo: "", qty: "1", unitPrice: "", leadTime: "" };

// Fields a preview column can be assigned to (dropdown sits on top of each column)
const FIELD_OPTIONS = [
  { key: "description", label: "Description *" },
  { key: "partNo", label: "Part number" },
  { key: "qty", label: "Quantity" },
  { key: "unitPrice", label: "Unit buy price" },
  { key: "listUnitPrice", label: "List unit price" },
  { key: "extendedBuy", label: "Extended buy (total)" },
  { key: "leadTime", label: "Lead time" },
] as const;

// Heuristic header guessing — helper only, every dropdown stays editable
function guessColumns(preview: any[][], skip: number): Record<number, string> {
  const headerRow = preview[Math.max(0, skip - 1)] ?? preview[0] ?? [];
  const rules: [string, RegExp][] = [
    ["listUnitPrice", /list.*(price|unit)|\bgpl\b|\bmsrp\b|\blp\b/i],
    ["extendedBuy", /ext(\.|ended)?.*(buy|price|cost|total|amt|amount)|total.*(buy|cost|price)|\bamount\b/i],
    ["qty", /^qty$|quantity|q'ty/i],
    ["leadTime", /lead|deliver|eta|availab/i],
    ["partNo", /part|sku|model|p\/n|article|item\s*(no|code|#)/i],
    ["description", /desc|item|product|material|service/i],
    ["unitPrice", /unit.*(price|cost|buy)|buy.*price|price|cost/i],
  ];
  const guess: Record<number, string> = {};
  const used = new Set<string>();
  headerRow.forEach((h: any, i: number) => {
    const t = String(h ?? "").trim();
    if (!t) return;
    for (const [field, re] of rules) {
      if (used.has(field)) continue;
      if (re.test(t)) { guess[i] = field; used.add(field); break; }
    }
  });
  return guess;
}

export default function QuotesTab({ projectId, revisions }: any) {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [revisionId, setRevisionId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ ...emptyItem }]);
  const [error, setError] = useState("");

  // --- vendor sheet import state ---
  const [importOpen, setImportOpen] = useState(false);
  const [parseResult, setParseResult] = useState<any>(null);
  const [colFields, setColFields] = useState<Record<number, string>>({}); // column index → field key
  const [skipRows, setSkipRows] = useState("1");
  const [impVendor, setImpVendor] = useState("");
  const [impReference, setImpReference] = useState("");
  const [impCurrency, setImpCurrency] = useState("USD");
  const [saveFormatAs, setSaveFormatAs] = useState("");
  const [savedFormats, setSavedFormats] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // --- copy quotes from other projects ---
  const [crossOpen, setCrossOpen] = useState(false);
  const [crossQuotes, setCrossQuotes] = useState<any[]>([]);
  const [copyingId, setCopyingId] = useState<number | null>(null);

  const openCross = () => {
    setCrossOpen(true);
    api<any[]>("/api/quotes/all")
      .then((rows) => setCrossQuotes(rows.filter((q) => q.project_id !== projectId)))
      .catch(() => {});
  };

  const copyQuote = async (q: any) => {
    setCopyingId(q.id);
    try {
      await api(`/api/quotes/${q.id}/copy-to`, {
        method: "POST",
        body: JSON.stringify({ projectId, revisionId: revisions?.[0]?.id ?? null }),
      });
      setCrossOpen(false);
      load();
    } catch (e: any) { alert(e.message); } finally { setCopyingId(null); }
  };

  const load = () => {
    api<any[]>(`/api/quotes/project/${projectId}`).then(setQuotes).catch(console.error);
    api<any[]>(`/api/import/attachments/project/${projectId}`).then(setAttachments).catch(() => {});
  };
  useEffect(() => { load(); }, [projectId]);

  // -------- manual entry --------
  const setItem = (i: number, patch: Partial<ItemRow>) =>
    setItems((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const create = async () => {
    setError("");
    const validItems = items.filter((r) => r.description.trim()).map((r) => ({
      description: r.description, partNo: r.partNo || null, qty: Number(r.qty) || 1,
      unitPrice: Number(r.unitPrice) || 0, leadTime: r.leadTime || null,
    }));
    try {
      await api("/api/quotes", {
        method: "POST",
        body: JSON.stringify({ projectId, revisionId: revisionId ? Number(revisionId) : null, vendor, reference: reference || null, currency, notes: notes || null, items: validItems }),
      });
      setOpen(false);
      setVendor(""); setReference(""); setNotes(""); setItems([{ ...emptyItem }]);
      load();
    } catch (e: any) { setError(e.message); }
  };

  const removeQuote = async (id: number) => {
    if (!confirm("Delete this quote?")) return;
    await api(`/api/quotes/${id}`, { method: "DELETE" });
    load();
  };

  // -------- file import --------
  const uploadFile = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/import/parse", {
      method: "POST",
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "upload failed"); return; }
    setParseResult(data);
    setSavedFormats(data.savedFormats || []);
    setSkipRows("1");
    setColFields(guessColumns(data.preview, 1));
    if (!impVendor) setImpVendor(file.name.replace(/\.[^.]+$/, ""));
  };

  // Assign a field to a column — a field can only live on one column at a time
  const assignColumn = (col: number, field: string) => {
    setColFields((prev) => {
      const next = { ...prev };
      if (!field) { delete next[col]; return next; }
      for (const k of Object.keys(next)) if (next[Number(k)] === field) delete next[Number(k)];
      next[col] = field;
      return next;
    });
  };

  const fieldToCol = (key: string): number | null => {
    const e = Object.entries(colFields).find(([, f]) => f === key);
    return e ? Number(e[0]) : null;
  };

  const applyFormat = (fmtId: string) => {
    const f = savedFormats.find((x) => String(x.id) === fmtId);
    if (!f) return;
    const cfg = JSON.parse(f.columns_json);
    const inv: Record<number, string> = {};
    for (const [field, col] of Object.entries(cfg.mapping)) if (col != null) inv[Number(col as any)] = field;
    setColFields(inv);
    setSkipRows(String(cfg.skipRows ?? 0));
    setImpVendor(f.vendor);
  };

  const commitImport = async () => {
    const descCol = fieldToCol("description");
    if (descCol == null) { alert("Assign the Description field to a column (dropdown on top of the column)"); return; }
    setImporting(true);
    try {
      const r = await api("/api/import/commit", {
        method: "POST",
        body: JSON.stringify({
          storedName: parseResult.storedName, filename: parseResult.filename, size: parseResult.size,
          projectId, vendor: impVendor, reference: impReference || null, currency: impCurrency,
          mapping: {
            description: descCol,
            partNo: fieldToCol("partNo"), qty: fieldToCol("qty"),
            unitPrice: fieldToCol("unitPrice"), listUnitPrice: fieldToCol("listUnitPrice"),
            extendedBuy: fieldToCol("extendedBuy"), leadTime: fieldToCol("leadTime"),
          },
          skipRows: Number(skipRows) || 0,
          saveFormatAs: saveFormatAs || null,
        }),
      });
      if (r.warnings?.length) {
        alert(
          `Imported ${r.imported} items — but ${r.warnings.length} row(s) have unit price ≠ extended buy ÷ qty:\n` +
          r.warnings.slice(0, 6).map((w: any) => `• row ${w.line}: ${w.description} — unit ${w.unitPrice} vs computed ${w.computedUnit}`).join("\n") +
          (r.warnings.length > 6 ? `\n… and ${r.warnings.length - 6} more` : "")
        );
      } else {
        alert(`Imported ${r.imported} items as a quote from ${impVendor}. The original sheet is saved as a record.`);
      }
      setImportOpen(false);
      setParseResult(null);
      load();
    } catch (e: any) { alert(e.message); } finally { setImporting(false); }
  };

  const downloadAttachment = async (a: any) => {
    const res = await fetch(`/api/import/attachments/${a.id}/download`, {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url; el.download = a.filename; el.click();
    URL.revokeObjectURL(url);
  };

  const previewHeaders: number[] = parseResult ? parseResult.preview[0]?.map((_: any, i: number) => i) ?? [] : [];

  return (
    <div className="space-y-5 pt-3">
      <div className="flex justify-end gap-2">
        <Dialog open={crossOpen} onOpenChange={setCrossOpen}>
          <DialogTrigger asChild><Button variant="outline" onClick={openCross}><FolderInput className="h-4 w-4 mr-1" /> From other projects</Button></DialogTrigger>
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader><DialogTitle>Import a quote from another proposal</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">Copies the quote with all its line items into this project (linked to the latest revision).</p>
            <div className="max-h-[60vh] overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Vendor</th><th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">From project</th><th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2 text-right">Items</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {crossQuotes.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No quotes in other projects.</td></tr>}
                  {crossQuotes.map((q) => (
                    <tr key={q.id} className="border-b last:border-0 hover:bg-muted/60">
                      <td className="px-3 py-2 font-medium">{q.vendor}</td>
                      <td className="px-3 py-2">{q.reference || "—"}</td>
                      <td className="px-3 py-2 text-xs">{q.project_code} — {q.project_name}</td>
                      <td className="px-3 py-2 text-xs">{q.customer_name || "—"}</td>
                      <td className="px-3 py-2 text-right">{q.item_count}</td>
                      <td className="px-3 py-2 text-right">{q.currency} {fmt(q.total)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" disabled={copyingId === q.id} onClick={() => copyQuote(q)}>
                          {copyingId === q.id ? "Copying…" : "Copy here"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) setParseResult(null); }}>
          <DialogTrigger asChild><Button variant="outline"><Upload className="h-4 w-4 mr-1" /> Import vendor sheet</Button></DialogTrigger>
          <DialogContent className="sm:max-w-[min(96vw,80rem)]">
            <DialogHeader><DialogTitle>Import vendor cost sheet (Excel / CSV)</DialogTitle></DialogHeader>
            {!parseResult ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Upload the vendor's quote/cost sheet. You'll map its columns in the next step, and the original file is kept as a tracked record.</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
                <Button variant="outline" className="w-full h-24 border-dashed" onClick={() => fileRef.current?.click()}>
                  <FileSpreadsheet className="h-6 w-6 mr-2" /> Choose .xlsx / .csv file
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm"><span className="font-medium">{parseResult.filename}</span> · {parseResult.totalRows} rows</div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="text-sm font-medium">Vendor *</label><Input value={impVendor} onChange={(e) => setImpVendor(e.target.value)} /></div>
                  <div><label className="text-sm font-medium">Vendor reference no.</label><Input value={impReference} onChange={(e) => setImpReference(e.target.value)} /></div>
                  <div><label className="text-sm font-medium">Currency</label>
                    <Select value={impCurrency} onValueChange={setImpCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["USD", "EUR", "GBP", "INR", "AED", "SGD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select></div>
                </div>
                <div className="grid grid-cols-3 gap-3 items-end">
                  {savedFormats.length > 0 && (
                    <div><label className="text-sm font-medium">Apply saved format</label>
                      <Select onValueChange={applyFormat}>
                        <SelectTrigger><SelectValue placeholder="Select a saved vendor format…" /></SelectTrigger>
                        <SelectContent>{savedFormats.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.vendor} — {f.name}</SelectItem>)}</SelectContent>
                      </Select></div>
                    )}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">Skip first N rows (headers)</label>
                    <Input className="h-8 w-20" type="number" value={skipRows} onChange={(e) => setSkipRows(e.target.value)} />
                  </div>
                </div>

                <div className="rounded-md border">
                  <div className="px-2 pt-2 text-xs font-medium">
                    Assign each column its field using the dropdown on top of it — the header stays pinned while you scroll.
                    <span className="text-muted-foreground"> Unit price is cross-checked as extended buy ÷ qty when both are mapped.</span>
                  </div>
                  <div className="mt-1 max-h-[52vh] overflow-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 z-10 bg-muted shadow-[0_1px_0_0_hsl(var(--border))]">
                        <tr>
                          <th className="px-1 py-1 text-left font-medium align-bottom">#</th>
                          {previewHeaders.map((i: number) => (
                            <th key={i} className="px-1 py-1 text-left font-medium min-w-36">
                              <Select value={colFields[i] ?? "__none__"} onValueChange={(v) => assignColumn(i, v === "__none__" ? "" : v)}>
                                <SelectTrigger className="h-7 text-xs bg-card"><SelectValue placeholder="— skip —" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— skip —</SelectItem>
                                  {FIELD_OPTIONS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <div className="text-[10px] text-muted-foreground mt-0.5 font-normal">Col {i + 1}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parseResult.preview.map((row: any[], ri: number) => (
                          <tr key={ri} className={`border-b ${ri < Number(skipRows || 0) ? "bg-amber-50 dark:bg-amber-500/10 text-muted-foreground" : ""}`}>
                            <td className="px-1 py-0.5 text-muted-foreground">{ri + 1}</td>
                            {previewHeaders.map((ci: number) => (
                              <td key={ci} className={`px-1 py-0.5 max-w-44 truncate ${colFields[ci] ? "font-medium" : "text-muted-foreground/70"}`}>
                                {String(row[ci] ?? "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox checked={!!saveFormatAs} onCheckedChange={(v) => setSaveFormatAs(v ? "Standard format" : "")} />
                  <label className="text-sm">Save this mapping as a reusable format for this vendor:</label>
                  {saveFormatAs !== "" && <Input className="h-8 w-48" value={saveFormatAs} onChange={(e) => setSaveFormatAs(e.target.value)} />}
                </div>
                <Button className="w-full" disabled={importing || !impVendor || fieldToCol("description") == null} onClick={commitImport}>
                  {importing ? "Importing…" : "Import quote"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Record vendor quote</Button></DialogTrigger>
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader><DialogTitle>Record vendor quote</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Vendor *</label><Input value={vendor} onChange={(e) => setVendor(e.target.value)} /></div>
              <div><label className="text-sm font-medium">Quote reference</label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
              <div><label className="text-sm font-medium">Currency</label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["USD", "EUR", "GBP", "INR", "AED", "SGD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><label className="text-sm font-medium">Applies to revision</label>
                <Select value={revisionId} onValueChange={setRevisionId}>
                  <SelectTrigger><SelectValue placeholder="Latest (optional)" /></SelectTrigger>
                  <SelectContent>{revisions.map((r: any) => <SelectItem key={r.id} value={String(r.id)}>{r.label}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div className="mt-2">
              <label className="text-sm font-medium">Line items</label>
              <div className="mt-1 space-y-1.5">
                <div className="grid grid-cols-[1fr_120px_70px_110px_100px_32px] gap-1.5 text-xs text-muted-foreground">
                  <span>Description</span><span>Part no.</span><span>Qty</span><span>Unit price</span><span>Lead time</span><span></span>
                </div>
                {items.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_120px_70px_110px_100px_32px] gap-1.5">
                    <Input value={r.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                    <Input value={r.partNo} onChange={(e) => setItem(i, { partNo: e.target.value })} />
                    <Input type="number" value={r.qty} onChange={(e) => setItem(i, { qty: e.target.value })} />
                    <Input type="number" value={r.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} />
                    <Input value={r.leadTime} onChange={(e) => setItem(i, { leadTime: e.target.value })} />
                    <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-muted-foreground/70 hover:text-red-600 dark:text-red-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setItems([...items, { ...emptyItem }])}><Plus className="h-3 w-3 mr-1" /> Add row</Button>
              </div>
            </div>
            {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            <Button className="w-full" disabled={!vendor} onClick={create}>Save quote</Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Items</th>
              <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Recorded by</th><th className="px-4 py-3">Date</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No vendor quotes recorded yet.</td></tr>}
            {quotes.map((q) => (
              <tr key={q.id} className="border-b last:border-0 hover:bg-muted/60">
                <td className="px-4 py-2.5 font-medium">{q.vendor}</td>
                <td className="px-4 py-2.5">{q.reference || "—"}</td>
                <td className="px-4 py-2.5">{q.item_count}</td>
                <td className="px-4 py-2.5 text-right">{q.currency} {fmt(q.total)}</td>
                <td className="px-4 py-2.5">{q.created_by_name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{q.created_at?.slice(0, 10)}</td>
                <td className="px-4 py-2.5"><button onClick={() => removeQuote(q.id)} className="text-muted-foreground/70 hover:text-red-600 dark:text-red-400"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {attachments.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Imported cost sheet records</h3>
          <div className="rounded-md border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2">File</th><th className="px-4 py-2">Vendor ref.</th><th className="px-4 py-2">Uploaded by</th><th className="px-4 py-2">Date</th><th className="px-4 py-2"></th></tr>
              </thead>
              <tbody>
                {attachments.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{a.filename}</td>
                    <td className="px-4 py-2">{a.reference || "—"}</td>
                    <td className="px-4 py-2">{a.uploaded_by_name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{a.created_at?.slice(0, 10)}</td>
                    <td className="px-4 py-2"><button onClick={() => downloadAttachment(a)} className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1"><Download className="h-3 w-3" /> Download</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
