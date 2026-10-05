import { useEffect, useState } from "react";
import { api, downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, FileSpreadsheet, FileText, FileDown } from "lucide-react";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OptionsTab({ projectId, revision, costingItems }: any) {
  const [options, setOptions] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [discountMode, setDiscountMode] = useState(false);
  const [currency, setCurrency] = useState<string>("AED");
  const [discountDisplay, setDiscountDisplay] = useState<string>("lumpsum");
  const [itemIds, setItemIds] = useState<number[]>([]);
  const [summaries, setSummaries] = useState<Record<number, any>>({});
  const [busy, setBusy] = useState("");

  // --- target sale → reverse-engineered uniform GPM ---
  const [targetOpt, setTargetOpt] = useState<any>(null);
  const [targetSale, setTargetSale] = useState("");
  const [targetPreview, setTargetPreview] = useState<any>(null);
  const [targetError, setTargetError] = useState("");
  const [targetBusy, setTargetBusy] = useState(false);

  const openTarget = (o: any) => {
    setTargetOpt(o); setTargetSale(""); setTargetPreview(null); setTargetError("");
  };

  const previewTarget = async () => {
    setTargetBusy(true); setTargetError(""); setTargetPreview(null);
    try {
      const r = await api(`/api/options/${targetOpt.id}/target-gpm`, { method: "POST", body: JSON.stringify({ targetSale: Number(targetSale) }) });
      setTargetPreview(r);
    } catch (e: any) { setTargetError(e.message); } finally { setTargetBusy(false); }
  };

  const applyTarget = async () => {
    if (!confirm(`Apply a uniform GPM of ${targetPreview.impliedGpmPct.toFixed(2)}% to the ${targetPreview.freeCount} adjustable rows in "${targetOpt.name}"?`)) return;
    setTargetBusy(true); setTargetError("");
    try {
      const r = await api(`/api/options/${targetOpt.id}/target-gpm`, { method: "POST", body: JSON.stringify({ targetSale: Number(targetSale), apply: true }) });
      setTargetPreview(r);
      load();
    } catch (e: any) { setTargetError(e.message); } finally { setTargetBusy(false); }
  };

  const load = () => {
    api<any[]>(`/api/options/project/${projectId}`).then(async (rows) => {
      setOptions(rows);
      const sums: Record<number, any> = {};
      for (const o of rows) {
        try { sums[o.id] = await api(`/api/summary/option/${o.id}`); } catch {}
      }
      setSummaries(sums);
    }).catch(console.error);
  };

  useEffect(() => {
    load();
    api<any[]>("/api/templates").then(setTemplates).catch(() => {});
  }, [projectId]);

  const openEditor = (opt?: any) => {
    if (opt) {
      setEditId(opt.id);
      setName(opt.name);
      setDescription(opt.description || "");
      setTemplateId(opt.template_id ? String(opt.template_id) : "");
      setDiscountMode(!!opt.discount_mode);
      setCurrency(opt.currency || "AED");
      setDiscountDisplay(opt.discount_display || "lumpsum");
      api<any>(`/api/options/${opt.id}`).then((d) => setItemIds(d.itemIds));
    } else {
      setEditId(null);
      setName(""); setDescription(""); setTemplateId("");
      setDiscountMode(false); setCurrency("AED"); setDiscountDisplay("lumpsum");
      setItemIds(costingItems.filter((i: any) => i.in_proposal).map((i: any) => i.id));
    }
    setOpen(true);
  };

  const save = async () => {
    const body = JSON.stringify({ name, description: description || null, templateId: templateId ? Number(templateId) : null, itemIds, discountMode, currency, discountDisplay });
    if (editId) await api(`/api/options/${editId}`, { method: "PUT", body });
    else await api("/api/options", { method: "POST", body: JSON.stringify({ ...JSON.parse(body), projectId, revisionId: revision.id }) });
    setOpen(false);
    load();
  };

  const doExport = async (opt: any, format: string) => {
    setBusy(`${opt.id}-${format}`);
    try { await downloadFile(`/api/export/option/${opt.id}?format=${format}`, `proposal.${format}`); }
    finally { setBusy(""); }
  };

  if (!revision) return <div className="py-6 text-muted-foreground">Select a revision first.</div>;

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Build proposal variants from the {revision.label} costing sheet — e.g. Option A vs B, base offer vs optional items. Each option uses its own template.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={() => openEditor()}><Plus className="h-4 w-4 mr-1" /> New option</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editId ? "Edit option" : "New proposal option"}</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Option name *</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Option A — Base" /></div>
                <div><label className="text-sm font-medium">Template</label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger><SelectValue placeholder="Default template" /></SelectTrigger>
                    <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                  </Select></div>
              </div>
              <div><label className="text-sm font-medium">Description</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Proposal currency</label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AED">AED — UAE Dirhams</SelectItem>
                      <SelectItem value="USD">USD — US Dollars (÷ 3.68)</SelectItem>
                    </SelectContent>
                  </Select></div>
                <label className="flex items-start gap-2 text-sm rounded-md border p-2 mt-5">
                  <Checkbox className="mt-0.5" checked={discountMode} onCheckedChange={(v) => setDiscountMode(!!v)} />
                  <span>
                    Apply option discount
                    <span className="block text-xs text-muted-foreground">Proposal uses the discounted offer prices where set on items (standard offer stays untouched).</span>
                  </span>
                </label>
              </div>
              {discountMode && (
                <div><label className="text-sm font-medium">How the discount appears on the proposal</label>
                  <Select value={discountDisplay} onValueChange={setDiscountDisplay}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lumpsum">Lump-sum discount at the bottom (normal)</SelectItem>
                      <SelectItem value="line_item">Line-by-line discounted prices (special cases)</SelectItem>
                    </SelectContent>
                  </Select></div>
              )}
              <div>
                <label className="text-sm font-medium">Items included in this option ({itemIds.length} of {costingItems.length})</label>
                <div className="mt-1 max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                  {costingItems.map((it: any) => (
                    <label key={it.id} className="flex items-center gap-2 text-sm py-0.5">
                      <Checkbox checked={itemIds.includes(it.id)}
                        onCheckedChange={(v) => setItemIds(v ? [...itemIds, it.id] : itemIds.filter((x) => x !== it.id))} />
                      <span className="font-mono text-xs text-muted-foreground w-16">{it.map_no || "—"}</span>
                      <span className="flex-1 truncate">{it.description}</span>
                      <span className="text-xs text-muted-foreground">{fmt(it.selling_total_aed)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button className="w-full" disabled={!name || itemIds.length === 0} onClick={save}>Save option</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {options.length === 0 && (
        <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          No proposal options yet. Create one to generate a customer proposal from a selection of costing items.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {options.map((o) => {
          const s = summaries[o.id];
          return (
            <Card key={o.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{o.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditor(o)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={async () => { if (confirm("Delete option?")) { await api(`/api/options/${o.id}`, { method: "DELETE" }); load(); } }}>
                      <Trash2 className="h-4 w-4 text-muted-foreground/70" />
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {o.template_name || "Default template"} · {o.item_count} items · {o.currency || "AED"}
                  {o.discount_mode ? (o.discount_display === "line_item" ? " · discounted (line-by-line)" : " · discounted (lump-sum)") : ""} · by {o.created_by_name}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {s && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded bg-muted/60 p-2"><div className="text-xs text-muted-foreground">Sale (AED)</div><div className="font-semibold">{fmt(s.total.sale_aed)}</div></div>
                    <div className="rounded bg-muted/60 p-2"><div className="text-xs text-muted-foreground">GP (AED)</div><div className="font-semibold">{fmt(s.total.gp_aed)}</div></div>
                    <div className="rounded bg-muted/60 p-2"><div className="text-xs text-muted-foreground">GPM</div><div className="font-semibold">{(s.total.gpm * 100).toFixed(1)}%</div></div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openTarget(o)} title="Reverse-engineer a uniform GPM from a target total sale value">
                    Target GPM
                  </Button>
                  <Button variant="outline" size="sm" disabled={!!busy} onClick={() => doExport(o, "xlsx")}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" />{busy === `${o.id}-xlsx` ? "…" : "Excel"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={!!busy} onClick={() => doExport(o, "docx")}>
                    <FileText className="h-4 w-4 mr-1" />{busy === `${o.id}-docx` ? "…" : "Word"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={!!busy} onClick={() => doExport(o, "pdf")}>
                    <FileDown className="h-4 w-4 mr-1" />{busy === `${o.id}-pdf` ? "…" : "PDF"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!targetOpt} onOpenChange={(v) => { if (!v) setTargetOpt(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Target sale → GPM — {targetOpt?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Enter the total sale value this option should come to (products, PS and AMC lines combined).
              A uniform GPM is solved for all adjustable rows. Rows with fixed pricing (sell override or APL/DDP) don't move.
            </p>
            {summaries[targetOpt?.id] && (
              <div className="rounded bg-muted/60 p-2 text-sm">
                Current option total: <span className="font-semibold">{fmt(summaries[targetOpt.id].total.sale_aed)} AED</span>
                <span className="text-muted-foreground"> · blended GPM {(summaries[targetOpt.id].total.gpm * 100).toFixed(1)}%</span>
              </div>
            )}
            <div><label className="text-sm font-medium">Target total sale (AED)</label>
              <Input type="number" value={targetSale} onChange={(e) => { setTargetSale(e.target.value); setTargetPreview(null); }} /></div>
            {targetError && <div className="text-sm text-red-600 dark:text-red-400">{targetError}</div>}
            {targetPreview && (
              <div className="rounded-md border border-violet-200 bg-violet-50 dark:bg-violet-500/10 dark:border-violet-500/30 p-3 text-sm space-y-1">
                <div>Implied uniform GPM: <span className="font-bold text-violet-800 dark:text-violet-300">{targetPreview.impliedGpmPct.toFixed(2)}%</span></div>
                <div className="text-xs text-violet-700 dark:text-violet-300">
                  Applies to {targetPreview.freeCount} adjustable row(s) (landed {fmt(targetPreview.landedFree)} AED).
                  {targetPreview.fixedCount > 0 && ` ${targetPreview.fixedCount} fixed-price row(s) stay as-is (${fmt(targetPreview.fixedSale)} AED).`}
                </div>
                {targetPreview.applied && (
                  <div className="text-xs font-medium text-emerald-700">
                    Applied — achieved total {fmt(targetPreview.achievedSale)} AED
                    {Math.abs(targetPreview.achievedSale - Number(targetSale)) > 1 && " (rounding on sell prices causes the small difference)"}.
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={targetBusy || !Number(targetSale)} onClick={previewTarget}>
                {targetBusy && !targetPreview ? "…" : "Calculate GPM"}
              </Button>
              <Button className="flex-1 bg-primary hover:bg-primary/90" disabled={targetBusy || !targetPreview || targetPreview.applied} onClick={applyTarget}>
                Apply GPM
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
