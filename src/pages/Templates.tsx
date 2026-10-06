import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Star, Pencil } from "lucide-react";

const LAYOUTS = [
  { value: "standard", label: "Standard — Unit Price", hint: "Item / Description / Unit Price / Qty / Total" },
  { value: "item_code", label: "Item Code + Special Discount", hint: "Adds item-code column and special-discount total row" },
  { value: "apl", label: "APL / DDP (171H)", hint: "APL price, discount on APL, discounted DDP price columns" },
];

const emptyForm = {
  name: "", description: "", layout: "standard", companyName: "ATCOM", title: "Commercial Proposal",
  accentColor: "#1F4E79", vatPct: "5", currencyLabel: "UAE Dirhams", currencyMinor: "Fils",
  showSpecialDiscount: false, specialDiscountPct: "0", amountInWords: true, footerNote: "", terms: "",
  discountMode: false, discountDisplay: "lumpsum",
};

export default function Templates() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = () => api<any[]>("/api/templates").then(setRows).catch(console.error);
  useEffect(() => { load(); }, []);

  const openEditor = (t?: any) => {
    if (t) {
      const c = t.config || {};
      setEditId(t.id);
      setForm({
        name: t.name, description: t.description || "", layout: c.layout || "standard",
        companyName: c.companyName || "", title: c.title || "Commercial Proposal",
        accentColor: c.accentColor || "#1F4E79", vatPct: String(c.vatPct ?? 5),
        currencyLabel: c.currencyLabel || "UAE Dirhams", currencyMinor: c.currencyMinor || "Fils",
        showSpecialDiscount: !!c.showSpecialDiscount, specialDiscountPct: String(c.specialDiscountPct ?? 0),
        amountInWords: c.amountInWords ?? true, footerNote: c.footerNote || "",
        terms: (c.terms || []).join("\n"),
        discountMode: !!c.discountMode, discountDisplay: c.discountDisplay === "line_item" ? "line_item" : "lumpsum",
      });
    } else {
      setEditId(null);
      setForm({ ...emptyForm });
    }
    setOpen(true);
  };

  const save = async () => {
    const body = {
      name: form.name,
      description: form.description || null,
      config: {
        layout: form.layout, companyName: form.companyName, title: form.title, accentColor: form.accentColor,
        vatPct: Number(form.vatPct) || 0, currencyLabel: form.currencyLabel, currencyMinor: form.currencyMinor,
        showSpecialDiscount: form.showSpecialDiscount, specialDiscountPct: Number(form.specialDiscountPct) || 0,
        amountInWords: form.amountInWords, footerNote: form.footerNote,
        terms: form.terms.split("\n").map((t) => t.trim()).filter(Boolean),
        discountMode: form.discountMode, discountDisplay: form.discountDisplay,
      },
    };
    if (editId) await api(`/api/templates/${editId}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/templates", { method: "POST", body: JSON.stringify(body) });
    setOpen(false);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proposal Templates</h1>
          <p className="text-sm text-muted-foreground">Layouts control proposal columns, VAT, discounts and wording. Based on your existing sheets — we'll refine the designs together.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={() => openEditor()}><Plus className="h-4 w-4 mr-1" /> New template</Button></DialogTrigger>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader><DialogTitle>{editId ? "Edit template" : "Create template"}</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              <div><label className="text-sm font-medium">Template name *</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Layout (columns)</label>
                <Select value={form.layout} onValueChange={(v) => setForm({ ...form, layout: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LAYOUTS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="mt-1 text-xs text-muted-foreground">{LAYOUTS.find((l) => l.value === form.layout)?.hint}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Company name</label><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Document title</label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><label className="text-sm font-medium">VAT %</label><Input type="number" value={form.vatPct} onChange={(e) => setForm({ ...form, vatPct: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Accent color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} className="h-9 w-14 cursor-pointer rounded border" />
                    <Input value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} className="w-28" />
                  </div></div>
                <div><label className="text-sm font-medium">Currency (words)</label><Input value={form.currencyLabel} onChange={(e) => setForm({ ...form, currencyLabel: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Currency minor</label><Input value={form.currencyMinor} onChange={(e) => setForm({ ...form, currencyMinor: e.target.value })} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.showSpecialDiscount} onCheckedChange={(v) => setForm({ ...form, showSpecialDiscount: v })} /> Show "Total after Special Discount" row
              </label>
              {form.showSpecialDiscount && (
                <div><label className="text-sm font-medium">Special discount %</label><Input type="number" value={form.specialDiscountPct} onChange={(e) => setForm({ ...form, specialDiscountPct: e.target.value })} /></div>
              )}
              <div className="rounded-md border p-3 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.discountMode} onCheckedChange={(v) => setForm({ ...form, discountMode: v })} /> Discounted offer included by default
                </label>
                {form.discountMode && (
                  <div><label className="text-sm font-medium">Discount presentation</label>
                    <Select value={form.discountDisplay} onValueChange={(v) => setForm({ ...form, discountDisplay: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lumpsum">Lump-sum discount row (normal)</SelectItem>
                        <SelectItem value="line_item">Line-by-line discounted prices (special cases)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">New proposal options created with this template start with these discount settings — still editable per option.</p>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.amountInWords} onCheckedChange={(v) => setForm({ ...form, amountInWords: v })} /> Show amount in words
              </label>
              <div><label className="text-sm font-medium">Footer note</label><Input value={form.footerNote} onChange={(e) => setForm({ ...form, footerNote: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Terms (one per line)</label>
                <textarea className="w-full rounded-md border p-2 text-sm" rows={4} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></div>
              <Button className="w-full" disabled={!form.name} onClick={save}>Save template</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {rows.map((t) => (
          <div key={t.id} className="rounded-md border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-medium">{t.name}</div>
              <div className="flex items-center gap-1">
                {t.is_default
                  ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" variant="secondary">Default</Badge>
                  : <Button variant="ghost" size="sm" onClick={async () => { await api(`/api/templates/${t.id}/set-default`, { method: "POST" }); load(); }}><Star className="h-4 w-4 mr-1" /> Set default</Button>}
                <Button variant="ghost" size="sm" onClick={() => openEditor(t)}><Pencil className="h-4 w-4" /></Button>
                {!t.is_default && (
                  <Button variant="ghost" size="sm" onClick={async () => { if (confirm("Delete template?")) { await api(`/api/templates/${t.id}`, { method: "DELETE" }); load(); } }}>
                    <Trash2 className="h-4 w-4 text-muted-foreground/70" />
                  </Button>
                )}
              </div>
            </div>
            {t.description && <div className="text-sm text-muted-foreground">{t.description}</div>}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block h-3 w-3 rounded" style={{ background: t.config?.accentColor || "#ccc" }} />
              {LAYOUTS.find((l) => l.value === t.config?.layout)?.label || "Standard"} · VAT {t.config?.vatPct ?? 5}% {t.config?.amountInWords ? "· amount in words" : ""} {t.config?.discountMode ? `· discounted offer (${t.config?.discountDisplay === "line_item" ? "line-by-line" : "lump-sum"})` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
