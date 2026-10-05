import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SummaryTab({ revisionId }: { revisionId: number | null }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (revisionId) api(`/api/summary/revision/${revisionId}`).then(setData).catch(console.error);
  }, [revisionId]);

  if (!revisionId || !data) return <div className="py-6 text-muted-foreground">Select a revision in the Costing Sheet tab.</div>;

  return (
    <div className="space-y-4 pt-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground">Buy price (FCR)</CardTitle></CardHeader>
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

      <div className="rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Buy price (FCR)</th>
              <th className="px-4 py-3 text-right">Landed cost (AED)</th>
              <th className="px-4 py-3 text-right">Sale value (AED)</th>
              <th className="px-4 py-3 text-right">GP (AED)</th>
              <th className="px-4 py-3 text-right">GPM</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((c: any) => (
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
          <tfoot className="bg-slate-50 font-semibold">
            <tr>
              <td className="px-4 py-2.5">Total</td>
              <td className="px-4 py-2.5 text-right">{fmt(data.total.buy_fcr)}</td>
              <td className="px-4 py-2.5 text-right">{fmt(data.total.landed_aed)}</td>
              <td className="px-4 py-2.5 text-right">{fmt(data.total.sale_aed)}</td>
              <td className="px-4 py-2.5 text-right">{fmt(data.total.gp_aed)}</td>
              <td className="px-4 py-2.5 text-right">{(data.total.gpm * 100).toFixed(1)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="text-xs text-muted-foreground">
        {data.itemCount} costing items · {data.revision.label}. Sale value uses 171H DDP pricing where set, otherwise selling price (landed ÷ (1 − GPM)).
      </div>
    </div>
  );
}
