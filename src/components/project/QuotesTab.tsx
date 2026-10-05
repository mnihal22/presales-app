import { useEffect, useRef, useState } from "react";
import { api, getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Upload, Download, FileSpreadsheet } from "lucide-react";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ItemRow { description: string; partNo: string; qty: string; unitPrice: string; leadTime: string }
const emptyItem: ItemRow = { description: "", partNo: "", qty: "1", unitPrice: "", leadTime: "" };

const MAP_FIELDS = [
  { key: "description", label: "Description *" },
  { key: "partNo", label: "Part number" },
  { key: "qty", label: "Quantity" },
  { key: "unitPrice", label: "Unit price" },
  { key: "leadTime", label: "Lead time" },
] as const;

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
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipRows, setSkipRows] = useState("1");
  const [impVendor, setImpVendor] = useState("");
  const [impReference, setImpReference] = useState("");
  const [impCurrency, setImpCurrency] = useState("USD");
  const [saveFormatAs, setSaveFormatAs] = useState("");
  const [savedFormats, setSavedFormats] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    setMapping({});
    if (!impVendor) setImpVendor(file.name.replace(/\.[^.]+$/, ""));
  };

  const applyFormat = (fmtId: string) => {
    const f = savedFormats.find((x) => String(x.id) === fmtId);
    if (!f) return;
    const cfg = JSON.parse(f.columns_json);
    setMapping(Object.fromEntries(Object.entries(cfg.mapping).map(([k, v]) => [k, String(v)])));
    setSkipRows(String(cfg.skipRows ?? 0));
    setImpVendor(f.vendor);
  };

  const commitImport = async () => {
    if (mapping.description === undefined || mapping.description === "") { alert("Map the Description column"); return; }
    setImporting(true);
    try {
      const numOrNull = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));
      const r = await api("/api/import/commit", {
        method: "POST",
        body: JSON.stringify({
          storedName: parseResult.storedName, filename: parseResult.filename, size: parseResult.size,
          projectId, vendor: impVendor, reference: impReference || null, currency: impCurrency,
          mapping: {
            description: Number(mapping.description),
            partNo: numOrNull(mapping.partNo), qty: numOrNull(mapping.qty),
            unitPrice: numOrNull(mapping.unitPrice), leadTime: numOrNull(mapping.leadTime),
          },
          skipRows: Number(skipRows) || 0,
          saveFormatAs: saveFormatAs || null,
        }),
      });
      alert(`Imported ${r.imported} items as a quote from ${impVendor}. The original sheet is saved as a record.`);
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

  const previewHeaders = parseResult ? parseResult.preview[0]?.map((_: any, i: number) => i) ?? [] : [];

  return (
    <div className="space-y-5 pt-3">
      <div className="flex justify-end gap-2">
        <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) setParseResult(null); }}>
          <DialogTrigger asChild><Button variant="outline"><Upload className="h-4 w-4 mr-1" /> Import vendor sheet</Button></DialogTrigger>
          <DialogContent className="max-w-4xl">
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
              <div className="space-y-3 max-h-[70vh] overflow-y-auto">
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
                {savedFormats.length > 0 && (
                  <div><label className="text-sm font-medium">Apply saved format</label>
                    <Select onValueChange={applyFormat}>
                      <SelectTrigger><SelectValue placeholder="Select a saved vendor format…" /></SelectTrigger>
                      <SelectContent>{savedFormats.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.vendor} — {f.name}</SelectItem>)}</SelectContent>
                    </Select></div>
                )}
                <div className="rounded-md border p-2 overflow-x-auto">
                  <div className="text-xs font-medium mb-1">Column mapping (column numbers refer to the preview below)</div>
                  <div className="grid grid-cols-5 gap-2">
                    {MAP_FIELDS.map((f) => (
                      <div key={f.key}>
                        <label className="text-xs text-muted-foreground">{f.label}</label>
                        <Select value={mapping[f.key] ?? ""} onValueChange={(v) => setMapping({ ...mapping, [f.key]: v })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {previewHeaders.map((i: number) => (
                              <SelectItem key={i} value={String(i)}>Col {i + 1}: {String(parseResult.preview[0]?.[i] ?? "").slice(0, 18)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Skip first N rows (headers)</label>
                    <Input className="h-8 w-20" type="number" value={skipRows} onChange={(e) => setSkipRows(e.target.value)} />
                  </div>
                  <table className="mt-2 w-full text-xs">
                    <tbody>
                      {parseResult.preview.slice(0, 6).map((row: any[], ri: number) => (
                        <tr key={ri} className="border-b">
                          <td className="px-1 py-0.5 text-muted-foreground">{ri + 1}</td>
                          {row.slice(0, 8).map((v: any, ci: number) => <td key={ci} className="px-1 py-0.5 max-w-32 truncate">{String(v)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={!!saveFormatAs} onCheckedChange={(v) => setSaveFormatAs(v ? "Standard format" : "")} />
                  <label className="text-sm">Save this mapping as a reusable format for this vendor:</label>
                  {saveFormatAs !== "" && <Input className="h-8 w-48" value={saveFormatAs} onChange={(e) => setSaveFormatAs(e.target.value)} />}
                </div>
                <Button className="w-full" disabled={importing || !impVendor || mapping.description === undefined || mapping.description === ""} onClick={commitImport}>
                  {importing ? "Importing…" : "Import quote"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Record vendor quote</Button></DialogTrigger>
          <DialogContent className="max-w-3xl">
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
                    <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setItems([...items, { ...emptyItem }])}><Plus className="h-3 w-3 mr-1" /> Add row</Button>
              </div>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <Button className="w-full" disabled={!vendor} onClick={create}>Save quote</Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Items</th>
              <th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Recorded by</th><th className="px-4 py-3">Date</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No vendor quotes recorded yet.</td></tr>}
            {quotes.map((q) => (
              <tr key={q.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium">{q.vendor}</td>
                <td className="px-4 py-2.5">{q.reference || "—"}</td>
                <td className="px-4 py-2.5">{q.item_count}</td>
                <td className="px-4 py-2.5 text-right">{q.currency} {fmt(q.total)}</td>
                <td className="px-4 py-2.5">{q.created_by_name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{q.created_at?.slice(0, 10)}</td>
                <td className="px-4 py-2.5"><button onClick={() => removeQuote(q.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {attachments.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Imported cost sheet records</h3>
          <div className="rounded-md border bg-white">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
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
