import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Lock, LockOpen, Plus, Trash2, FileInput, Pencil, Search, X, SlidersHorizontal } from "lucide-react";
import ItemEditor, { emptyItemForm, itemToForm } from "./ItemEditor";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CATEGORIES = ["Products (CAPEX)", "Subscriptions & Support (OPEX)", "Professional Services", "AMC"];

const ROW_COLOR_BG: Record<string, string> = {
  yellow: "bg-yellow-100/70 dark:bg-yellow-500/15",
  green: "bg-emerald-100/70 dark:bg-emerald-500/15",
  red: "bg-red-100/70 dark:bg-red-500/15",
  blue: "bg-sky-100/70 dark:bg-sky-500/15",
  violet: "bg-violet-100/70 dark:bg-violet-500/15",
  orange: "bg-orange-100/70 dark:bg-orange-500/15",
};

const BULK_FIELDS = [
  { key: "marginPct", label: "GPM %", type: "number" },
  { key: "landedFactor", label: "Landed factor", type: "number" },
  { key: "exchRate", label: "Exchange rate", type: "number" },
  { key: "partnerDiscountPct", label: "Partner discount %", type: "number" },
  { key: "category", label: "Category (subscription / perpetual-CAPEX / PS / AMC)", type: "category" },
  { key: "itemGrouping", label: "Item grouping", type: "text" },
  { key: "productGrouping", label: "Product grouping", type: "text" },
  { key: "offerGrouping", label: "Offer grouping", type: "text" },
  { key: "rowColor", label: "Row color", type: "color" },
  { key: "inProposal", label: "In proposal", type: "bool" },
  { key: "isAmcBasis", label: "AMC basis", type: "bool" },
  { key: "isAmc", label: "AMC line", type: "bool" },
  { key: "isSwSupport", label: "SW support", type: "bool" },
] as const;

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

  // --- filters ---
  const [search, setSearch] = useState("");
  const [fCategory, setFCategory] = useState("all");
  const [fItemGroup, setFItemGroup] = useState("all");
  const [fProductGroup, setFProductGroup] = useState("all");
  const [fOfferGroup, setFOfferGroup] = useState("all");
  const [fInProposal, setFInProposal] = useState("all");
  const [fAmcBasis, setFAmcBasis] = useState("all");

  // --- selection / bulk ---
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkValues, setBulkValues] = useState<Record<string, string>>({});
  const [bulkBusy, setBulkBusy] = useState(false);

  // --- pagination ---
  const [pageSize, setPageSize] = useState("100");
  const [page, setPage] = useState(0);

  const locked = activeRevision?.status === "locked";

  const load = () => api(`/api/costing/${activeRevision.id}`).then((s) => { setSheet(s); setSelected([]); }).catch(console.error);

  useEffect(() => {
    if (activeRevision) {
      load();
      api<any[]>(`/api/quotes/project/${projectId}`).then(setQuotes).catch(() => {});
    }
  }, [activeRevision?.id, projectId]);

  const items: any[] = sheet?.items ?? [];

  // distinct grouping values for filter dropdowns
  const distinct = (key: string) =>
    Array.from(new Set(items.map((i) => i[key]).filter((v) => v))).sort() as string[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (fCategory !== "all" && it.category !== fCategory) return false;
      if (fItemGroup !== "all" && (it.item_grouping || "") !== fItemGroup) return false;
      if (fProductGroup !== "all" && (it.product_grouping || "") !== fProductGroup) return false;
      if (fOfferGroup !== "all" && (it.offer_grouping || "") !== fOfferGroup) return false;
      if (fInProposal !== "all" && String(!!it.in_proposal) !== fInProposal) return false;
      if (fAmcBasis !== "all" && String(!!it.is_amc_basis) !== fAmcBasis) return false;
      if (q && !(it.description || "").toLowerCase().includes(q)
        && !(it.part_no || "").toLowerCase().includes(q)
        && !(it.map_no || "").toLowerCase().includes(q)
        && !(it.vendor || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, fCategory, fItemGroup, fProductGroup, fOfferGroup, fInProposal, fAmcBasis]);

  const ps = Number(pageSize);
  const pageCount = Math.max(1, Math.ceil(filtered.length / ps));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = ps >= 100000 ? filtered : filtered.slice(safePage * ps, safePage * ps + ps);

  const activeFilters = [fCategory, fItemGroup, fProductGroup, fOfferGroup, fInProposal, fAmcBasis].filter((f) => f !== "all").length + (search ? 1 : 0);
  const clearFilters = () => {
    setSearch(""); setFCategory("all"); setFItemGroup("all"); setFProductGroup("all"); setFOfferGroup("all"); setFInProposal("all"); setFAmcBasis("all"); setPage(0);
  };

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

  // ---- selection ----
  const pageIds = pageItems.map((i) => i.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const togglePage = (v: boolean) =>
    setSelected((prev) => (v ? Array.from(new Set([...prev, ...pageIds])) : prev.filter((id) => !pageIds.includes(id))));
  const toggleOne = (id: number, v: boolean) =>
    setSelected((prev) => (v ? [...prev, id] : prev.filter((x) => x !== id)));
  const selectAllFiltered = () => setSelected(filtered.map((i) => i.id));

  // ---- bulk update ----
  const applyBulk = async () => {
    const fields: any = {};
    for (const f of BULK_FIELDS) {
      const raw = bulkValues[f.key];
      if (raw === undefined || raw === "") continue;
      if (f.type === "number") fields[f.key] = Number(raw);
      else if (f.type === "bool") fields[f.key] = raw === "yes";
      else if (f.type === "color") fields[f.key] = raw === "__clear__" ? null : raw;
      else fields[f.key] = raw;
    }
    if (Object.keys(fields).length === 0) return;
    setBulkBusy(true);
    try {
      await api(`/api/costing/${activeRevision.id}/bulk-update`, {
        method: "POST",
        body: JSON.stringify({ itemIds: selected, fields }),
      });
      setBulkOpen(false);
      setBulkValues({});
      load();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.length} selected items? This cannot be undone.`)) return;
    await api(`/api/costing/${activeRevision.id}/bulk-delete`, {
      method: "POST",
      body: JSON.stringify({ itemIds: selected }),
    });
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
          {locked && <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"><Lock className="h-3 w-3 mr-1" /> Locked{activeRevision.locked_by_name ? ` by ${activeRevision.locked_by_name}` : ""}</Badge>}
          <span className="text-xs text-muted-foreground">GPM-based: sell = landed ÷ (1 − GPM)</span>
        </div>
        <div className="flex items-center gap-2">
          {locked && (
            <Button variant="outline" onClick={async () => {
              if (!confirm("Unlock this revision? Only an admin or the person who locked it can do this.")) return;
              try {
                await api(`/api/projects/${projectId}/revisions/${activeRevision.id}/unlock`, { method: "POST" });
                onChanged();
              } catch (e: any) { alert(e.message); }
            }}><LockOpen className="h-4 w-4 mr-1" /> Unlock</Button>
          )}
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
                        <button className="mb-1 text-xs text-primary hover:underline"
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

      {/* ------- filter bar ------- */}
      <div className="rounded-md border bg-card p-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="h-8 w-52 pl-7" placeholder="Search description, part #, vendor…" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <Select value={fCategory} onValueChange={(v) => { setFCategory(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fItemGroup} onValueChange={(v) => { setFItemGroup(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Item group" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All item groups</SelectItem>
              {distinct("item_grouping").map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fProductGroup} onValueChange={(v) => { setFProductGroup(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Product group" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All product groups</SelectItem>
              {distinct("product_grouping").map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fOfferGroup} onValueChange={(v) => { setFOfferGroup(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Offer group" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All offer groups</SelectItem>
              {distinct("offer_grouping").map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fInProposal} onValueChange={(v) => { setFInProposal(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-32"><SelectValue placeholder="In proposal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">In prop: all</SelectItem>
              <SelectItem value="true">In prop: Y</SelectItem>
              <SelectItem value="false">In prop: N</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fAmcBasis} onValueChange={(v) => { setFAmcBasis(v); setPage(0); }}>
            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="AMC basis" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">AMC basis: all</SelectItem>
              <SelectItem value="true">AMC basis: Y</SelectItem>
              <SelectItem value="false">AMC basis: N</SelectItem>
            </SelectContent>
          </Select>
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-3.5 w-3.5 mr-1" /> Clear ({activeFilters})</Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} of {items.length} items
          </span>
        </div>

        {/* ------- bulk action bar ------- */}
        {selected.length > 0 && !locked && (
          <div className="flex flex-wrap items-center gap-2 rounded bg-primary/5 border border-primary/20 px-2 py-1.5">
            <span className="text-xs font-medium text-primary">{selected.length} selected</span>
            {!allPageSelected && selected.length < filtered.length && (
              <button className="text-xs text-primary hover:underline" onClick={selectAllFiltered}>
                Select all {filtered.length} filtered
              </button>
            )}
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Bulk update</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Bulk update {selected.length} items</DialogTitle></DialogHeader>
                <p className="text-xs text-muted-foreground">Only fields you fill in are applied — blank fields stay untouched.</p>
                <div className="grid grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1">
                  {BULK_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="text-xs font-medium">{f.label}</label>
                      {f.type === "number" && (
                        <Input className="h-8" type="number" step="any" value={bulkValues[f.key] ?? ""}
                          onChange={(e) => setBulkValues({ ...bulkValues, [f.key]: e.target.value })} placeholder="leave blank to skip" />
                      )}
                      {f.type === "text" && (
                        <Input className="h-8" value={bulkValues[f.key] ?? ""}
                          onChange={(e) => setBulkValues({ ...bulkValues, [f.key]: e.target.value })} placeholder="leave blank to skip" />
                      )}
                      {f.type === "category" && (
                        <Select value={bulkValues[f.key] ?? ""} onValueChange={(v) => setBulkValues({ ...bulkValues, [f.key]: v })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="skip" /></SelectTrigger>
                          <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                      {f.type === "bool" && (
                        <Select value={bulkValues[f.key] ?? ""} onValueChange={(v) => setBulkValues({ ...bulkValues, [f.key]: v })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="skip" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {f.type === "color" && (
                        <Select value={bulkValues[f.key] ?? ""} onValueChange={(v) => setBulkValues({ ...bulkValues, [f.key]: v })}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="skip" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yellow">Yellow</SelectItem>
                            <SelectItem value="green">Green</SelectItem>
                            <SelectItem value="red">Red</SelectItem>
                            <SelectItem value="blue">Blue</SelectItem>
                            <SelectItem value="violet">Violet</SelectItem>
                            <SelectItem value="orange">Orange</SelectItem>
                            <SelectItem value="__clear__">Clear color</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}
                </div>
                <Button className="w-full bg-primary hover:bg-primary/90" disabled={bulkBusy} onClick={applyBulk}>
                  {bulkBusy ? "Applying…" : `Apply to ${selected.length} items`}
                </Button>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="outline" className="text-red-600 dark:text-red-400" onClick={bulkDelete}><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete</Button>
            <button className="ml-auto text-xs text-muted-foreground hover:underline" onClick={() => setSelected([])}>Clear selection</button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-primary/5 text-left text-xs uppercase text-muted-foreground">
            <tr>
              {!locked && (
                <th className="px-3 py-2 w-8">
                  <Checkbox checked={allPageSelected} onCheckedChange={(v) => togglePage(!!v)} />
                </th>
              )}
              <th className="px-3 py-2">Map #</th>
              <th className="px-3 py-2">In prop</th>
              <th className="px-3 py-2">AMC base</th>
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
            {pageItems.length === 0 && (
              <tr><td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                {items.length === 0 ? "Costing sheet is empty — add items manually or import from a quote." : "No items match the current filters."}
              </td></tr>
            )}
            {pageItems.map((it: any) => (
              <tr key={it.id} className={`border-b last:border-0 hover:bg-accent/60 ${selected.includes(it.id) ? "bg-primary/5" : (ROW_COLOR_BG[it.row_color] || "")}`}>
                {!locked && (
                  <td className="px-3 py-1.5">
                    <Checkbox checked={selected.includes(it.id)} onCheckedChange={(v) => toggleOne(it.id, !!v)} />
                  </td>
                )}
                <td className="px-3 py-1.5 font-mono text-xs">{it.map_no || "—"}</td>
                <td className="px-3 py-1.5">{it.in_proposal ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Y</Badge> : <Badge variant="secondary">N</Badge>}</td>
                <td className="px-3 py-1.5">{it.is_amc_basis ? <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:text-violet-300 dark:bg-violet-500/15 dark:text-violet-300">Y</Badge> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="px-3 py-1.5 text-xs">{it.category.replace(/ \(.*\)/, "")}</td>
                <td className="px-3 py-1.5 min-w-56">
                  <div>{it.description}</div>
                  <div className="text-xs text-muted-foreground font-mono space-x-2">
                    {it.part_no && <span>{it.part_no}</span>}
                    {[it.item_grouping, it.product_grouping, it.offer_grouping].filter(Boolean).map((g: string, i: number) => (
                      <span key={i} className="rounded bg-muted px-1">{g}</span>
                    ))}
                  </div>
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
                      <button onClick={() => { setEditing(it); setEditorOpen(true); }} className="mr-2 text-muted-foreground/70 hover:text-primary"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => removeItem(it.id)} className="text-muted-foreground/70 hover:text-red-600 dark:text-red-400"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-primary/5 font-semibold text-sm">
            <tr>
              <td colSpan={locked ? 7 : 8} className="px-3 py-2 text-right">
                Totals — buy FCR: {fmt(sheet.summary.total.buy_fcr)} · landed AED: {fmt(sheet.summary.total.landed_aed)}
                {sheet.summary.amc_basis_sale_aed > 0 && <> · AMC base: {fmt(sheet.summary.amc_basis_sale_aed)}</>}
              </td>
              <td colSpan={2} className="px-3 py-2 text-right">GPM {(sheet.summary.total.gpm * 100).toFixed(1)}%</td>
              <td className="px-3 py-2 text-right">{fmt(sheet.summary.total.sale_aed)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ------- pagination ------- */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Rows per page</span>
        <Select value={pageSize} onValueChange={(v) => { setPageSize(v); setPage(0); }}>
          <SelectTrigger className="h-7 w-20"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["50", "100", "250", "500"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            <SelectItem value="100000">All</SelectItem>
          </SelectContent>
        </Select>
        {pageCount > 1 && (
          <>
            <Button variant="outline" size="sm" className="h-7" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Prev</Button>
            <span>Page {safePage + 1} of {pageCount}</span>
            <Button variant="outline" size="sm" className="h-7" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</Button>
          </>
        )}
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
