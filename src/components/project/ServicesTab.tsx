import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowRightToLine } from "lucide-react";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const METHOD_LABELS: Record<string, string> = {
  fixed: "Fixed lump sum (LOT)",
  rate: "Rate × effort",
  percent: "% of product total",
};

export default function ServicesTab({ projectId, activeRevision }: any) {
  const [services, setServices] = useState<any[]>([]);
  const [capexSale, setCapexSale] = useState(0);
  const [open, setOpen] = useState(false);
  const [pushTarget, setPushTarget] = useState<any>(null);
  const [form, setForm] = useState({ name: "", method: "fixed", rate: "", effort: "", effortUnit: "days", percent: "", amount: "", notes: "" });
  const [pushForm, setPushForm] = useState({ category: "Professional Services", marginPct: "25" });

  const load = () =>
    api<any>(`/api/services/project/${projectId}`).then((d) => {
      setServices(d.services);
      setCapexSale(d.capexSaleAed);
    }).catch(console.error);

  useEffect(() => { load(); }, [projectId]);

  const computedAmount = () => {
    if (form.method === "fixed") return Number(form.amount) || 0;
    if (form.method === "rate") return (Number(form.rate) || 0) * (Number(form.effort) || 0);
    return (capexSale * (Number(form.percent) || 0)) / 100;
  };

  const create = async () => {
    await api("/api/services", {
      method: "POST",
      body: JSON.stringify({
        projectId, revisionId: activeRevision?.id ?? null,
        name: form.name, method: form.method,
        rate: form.rate ? Number(form.rate) : null, effort: form.effort ? Number(form.effort) : null,
        effortUnit: form.effortUnit || null, percent: form.percent ? Number(form.percent) : null,
        amount: Number(form.amount) || 0, notes: form.notes || null,
      }),
    });
    setOpen(false);
    setForm({ name: "", method: "fixed", rate: "", effort: "", effortUnit: "days", percent: "", amount: "", notes: "" });
    load();
  };

  const push = async () => {
    await api(`/api/services/${pushTarget.id}/push`, {
      method: "POST",
      body: JSON.stringify({ revisionId: activeRevision.id, category: pushForm.category, marginPct: Number(pushForm.marginPct) || 25 }),
    });
    setPushTarget(null);
    load();
  };

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Price professional services and AMC here, then push them into the {activeRevision?.label} costing sheet. Product (CAPEX) sale value: <span className="font-medium text-foreground">{fmt(capexSale)} AED</span>
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New service calc</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Service calculation</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><label className="text-sm font-medium">Name *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Onsite installation" /></div>
              <div><label className="text-sm font-medium">Pricing method</label>
                <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              {form.method === "fixed" && (
                <div><label className="text-sm font-medium">Fixed amount (cost, AED)</label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              )}
              {form.method === "rate" && (
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="text-sm font-medium">Rate</label>
                    <Input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
                  <div><label className="text-sm font-medium">Effort</label>
                    <Input type="number" value={form.effort} onChange={(e) => setForm({ ...form, effort: e.target.value })} /></div>
                  <div><label className="text-sm font-medium">Unit</label>
                    <Select value={form.effortUnit} onValueChange={(v) => setForm({ ...form, effortUnit: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["days", "engineers", "visits", "months", "hours"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select></div>
                </div>
              )}
              {form.method === "percent" && (
                <div><label className="text-sm font-medium">Percent of product (CAPEX) sale value</label>
                  <Input type="number" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} /></div>
              )}
              <div><label className="text-sm font-medium">Notes</label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="rounded bg-slate-50 p-2 text-sm">Calculated cost: <span className="font-semibold">{fmt(computedAmount())} AED</span></div>
              <Button className="w-full" disabled={!form.name} onClick={create}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Details</th>
              <th className="px-4 py-3 text-right">Cost (AED)</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No service calculations yet.</td></tr>}
            {services.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">{s.name}</td>
                <td className="px-4 py-2.5">{METHOD_LABELS[s.method]}</td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">
                  {s.method === "rate" && `${fmt(s.rate)} × ${s.effort} ${s.effort_unit || ""}`}
                  {s.method === "percent" && `${s.percent}% of CAPEX sale`}
                  {s.method === "fixed" && "Fixed"}
                </td>
                <td className="px-4 py-2.5 text-right">{fmt(s.amount)}</td>
                <td className="px-4 py-2.5">
                  {s.costing_item_id
                    ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">In costing</Badge>
                    : <Badge variant="secondary">Not pushed</Badge>}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-right">
                  {!s.costing_item_id && activeRevision?.status === "open" && (
                    <Button variant="outline" size="sm" onClick={() => setPushTarget(s)}>
                      <ArrowRightToLine className="h-3 w-3 mr-1" /> Push to costing
                    </Button>
                  )}
                  <button className="ml-2 text-slate-400 hover:text-red-600 align-middle"
                    onClick={async () => { if (confirm("Delete?")) { await api(`/api/services/${s.id}`, { method: "DELETE" }); load(); } }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!pushTarget} onOpenChange={(v) => !v && setPushTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Push "{pushTarget?.name}" to {activeRevision?.label}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-sm font-medium">Category</label>
              <Select value={pushForm.category} onValueChange={(v) => setPushForm({ ...pushForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Professional Services">Professional Services</SelectItem>
                  <SelectItem value="AMC">AMC</SelectItem>
                </SelectContent>
              </Select></div>
            <div><label className="text-sm font-medium">GPM %</label>
              <Input type="number" value={pushForm.marginPct} onChange={(e) => setPushForm({ ...pushForm, marginPct: e.target.value })} /></div>
            <div className="rounded bg-slate-50 p-2 text-sm">
              Cost {fmt(pushTarget?.amount || 0)} AED → sale ≈ <span className="font-semibold">{fmt((pushTarget?.amount || 0) / (1 - (Number(pushForm.marginPct) || 0) / 100))} AED</span>
            </div>
            <Button className="w-full" onClick={push}>Push to costing sheet</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
