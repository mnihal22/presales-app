import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, GitBranch } from "lucide-react";
import CostingTab from "@/components/project/CostingTab";
import SummaryTab from "@/components/project/SummaryTab";
import OptionsTab from "@/components/project/OptionsTab";
import QuotesTab from "@/components/project/QuotesTab";
import ServicesTab from "@/components/project/ServicesTab";
import TasksTab from "@/components/project/TasksTab";
import ActivityTab from "@/components/project/ActivityTab";

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

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [activeRevisionId, setActiveRevisionId] = useState<number | null>(null);
  const [costingItems, setCostingItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("costing");

  const load = () =>
    api<any>(`/api/projects/${id}`).then((d) => {
      setData(d);
      if (!activeRevisionId && d.revisions.length) setActiveRevisionId(d.revisions[0].id);
    }).catch(console.error);

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (activeRevisionId) {
      api<any>(`/api/costing/${activeRevisionId}`).then((d) => setCostingItems(d.items)).catch(() => {});
    }
  }, [activeRevisionId, activeTab]);

  if (!data) return <div className="text-muted-foreground">Loading…</div>;
  const { project, members, revisions } = data;
  const canManage = user?.role === "admin" || user?.role === "sales";

  const setStatus = async (status: string) => {
    await api(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
    load();
  };

  const newRevision = async () => {
    const r = await api<{ id: number }>(`/api/projects/${id}/revisions`, { method: "POST" });
    await load();
    setActiveRevisionId(r.id);
  };

  const activeRevision = revisions.find((r: any) => r.id === activeRevisionId) || revisions[0];

  return (
    <div className="space-y-4">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All projects
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project.code} — {project.name}</h1>
            <Badge className={statusColor[project.status]} variant="secondary">{project.status.replace("_", " ")}</Badge>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {project.customer_name || "No customer"} · Account manager: {project.owner_name} · Presales: {members.map((m: any) => m.display_name).join(", ") || "—"}
          </div>
          {project.description && <div className="mt-1 text-sm">{project.description}</div>}
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Select value={project.status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["draft", "in_progress", "in_review", "approved", "submitted", "won", "lost", "cancelled"].map((s) => (
                  <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={newRevision}>
            <GitBranch className="h-4 w-4 mr-1" /> New revision
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="costing">Costing Sheet</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="options">Proposal Options</TabsTrigger>
          <TabsTrigger value="quotes">Vendor Quotes</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="costing">
          <CostingTab projectId={project.id} revisions={revisions} activeRevision={activeRevision} onSelectRevision={setActiveRevisionId} onChanged={load} />
        </TabsContent>
        <TabsContent value="summary"><SummaryTab revisionId={activeRevision?.id ?? null} /></TabsContent>
        <TabsContent value="options">
          <OptionsTab projectId={project.id} revision={activeRevision} costingItems={costingItems} locked={activeRevision?.status === "locked"} />
        </TabsContent>
        <TabsContent value="quotes"><QuotesTab projectId={project.id} revisions={revisions} /></TabsContent>
        <TabsContent value="services"><ServicesTab projectId={project.id} revisions={revisions} activeRevision={activeRevision} /></TabsContent>
        <TabsContent value="tasks"><TasksTab projectId={project.id} /></TabsContent>
        <TabsContent value="activity"><ActivityTab projectId={project.id} /></TabsContent>
      </Tabs>
    </div>
  );
}
