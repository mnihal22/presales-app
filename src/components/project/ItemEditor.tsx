import { useState } from "react";
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
}

export const emptyItemForm: ItemForm = {
  category: "Products (CAPEX)", description: "", vendor: "", qty: "1", unitCost: "", marginPct: "25",
  partNo: "", bomQty: "1", months: "1", serviceTerms: "", listUnitPrice: "",
  partnerDiscountPct: "0", discountedUnitBuyPrice: "", proposalDescription: "",
  exchRate: "1", landedFactor: "1", sellOverride: "", isAmc: false, isSwSupport: false,
  itemGrouping: "", productGrouping: "", offerGrouping: "", inProposal: true,
  mapNo: "", aplUnitPrice: "", aplDiscountPct: "0", notes: "",
};

export function itemToForm(it: any): ItemForm {
  const s = (v: any) => (v == null ? "" : String(v));
  return {
    category: it.category, description: it.description, vendor: it.vendor || "", qty: s(it.qty),
    unitCost: s(it.unit_cost), marginPct: s(it.margin_pct), partNo: it.part_no || "", bomQty: s(it.bom_qty ?? 1),
    months: s(it.months ?? 1), serviceTerms: it.service_terms || "", listUnitPrice: s(it.list_unit_price),
    partnerDiscountPct: s(it.partner_discount_pct ?? 0), discountedUnitBuyPrice: s(it.discounted_unit_buy_price),
    proposalDescription: it.proposal_description || "", exchRate: s(it.exch_rate ?? 1), landedFactor: s(it.landed_factor ?? 1),
    sellOverride: s(it.sell_override), isAmc: !!it.is_amc, isSwSupport: !!it.is_sw_support,
    itemGrouping: it.item_grouping || "", productGrouping: it.product_grouping || "", offerGrouping: it.offer_grouping || "",
    inProposal: !!it.in_proposal, mapNo: it.map_no || "", aplUnitPrice: s(it.apl_unit_price),
    aplDiscountPct: s(it.apl_discount_pct ?? 0), notes: it.notes || "",
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
    exchRate: Number(f.exchRate) || 1, landedFactor: Number(f.landedFactor) || 1,
    sellOverride: num(f.sellOverride), isAmc: f.isAmc, isSwSupport: f.isSwSupport,
    itemGrouping: f.itemGrouping || null, productGrouping: f.productGrouping || null,
    offerGrouping: f.offerGrouping || null, inProposal: f.inProposal, mapNo: f.mapNo || null,
    aplUnitPrice: num(f.aplUnitPrice), aplDiscountPct: Number(f.aplDiscountPct) || 0,
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
      <DialogContent className="max-w-3xl">
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
          <Field label="Description *"><Input value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="Proposal description (customer-facing, optional)"><Input value={f.proposalDescription} onChange={(e) => set({ proposalDescription: e.target.value })} /></Field>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Quantities &amp; terms</div>
            <div className="grid grid-cols-4 gap-3">
              {numInput("qty", "Qty")}
              {numInput("bomQty", "BOM Qty")}
              {numInput("months", "Months (term ×)")}
              <Field label="Service terms"><Input value={f.serviceTerms} onChange={(e) => set({ serviceTerms: e.target.value })} placeholder="e.g. 36 months" /></Field>
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Buy side (foreign currency)</div>
            <div className="grid grid-cols-4 gap-3">
              {numInput("listUnitPrice", "List unit price")}
              {numInput("partnerDiscountPct", "Partner disc. %")}
              {numInput("unitCost", "Unit buy price (FCR)")}
              {numInput("discountedUnitBuyPrice", "Disc. unit buy price")}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {numInput("exchRate", "Exchange rate")}
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
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Grouping &amp; mapping</div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Map #"><Input value={f.mapNo} onChange={(e) => set({ mapNo: e.target.value })} placeholder="SBC1.01" /></Field>
              <Field label="Item grouping"><Input value={f.itemGrouping} onChange={(e) => set({ itemGrouping: e.target.value })} /></Field>
              <Field label="Product grouping"><Input value={f.productGrouping} onChange={(e) => set({ productGrouping: e.target.value })} /></Field>
              <Field label="Offer grouping"><Input value={f.offerGrouping} onChange={(e) => set({ offerGrouping: e.target.value })} placeholder="sbc1k" /></Field>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.inProposal} onCheckedChange={(v) => set({ inProposal: !!v })} /> Include in proposal</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.isAmc} onCheckedChange={(v) => set({ isAmc: !!v })} /> AMC</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.isSwSupport} onCheckedChange={(v) => set({ isSwSupport: !!v })} /> Software support</label>
            </div>
          </div>

          <Field label="Notes"><Input value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <Button className="w-full" disabled={busy || !f.description} onClick={save}>{busy ? "Saving…" : "Save item"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
