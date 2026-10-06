import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const CATEGORIES = [
  "Products (CAPEX)",
  "Subscriptions & Support (OPEX)",
  "Professional Services",
  "AMC",
];

export interface ItemForm {
  category: string; description: string; vendor: string; qty: string; unitCost: string; marginPct: string;
  partNo: string; bomQty: string; months: string; serviceTerms: string; listUnitPrice: string;
  partnerDiscountPct: string; discountedUnitBuyPrice: string; proposalDescription: string;
  exchRate: string; landedFactor: string; sellOverride: string; isAmc: boolean; isSwSupport: boolean;
  itemGrouping: string; productGrouping: string; offerGrouping: string; inProposal: boolean;
  mapNo: string; aplUnitPrice: string; aplDiscountPct: string; notes: string;
  isAmcBasis: boolean; mpgCode: string; rowColor: string; discSellOverride: string;
  pricePeriod: string; // 'monthly' (unit × months) | 'total' (annual / whole term)
}

export const ROW_COLORS: { key: string; label: string; swatch: string }[] = [
  { key: "", label: "None", swatch: "bg-card border" },
  { key: "yellow", label: "Yellow", swatch: "bg-yellow-300" },
  { key: "green", label: "Green", swatch: "bg-emerald-300" },
  { key: "red", label: "Red", swatch: "bg-red-300" },
  { key: "blue", label: "Blue", swatch: "bg-sky-300" },
  { key: "violet", label: "Violet", swatch: "bg-violet-300" },
  { key: "orange", label: "Orange", swatch: "bg-orange-300" },
];

export const emptyItemForm: ItemForm = {
  category: "Products (CAPEX)", description: "", vendor: "", qty: "1", unitCost: "", marginPct: "25",
  partNo: "", bomQty: "1", months: "1", serviceTerms: "", listUnitPrice: "",
  partnerDiscountPct: "0", discountedUnitBuyPrice: "", proposalDescription: "",
  exchRate: "3.68", landedFactor: "1", sellOverride: "", isAmc: false, isSwSupport: false,
  itemGrouping: "", productGrouping: "", offerGrouping: "", inProposal: true,
  mapNo: "", aplUnitPrice: "", aplDiscountPct: "0", notes: "",
  isAmcBasis: false, mpgCode: "", rowColor: "", discSellOverride: "",
  pricePeriod: "monthly",
};

export function itemToForm(it: any): ItemForm {
  const s = (v: any) => (v == null ? "" : String(v));
  return {
    category: it.category, description: it.description, vendor: it.vendor || "", qty: s(it.qty),
    unitCost: s(it.unit_cost), marginPct: s(it.margin_pct), partNo: it.part_no || "", bomQty: s(it.bom_qty ?? 1),
    months: s(it.months ?? 1), serviceTerms: it.service_terms || "", listUnitPrice: s(it.list_unit_price),
    partnerDiscountPct: s(it.partner_discount_pct ?? 0), discountedUnitBuyPrice: s(it.discounted_unit_buy_price),
    proposalDescription: it.proposal_description || "", exchRate: s(it.exch_rate ?? 3.68), landedFactor: s(it.landed_factor ?? 1),
    sellOverride: s(it.sell_override), isAmc: !!it.is_amc, isSwSupport: !!it.is_sw_support,
    itemGrouping: it.item_grouping || "", productGrouping: it.product_grouping || "", offerGrouping: it.offer_grouping || "",
    inProposal: !!it.in_proposal, mapNo: it.map_no || "", aplUnitPrice: s(it.apl_unit_price),
    aplDiscountPct: s(it.apl_discount_pct ?? 0), notes: it.notes || "",
    isAmcBasis: !!it.is_amc_basis, mpgCode: it.mpg_code || "",
    rowColor: it.row_color || "", discSellOverride: s(it.disc_sell_override),
    pricePeriod: it.price_period || "monthly",
  };
}

