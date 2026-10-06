import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-sky-500/15 dark:text-sky-300",
  in_review: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  submitted: "bg-purple-100 text-purple-700 dark:bg-violet-500/15 dark:text-violet-300",
  won: "bg-green-100 text-green-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  lost: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  cancelled: "bg-slate-100 text-muted-foreground dark:bg-muted",
};

const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtPct = (g: number | null) => (g == null ? "—" : `${(g * 100).toFixed(1)}%`);

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api("/api/activity/dashboard").then(setData).catch(console.error);
  }, []);

  if (!data) return <div className="text-muted-foreground">Loading…</div>;
  const t = data.pipelineTotals;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Pipeline value strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card><CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground">Active pipeline ({t.count})</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">AED {fmt0(t.sale_aed)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground">Expected GP</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">AED {fmt0(t.gp_aed)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground">Blended GPM</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmtPct(t.gpm)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground">AMC base in pipeline</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-violet-600 dark:text-violet-300">AED {fmt0(t.amc_base_aed)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground">Won ({data.won.count})</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">AED {fmt0(data.won.sale_aed)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1 pt-4"><CardTitle className="text-xs text-muted-foreground">Lost / My open tasks</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{data.lostCount} <span className="text-muted-foreground text-sm font-normal">/ {data.myOpenTasks} tasks</span></div></CardContent></Card>
      </div>

      {/* Status counts */}
      <div className="flex flex-wrap gap-2">
        {data.statusCounts.map((s: any) => (
          <span key={s.status} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusColor[s.status] || "bg-muted"}`}>
            {s.status.replace("_", " ")} <b>{s.count}</b>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-muted text-muted-foreground">
          total <b>{data.totalProjects}</b>
        </span>
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        {/* Pipeline detail — the work table dominates */}
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Active pipeline — value by project</CardTitle></CardHeader>
          <CardContent className="px-0 pb-0">
            {data.pipeline.length === 0 && <div className="px-6 pb-4 text-sm text-muted-foreground">No active projects.</div>}
            {data.pipeline.length > 0 && (
              <table className="w-full text-sm">
                <thead className="border-y bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Project</th>
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2">Entity</th>
                    <th className="px-4 py-2 text-right">Sale (AED)</th>
                    <th className="px-4 py-2 text-right">GP (AED)</th>
                    <th className="px-4 py-2 text-right">GPM</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pipeline.map((p: any) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/60">
                      <td className="px-4 py-2">
                        <Link to={`/projects/${p.id}`} className="font-medium hover:underline">{p.code} — {p.name}</Link>
                        <div className="text-xs text-muted-foreground">{p.owner_name} · {p.updated_at?.slice(0, 10)}</div>
                      </td>
                      <td className="px-4 py-2">{p.customer_name || "—"}</td>
                      <td className="px-4 py-2 text-xs">{p.customer_entity || "—"}</td>
                      <td className="px-4 py-2 text-right font-medium">{p.sale_aed ? fmt0(p.sale_aed) : "—"}</td>
                      <td className="px-4 py-2 text-right text-emerald-600 dark:text-emerald-400">{p.sale_aed ? fmt0(p.gp_aed) : "—"}</td>
                      <td className="px-4 py-2 text-right">{fmtPct(p.gpm)}</td>
                      <td className="px-4 py-2"><Badge className={statusColor[p.status]} variant="secondary">{p.status.replace("_", " ")}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Who is working on what</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.workload.filter((w: any) => w.open_tasks > 0).length === 0 && (
                  <div className="text-sm text-muted-foreground">No open tasks assigned yet.</div>
                )}
                {data.workload.filter((w: any) => w.open_tasks > 0).map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <div className="font-medium text-sm">{w.display_name}</div>
                      <div className="text-xs text-muted-foreground">{w.project_codes || "—"}</div>
                    </div>
                    <Badge variant="secondary">{w.open_tasks} open task{w.open_tasks > 1 ? "s" : ""}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.recentActivity.length === 0 && <div className="text-sm text-muted-foreground">Nothing yet.</div>}
                {data.recentActivity.map((a: any) => (
                  <div key={a.id} className="text-xs border-b pb-2 last:border-0">
                    <span className="font-medium">{a.user_name || "System"}</span>{" "}
                    <span className="text-muted-foreground">{a.action.replace(/[._]/g, " ")}</span>
                    {a.project_code && (
                      <> · <Link to={`/projects/${a.project_id}`} className="text-primary hover:underline">{a.project_code}</Link></>
                    )}
                    {a.details && <div className="text-muted-foreground truncate">{a.details}</div>}
                    <div className="text-muted-foreground/70">{a.created_at}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
