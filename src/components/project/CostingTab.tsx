import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Lock, Plus, Trash2, FileInput, Pencil } from "lucide-react";
import ItemEditor, { emptyItemForm, itemToForm } from "./ItemEditor";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CostingTab({ projectId, revisions, activeRevision, onSelectRevision, onChanged }: any) {
  const [sheet, setSheet] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedQuoteItems, setSelectedQuoteItems] = useState<number[]>([]);
  const [quoteDetail, setQuoteDetail] = useState<Record<number, any[]>>({});
  const [importMargin, setImportMargin] = useState("25");
  const [importExch, setImportExch] = useState("1");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null); // null = new item

  const locked = activeRevision?.status === "locked";

  const load = () => api(`/api/costing/${activeRevision.id}`).then(setSheet).catch(console.error);

  useEffect(() => {
    if (activeRevision) {
      load();
      api<any[]>(`/api/quotes/project/${projectId}`).then(setQuotes).catch(() => {});
    }
  }, [activeRevision?.id, projectId]);

  if (!activeRevision || !sheet) return <div className="py-6 text-muted-foreground">No revision selected.</div>;

  const removeItem = async (itemId: number) => {
    await api(`/api/costing/items/${itemId}`, { method: "DELETE" });
    load();
  };

  const lockRevision = async () => {
    await api(`/api/projects/${projectId}/revisions/${activeRevision.id}/lock`, { method: "POST" });
    onChanged();
  };

  const toggleQuoteItem = async (quoteId: number, itemId: number, checked: boolean) => {
    if (!quoteDetail[quoteId]) {
      const d = await api(`/api/quotes/${quoteId}`);
      setQuoteDetail((prev) => ({ ...prev, [quoteId]: d.items }));
    }
    setSelectedQuoteItems((prev) => (checked ? [...prev, itemId] : prev.filter((x) => x !== itemId)));
  };

  const doImport = async () => {
    await api(`/api/costing/${activeRevision.id}/import-from-quote`, {
      method: "POST",
      body: JSON.stringify({ quoteItemIds: selectedQuoteItems, marginPct: Number(importMargin) || 25, exchRate: Number(importExch) || 1 }),
    });
    setImportOpen(false);
    setSelectedQuoteItems([]);
    load();
  };

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={String(activeRevision.id)} onValueChange={(v) => onSelectRevision(Number(v))}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {revisions.map((r: any) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.label} · {r.created_at.slice(0, 10)} {r.status === "locked" ? "(locked)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {locked && <Badge variant="secondary" className="bg-amber-100 text-amber-800"><Lock className="h-3 w-3 mr-1" /> Locked</Badge>}
          <span className="text-xs text-muted-foreground">GPM-based: sell = landed ÷ (1 − GPM)</span>
        </div>
        <div className="flex items-center gap-2">
          {!locked && (
            <>
              <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogTrigger asChild><Button variant="outline"><FileInput className="h-4 w-4 mr-1" /> Import from quote</Button></DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>Import items from vendor quotes</DialogTitle></DialogHeader>
                  <div className="max-h-96 space-y-4 overflow-y-auto">
                    {quotes.length === 0 && <div className="text-sm text-muted-foreground">No quotes recorded for this project yet.</div>}
                    {quotes.map((q) => (
                      <div key={q.id} className="rounded-md border p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-sm font-medium">{q.vendor} {q.reference ? `· ${q.reference}` : ""}</div>
                          <div className="text-xs text-muted-foreground">{q.currency} {fmt(q.total)}</div>
                        </div>
                        <button className="mb-1 text-xs text-blue-600 hover:underline"
                          onClick={async () => {
                            if (!quoteDetail[q.id]) {
                              const d = await api(`/api/quotes/${q.id}`);
                              setQuoteDetail((prev) => ({ ...prev, [q.id]: d.items }));
                            } else {
                              setQuoteDetail((prev) => { const n = { ...prev }; delete n[q.id]; return n; });
                            }
                          }}>
                          {quoteDetail[q.id] ? "Hide items" : "Show items"}
                        </button>
                        {quoteDetail[q.id]?.map((it: any) => (
                          <label key={it.id} className="flex items-center gap-2 py-0.5 text-sm">
                            <Checkbox checked={selectedQuoteItems.includes(it.id)} onCheckedChange={(v) => toggleQuoteItem(q.id, it.id, !!v)} />
                            <span className="flex-1">{it.description}</span>
                            <span className="text-xs text-muted-foreground">{it.qty} × {fmt(it.unit_price)}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <label>GPM %</label><Input className="w-20" value={importMargin} onChange={(e) => setImportMargin(e.target.value)} />
                    <label>Exch rate</label><Input className="w-20" value={importExch} onChange={(e) => setImportExch(e.target.value)} />
                    <Button className="ml-auto" disabled={selectedQuoteItems.length === 0} onClick={doImport}>
                      Import {selectedQuoteItems.length} item{selectedQuoteItems.length !== 1 ? "s" : ""}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button variant="outline" onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Add item</Button>
              <Button variant="secondary" onClick={lockRevision}><Lock className="h-4 w-4 mr-1" /> Lock revision</Button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Map #</th>
              <th className="px-3 py-2">In prop</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Qty × BOM × Mo</th>
              <th className="px-3 py-2 text-right">Buy (FCR)</th>
              <th className="px-3 py-2 text-right">Landed unit (AED)</th>
              <th className="px-3 py-2 text-right">Landed total (AED)</th>
              <th className="px-3 py-2 text-right">GPM</th>
              <th className="px-3 py-2 text-right">Sell total (AED)</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sheet.items.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">Costing sheet is empty — add items manually or import from a quote.</td></tr>
            )}
            {sheet.items.map((it: any) => (
              <tr key={it.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-3 py-1.5 font-mono text-xs">{it.map_no || "—"}</td>
                <td className="px-3 py-1.5">{it.in_proposal ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Y</Badge> : <Badge variant="secondary">N</Badge>}</td>
                <td className="px-3 py-1.5 text-xs">{it.category.replace(/ \(.*\)/, "")}</td>
                <td className="px-3 py-1.5 min-w-56">
                  <div>{it.description}</div>
                  {it.part_no && <div className="text-xs text-muted-foreground font-mono">{it.part_no}</div>}
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">{it.qty}{it.bom_qty > 1 ? ` × ${it.bom_qty}` : ""}{it.months > 1 ? ` × ${it.months}mo` : ""}</td>
                <td className="px-3 py-1.5 text-right">{fmt(it.unit_cost)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(it.landed_unit_aed)}</td>
                <td className="px-3 py-1.5 text-right">{fmt(it.landed_total_aed)}</td>
                <td className="px-3 py-1.5 text-right">{(it.gpm_actual * 100).toFixed(1)}%</td>
                <td className="px-3 py-1.5 text-right font-medium">{fmt(it.selling_total_aed)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {!locked && (
                    <>
                      <button onClick={() => { setEditing(it); setEditorOpen(true); }} className="mr-2 text-slate-400 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => removeItem(it.id)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold text-sm">
            <tr>
              <td colSpan={7} className="px-3 py-2 text-right">Totals — buy FCR: {fmt(sheet.summary.total.buy_fcr)} · landed AED: {fmt(sheet.summary.total.landed_aed)}</td>
              <td colSpan={2} className="px-3 py-2 text-right">GPM {(sheet.summary.total.gpm * 100).toFixed(1)}%</td>
              <td className="px-3 py-2 text-right">{fmt(sheet.summary.total.sale_aed)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ItemEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editing ? itemToForm(editing) : emptyItemForm}
        itemId={editing?.id}
        revisionId={activeRevision.id}
        onSaved={load}
      />
    </div>
  );
}
