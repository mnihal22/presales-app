import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-sky-500/15 dark:text-sky-300",
  in_review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  submitted: "bg-purple-100 text-purple-700",
  won: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  cancelled: "bg-slate-100 text-muted-foreground",
};

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api("/api/activity/dashboard").then(setData).catch(console.error);
  }, []);

  if (!data) return <div className="text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total projects</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{data.totalProjects}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">My open tasks</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{data.myOpenTasks}</div></CardContent></Card>
        {data.statusCounts.slice(0, 2).map((s: any) => (
          <Card key={s.status}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground capitalize">{s.status.replace("_", " ")}</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{s.count}</div></CardContent></Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
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
          <CardHeader><CardTitle>Active pipeline</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.pipeline.length === 0 && <div className="text-sm text-muted-foreground">No active projects.</div>}
              {data.pipeline.map((p: any) => (
                <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center justify-between rounded-md border p-2.5 hover:bg-muted/60">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.code} — {p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.customer_name || "No customer"} · {p.owner_name}</div>
                  </div>
                  <Badge className={statusColor[p.status]} variant="secondary">{p.status.replace("_", " ")}</Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