export function formToPayload(f: ItemForm) {
  const num = (v: string) => (v === "" ? null : Number(v));
  return {
    category: f.category, description: f.description, vendor: f.vendor || null,
    qty: Number(f.qty) || 1, unitCost: Number(f.unitCost) || 0, marginPct: Number(f.marginPct) || 0,
    notes: f.notes || null, partNo: f.partNo || null, bomQty: Number(f.bomQty) || 1,
    months: Number(f.months) || 1, serviceTerms: f.serviceTerms || null,
    listUnitPrice: num(f.listUnitPrice), partnerDiscountPct: Number(f.partnerDiscountPct) || 0,
    discountedUnitBuyPrice: num(f.discountedUnitBuyPrice), proposalDescription: f.proposalDescription || null,
    exchRate: Number(f.exchRate) || 3.68, landedFactor: Number(f.landedFactor) || 1,
    sellOverride: num(f.sellOverride), isAmc: f.isAmc, isSwSupport: f.isSwSupport,
    itemGrouping: f.itemGrouping || null, productGrouping: f.productGrouping || null,
    offerGrouping: f.offerGrouping || null, inProposal: f.inProposal, mapNo: f.mapNo || null,
    aplUnitPrice: num(f.aplUnitPrice), aplDiscountPct: Number(f.aplDiscountPct) || 0,
    isAmcBasis: f.isAmcBasis, mpgCode: f.mpgCode || null,
    rowColor: f.rowColor || null, discSellOverride: num(f.discSellOverride),
    pricePeriod: f.pricePeriod || "monthly",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export default function ItemEditor({
  open, onOpenChange, initial, onSaved, revisionId, itemId,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; initial: ItemForm;
  onSaved: () => void; revisionId: number; itemId?: number;
}) {
  const [f, setF] = useState<ItemForm>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // reset when opening with new item
  const key = `${open}-${itemId ?? "new"}-${initial.description}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) { setLastKey(key); setF(initial); }

  const set = (patch: Partial<ItemForm>) => setF((p) => ({ ...p, ...patch }));

  // MPG master lookup — helper only, never mandatory. If the vendor + MPG code
  // match a contracted discount, offer to apply it.
  const [mpgHint, setMpgHint] = useState<{ discount_pct: number; category: string | null } | null>(null);
  useEffect(() => {
    setMpgHint(null);
    const v = f.vendor.trim(), m = f.mpgCode.trim();
    if (!v || !m) return;
    const t = setTimeout(() => {
      api(`/api/masters/mpg-discounts/lookup/${encodeURIComponent(v)}/${encodeURIComponent(m)}`)
        .then((r: any) => setMpgHint(r?.found ? { discount_pct: r.discount_pct, category: r.category } : null))
        .catch(() => setMpgHint(null));
    }, 300);
    return () => clearTimeout(t);
  }, [f.vendor, f.mpgCode]);
  const numInput = (k: keyof ItemForm, label: string) => (
    <Field label={label}><Input type="number" step="any" value={f[k] as string} onChange={(e) => set({ [k]: e.target.value } as any)} /></Field>
  );

  const save = async () => {
    setBusy(true); setError("");
    try {
      const payload = formToPayload(f);
      if (!payload.description) throw new Error("Description required");
      if (itemId) await api(`/api/costing/items/${itemId}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api(`/api/costing/${revisionId}/items`, { method: "POST", body: JSON.stringify(payload) });
      onOpenChange(false);
      onSaved();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader><DialogTitle>{itemId ? "Edit costing item" : "Add costing item"}</DialogTitle></DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pr-2 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={f.category} onValueChange={(v) => set({ category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Vendor"><Input value={f.vendor} onChange={(e) => set({ vendor: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <Field label="MPG / product category code (optional)">
              <Input value={f.mpgCode} onChange={(e) => set({ mpgCode: e.target.value })} placeholder="e.g. 1P — vendor-dependent" />
            </Field>
            {mpgHint && (
              <div className="text-xs rounded-md bg-violet-50 border border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/30 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-violet-800 dark:text-violet-300">
                  Contracted discount: <b>{mpgHint.discount_pct}%</b>{mpgHint.category ? ` · ${mpgHint.category}` : ""}
                </span>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => set({ aplDiscountPct: String(mpgHint.discount_pct) })}>
                  Apply to APL disc.
                </Button>
              </div>
            )}
          </div>
          <Field label="Description *"><Input value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="Proposal description (customer-facing, optional)"><Input value={f.proposalDescription} onChange={(e) => set({ proposalDescription: e.target.value })} /></Field>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Quantities &amp; terms</div>
            <div className="grid grid-cols-4 gap-3">
              {numInput("qty", "Qty")}
              {numInput("bomQty", "BOM Qty")}
              <Field label="Unit price period">
                <Select value={f.pricePeriod} onValueChange={(v) => set({ pricePeriod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly — unit × months</SelectItem>
                    <SelectItem value="total">Total period — annual / whole term</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {f.pricePeriod === "monthly" ? (
                numInput("months", "Months (term ×)")
              ) : (
                <Field label="Months (term ×)">
                  <Input disabled value="—" title="Total-period pricing: unit price is not multiplied by months" />
                </Field>
              )}
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Service terms"><Input value={f.serviceTerms} onChange={(e) => set({ serviceTerms: e.target.value })} placeholder="e.g. 36 months" /></Field>
              {f.pricePeriod === "total" && (
                <div className="col-span-3 text-xs text-muted-foreground self-end pb-2">
                  Total-period pricing — the unit price already covers the full term (e.g. annual or 3-year price), so it is <b>not</b> multiplied by months.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Buy side (USD by default)</div>
            <div className="grid grid-cols-4 gap-3">
              {numInput("listUnitPrice", "List unit price")}
              {numInput("partnerDiscountPct", "Partner disc. %")}
              {numInput("unitCost", "Unit buy price (USD)")}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {numInput("exchRate", "Exchange rate (→ AED)")}
              {numInput("landedFactor", "Landed factor")}
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Sell side (AED)</div>
            <div className="grid grid-cols-4 gap-3">
              {numInput("marginPct", "GPM %")}
              {numInput("sellOverride", "Sell override (unit, AED)")}
              {numInput("aplUnitPrice", "APL unit price (171H)")}
              {numInput("aplDiscountPct", "Disc. on APL %")}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {numInput("discountedUnitBuyPrice", "Disc. unit buy price")}
              {numInput("discSellOverride", "Disc. sell override (unit, AED)")}
              <div className="col-span-2 text-xs text-muted-foreground self-end pb-2">
                Discounted-offer levers — used only when a proposal option has "Apply option discount" on. The standard offer above never changes.
              </div>
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Grouping &amp; mapping</div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Map #"><Input value={f.mapNo} onChange={(e) => set({ mapNo: e.target.value })} placeholder="SBC1.01" /></Field>
              <Field label="Item grouping"><Input value={f.itemGrouping} onChange={(e) => set({ itemGrouping: e.target.value })} /></Field>
              <Field label="Product grouping"><Input value={f.productGrouping} onChange={(e) => set({ productGrouping: e.target.value })} /></Field>
              <Field label="Offer grouping"><Input value={f.offerGrouping} onChange={(e) => set({ offerGrouping: e.target.value })} placeholder="sbc1k" /></Field>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Row color:</span>
              {ROW_COLORS.map((c) => (
                <button key={c.key} type="button" title={c.label}
                  onClick={() => set({ rowColor: c.key })}
                  className={`h-5 w-5 rounded-full ${c.swatch} ${f.rowColor === c.key ? "ring-2 ring-offset-1 ring-slate-700" : "opacity-60 hover:opacity-100"}`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.inProposal} onCheckedChange={(v) => set({ inProposal: !!v })} /> Include in proposal</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.isAmcBasis} onCheckedChange={(v) => set({ isAmcBasis: !!v })} /> Counts toward AMC base</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.isAmc} onCheckedChange={(v) => set({ isAmc: !!v })} /> AMC</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.isSwSupport} onCheckedChange={(v) => set({ isSwSupport: !!v })} /> Software support</label>
            </div>
            {f.isAmcBasis && (
              <p className="text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10 rounded px-2 py-1">
                This item's value feeds the "% of AMC base" service calculation.
                {f.inProposal
                  ? " It is new equipment — it also stays in the proposal and sale totals."
                  : " It is legacy/existing equipment — excluded from the proposal and sale totals, AMC base only."}
              </p>
            )}
          </div>

          <Field label="Notes"><Input value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          <Button className="w-full" disabled={busy || !f.description} onClick={save}>{busy ? "Saving…" : "Save item"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
