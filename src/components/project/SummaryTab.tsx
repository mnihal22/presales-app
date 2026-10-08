import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CATS = ["Products (CAPEX)", "Subscriptions & Support (OPEX)", "Professional Services", "AMC"];

function CatTable({ categories, total }: any) {
  return (
    <div className="rounded-md border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3 text-right">Buy price (USD)</th>
            <th className="px-4 py-3 text-right">Landed cost (AED)</th>
            <th className="px-4 py-3 text-right">Sale value (AED)</th>
            <th className="px-4 py-3 text-right">GP (AED)</th>
            <th className="px-4 py-3 text-right">GPM</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c: any) => (
            <tr key={c.category} className="border-b last:border-0">
              <td className="px-4 py-2.5 font-medium">{c.category}</td>
              <td className="px-4 py-2.5 text-right">{fmt(c.buy_fcr)}</td>
              <td className="px-4 py-2.5 text-right">{fmt(c.landed_aed)}</td>
              <td className="px-4 py-2.5 text-right">{fmt(c.sale_aed)}</td>
              <td className="px-4 py-2.5 text-right">{fmt(c.gp_aed)}</td>
              <td className="px-4 py-2.5 text-right">{(c.gpm * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/60 font-semibold">
          <tr>
            <td className="px-4 py-2.5">Total</td>
            <td className="px-4 py-2.5 text-right">{fmt(total.buy_fcr)}</td>
            <td className="px-4 py-2.5 text-right">{fmt(total.landed_aed)}</td>
            <td className="px-4 py-2.5 text-right">{fmt(total.sale_aed)}</td>
            <td className="px-4 py-2.5 text-right">{fmt(total.gp_aed)}</td>
            <td className="px-4 py-2.5 text-right">{(total.gpm * 100).toFixed(1)}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function SummaryTab({ revisionId }: { revisionId: number | null }) {
  const [data, setData] = useState<any>(null);
  const [optSums, setOptSums] = useState<any[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    if (revisionId) {
      api(`/api/summary/revision/${revisionId}`).then(setData).catch(console.error);
      api<any[]>(`/api/summary/revision/${revisionId}/options`).then((rows) => {
        setOptSums(rows);
        setSelected(rows.map((r) => r.option.id)); // all selected by default
      }).catch(() => setOptSums([]));
    }
  }, [revisionId]);

  // Combined totals across the checked options
  const combined = useMemo(() => {
    const picks = optSums.filter((o) => selected.includes(o.option.id));
    if (!picks.length) return null;
    const sum = (fn: (s: any) => number) => picks.reduce((a, s) => a + fn(s), 0);
    const total = {
      category: "Total",
      buy_fcr: sum((s) => s.total.buy_fcr),
      landed_aed: sum((s) => s.total.landed_aed),
      sale_aed: sum((s) => s.total.sale_aed),
      gp_aed: sum((s) => s.total.gp_aed),
      gpm: 0,
    };
    total.gpm = total.sale_aed !== 0 ? total.gp_aed / total.sale_aed : 0;
    const categories = CATS.map((cat) => {
      const c = {
        category: cat,
        buy_fcr: sum((s) => s.categories.find((x: any) => x.category === cat)?.buy_fcr ?? 0),
        landed_aed: sum((s) => s.categories.find((x: any) => x.category === cat)?.landed_aed ?? 0),
        sale_aed: sum((s) => s.categories.find((x: any) => x.category === cat)?.sale_aed ?? 0),
        gp_aed: sum((s) => s.categories.find((x: any) => x.category === cat)?.gp_aed ?? 0),
        gpm: 0,
      };
      c.gpm = c.sale_aed !== 0 ? c.gp_aed / c.sale_aed : 0;
      return c;
    });
    return { total, categories, amc_basis_sale_aed: sum((s) => s.amc_basis_sale_aed), count: picks.length };
  }, [optSums, selected]);

  if (!revisionId || !data) return <div className="py-6 text-muted-foreground">Select a revision in the Costing Sheet tab.</div>;

  const toggleOpt = (id: number, v: boolean) =>
    setSelected((prev) => (v ? [...prev, id] : prev.filter((x) => x !== id)));

  return (
    <div className="space-y-4 pt-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground">Buy price (USD)</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{fmt(data.total.buy_fcr)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground">Landed cost (AED)</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{fmt(data.total.landed_aed)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground">Sale value (AED)</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{fmt(data.total.sale_aed)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground">Gross profit (AED)</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold text-emerald-700">{fmt(data.total.gp_aed)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground">GPM</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold text-emerald-700">{(data.total.gpm * 100).toFixed(1)}%</div></CardContent></Card>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Whole revision — {data.revision.label}</h3>
        <CatTable categories={data.categories} total={data.total} />
      </div>
      {(data.products_sale_aed > 0 || data.support_subscription_sale_aed > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border bg-card px-4 py-2.5 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Products</span>
            <span className="font-semibold">{fmt(data.products_sale_aed)} AED</span>
          </div>
          <div className="rounded-md border bg-card px-4 py-2.5 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Support Subscription <span className="text-xs">(SW support items)</span></span>
            <span className="font-semibold">{fmt(data.support_subscription_sale_aed)} AED</span>
          </div>
        </div>
      )}
      {data.amc_basis_sale_aed > 0 && (
        <div className="rounded-md border border-violet-200 bg-violet-50 dark:bg-violet-500/10 dark:border-violet-500/30 px-4 py-2.5 text-sm">
          <span className="font-medium text-violet-800 dark:text-violet-300">AMC calculation base: {fmt(data.amc_basis_sale_aed)} AED</span>
          <span className="text-violet-600 dark:text-violet-400"> — value of all items flagged "Counts toward AMC base" (new + legacy equipment). Legacy AMC-only items are excluded from the totals above.</span>
        </div>
      )}

      {/* ---- per-option segregated summary + combine ---- */}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Per proposal option</h3>
        {optSums.length === 0 ? (
          <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
            No proposal options on this revision yet — create them in the Proposal Options tab.
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              Tick the options to combine — the combined row and breakdown below sum only the selected options.
            </p>
            <div className="rounded-md border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 w-10"></th>
                    <th className="px-4 py-3">Option</th>
                    <th className="px-4 py-3 text-right">Items</th>
                    <th className="px-4 py-3 text-right">Buy (USD)</th>
                    <th className="px-4 py-3 text-right">Landed (AED)</th>
                    <th className="px-4 py-3 text-right">Sale (AED)</th>
                    <th className="px-4 py-3 text-right">GP (AED)</th>
                    <th className="px-4 py-3 text-right">GPM</th>
                  </tr>
                </thead>
                <tbody>
                  {optSums.map((o) => (
                    <tr key={o.option.id} className={`border-b last:border-0 ${selected.includes(o.option.id) ? "" : "opacity-55"}`}>
                      <td className="px-3 py-2.5">
                        <Checkbox checked={selected.includes(o.option.id)} onCheckedChange={(v) => toggleOpt(o.option.id, !!v)} />
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        {o.option.name}
                        {o.option.discount_mode ? <Badge variant="secondary" className="ml-2">discounted</Badge> : null}
                      </td>
                      <td className="px-4 py-2.5 text-right">{o.itemCount}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(o.total.buy_fcr)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(o.total.landed_aed)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(o.total.sale_aed)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(o.total.gp_aed)}</td>
                      <td className="px-4 py-2.5 text-right">{(o.total.gpm * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                {combined && (
                  <tfoot className="bg-primary/5 font-semibold">
                    <tr>
                      <td className="px-3 py-2.5"></td>
                      <td className="px-4 py-2.5">Combined — {combined.count} selected</td>
                      <td className="px-4 py-2.5 text-right">{optSums.filter((o) => selected.includes(o.option.id)).reduce((a, s) => a + s.itemCount, 0)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(combined.total.buy_fcr)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(combined.total.landed_aed)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(combined.total.sale_aed)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(combined.total.gp_aed)}</td>
                      <td className="px-4 py-2.5 text-right">{(combined.total.gpm * 100).toFixed(1)}%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {combined && (
              <div className="mt-3">
                <h4 className="mb-2 text-sm font-semibold">Combined breakdown — {combined.count} selected option{combined.count !== 1 ? "s" : ""}</h4>
                <CatTable categories={combined.categories} total={combined.total} />
                {combined.amc_basis_sale_aed > 0 && (
                  <div className="mt-2 rounded-md border border-violet-200 bg-violet-50 dark:bg-violet-500/10 dark:border-violet-500/30 px-4 py-2.5 text-sm">
                    <span className="font-medium text-violet-800 dark:text-violet-300">Combined AMC base: {fmt(combined.amc_basis_sale_aed)} AED</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="text-xs text-muted-foreground">
        {data.itemCount} costing items · {data.revision.label}. Sale value uses 171H DDP pricing where set, otherwise selling price (landed ÷ (1 − GPM)).
      </div>
    </div>
  );
}
