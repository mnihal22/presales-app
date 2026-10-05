import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";

// Global reusable masters — helpers only, never mandatory on items.
// Editable by admins and presales-module managers; readable by everyone.

function useMaster(kind: string) {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api<any[]>(`/api/masters/${kind}`).then(setRows).catch(console.error);
  useEffect(() => { load(); }, [kind]);
  return { rows, reload: load };
}

function ErrorLine({ msg }: { msg: string }) {
  return msg ? <div className="text-sm text-red-600 dark:text-red-400">{msg}</div> : null;
}

function RateCard() {
  const { rows, reload } = useMaster("rate-card");
  const [form, setForm] = useState({ code: "", description: "", rateAed: "" });
  const [error, setError] = useState("");

  const add = async () => {
    setError("");
    try {
      await api("/api/masters/rate-card", { method: "POST", body: JSON.stringify({ code: form.code.trim(), description: form.description.trim() || null, rateAed: Number(form.rateAed) }) });
      setForm({ code: "", description: "", rateAed: "" });
      reload();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Service rate card (AED)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-1">Code</th><th>Description</th><th className="text-right">Rate (AED)</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1.5 font-mono">{r.code}</td>
                <td>{r.description}</td>
                <td className="text-right">{Number(r.rate_aed).toLocaleString()}</td>
                <td className="text-right">
                  <Button variant="ghost" size="sm" onClick={async () => { await api(`/api/masters/rate-card/${r.id}`, { method: "DELETE" }); reload(); }}>
                    <Trash2 className="h-4 w-4 text-muted-foreground/70" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-[7rem_1fr_7rem_auto] gap-2 items-end">
          <div><label className="text-xs text-muted-foreground">Code</label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PS-DAY" /></div>
          <div><label className="text-xs text-muted-foreground">Description</label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><label className="text-xs text-muted-foreground">Rate AED</label><Input type="number" value={form.rateAed} onChange={(e) => setForm({ ...form, rateAed: e.target.value })} /></div>
          <Button size="sm" disabled={!form.code || !form.rateAed} onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
        <ErrorLine msg={error} />
      </CardContent>
    </Card>
  );
}

function SupportTypes() {
  const { rows, reload } = useMaster("support-types");
  const [form, setForm] = useState({ name: "", amcPct: "" });
  const [error, setError] = useState("");

  const add = async () => {
    setError("");
    try {
      await api("/api/masters/support-types", { method: "POST", body: JSON.stringify({ name: form.name.trim(), amcPct: Number(form.amcPct) }) });
      setForm({ name: "", amcPct: "" });
      reload();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Support types — AMC %</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-1">Support type</th><th className="text-right">AMC % of base</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1.5">{r.name}</td>
                <td className="text-right">{r.amc_pct}%</td>
                <td className="text-right">
                  <Button variant="ghost" size="sm" onClick={async () => { await api(`/api/masters/support-types/${r.id}`, { method: "DELETE" }); reload(); }}>
                    <Trash2 className="h-4 w-4 text-muted-foreground/70" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-[1fr_7rem_auto] gap-2 items-end">
          <div><label className="text-xs text-muted-foreground">Name</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="8x5 NBD" /></div>
          <div><label className="text-xs text-muted-foreground">AMC %</label><Input type="number" step="any" value={form.amcPct} onChange={(e) => setForm({ ...form, amcPct: e.target.value })} /></div>
          <Button size="sm" disabled={!form.name || form.amcPct === ""} onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
        <ErrorLine msg={error} />
      </CardContent>
    </Card>
  );
}

function MpgDiscounts() {
  const { rows, reload } = useMaster("mpg-discounts");
  const [form, setForm] = useState({ vendor: "", mpg: "", category: "", type: "", discountPct: "" });
  const [error, setError] = useState("");

  const add = async () => {
    setError("");
    try {
      await api("/api/masters/mpg-discounts", {
        method: "POST",
        body: JSON.stringify({
          vendor: form.vendor.trim(), mpg: form.mpg.trim(),
          category: form.category.trim() || null, type: form.type.trim() || null,
          discountPct: Number(form.discountPct),
        }),
      });
      setForm({ vendor: "", mpg: "", category: "", type: "", discountPct: "" });
      reload();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-2"><CardTitle className="text-base">Vendor MPG discount table (171H)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-1">Vendor</th><th>MPG</th><th>Category</th><th>Type</th><th className="text-right">Discount %</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1.5">{r.vendor}</td>
                <td className="font-mono">{r.mpg}</td>
                <td>{r.category}</td>
                <td>{r.type}</td>
                <td className="text-right">{r.discount_pct}%</td>
                <td className="text-right">
                  <Button variant="ghost" size="sm" onClick={async () => { await api(`/api/masters/mpg-discounts/${r.id}`, { method: "DELETE" }); reload(); }}>
                    <Trash2 className="h-4 w-4 text-muted-foreground/70" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-[1fr_6rem_1fr_1fr_7rem_auto] gap-2 items-end">
          <div><label className="text-xs text-muted-foreground">Vendor</label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Avaya" /></div>
          <div><label className="text-xs text-muted-foreground">MPG</label><Input value={form.mpg} onChange={(e) => setForm({ ...form, mpg: e.target.value })} placeholder="1P" /></div>
          <div><label className="text-xs text-muted-foreground">Category</label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div><label className="text-xs text-muted-foreground">Type</label><Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} /></div>
          <div><label className="text-xs text-muted-foreground">Disc. %</label><Input type="number" step="any" value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} /></div>
          <Button size="sm" disabled={!form.vendor || !form.mpg || form.discountPct === ""} onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
        <ErrorLine msg={error} />
      </CardContent>
    </Card>
  );
}

export default function Masters() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Masters</h1>
        <p className="text-sm text-muted-foreground">
          Global reusable tables — rate card, support-type AMC percentages, vendor MPG discounts.
          These are helpers for faster, consistent costing; items can always be overridden manually.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <RateCard />
        <SupportTypes />
        <MpgDiscounts />
      </div>
    </div>
  );
}
