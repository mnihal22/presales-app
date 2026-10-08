import { useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowLeft, GitBranch, History } from "lucide-react";
import CostingTab from "@/components/project/CostingTab";
import SummaryTab from "@/components/project/SummaryTab";
import OptionsTab from "@/components/project/OptionsTab";
import ProposalTab from "@/components/project/ProposalTab";
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
  const [revDialogOpen, setRevDialogOpen] = useState(false);
  const [revNote, setRevNote] = useState("");
  const [histOpen, setHistOpen] = useState(false);

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
  const canManage = user?.role === "admin" || user?.role === "sales" || user?.role === "presales";

  const setStatus = async (status: string) => {
    await api(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
    load();
  };

  const newRevision = async () => {
    const r = await api<{ id: number }>(`/api/projects/${id}/revisions`, {
      method: "POST",
      body: JSON.stringify({ note: revNote.trim() || null }),
    });
    setRevDialogOpen(false);
    setRevNote("");
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
          <Button variant="outline" onClick={() => setHistOpen(true)}>
            <History className="h-4 w-4 mr-1" /> Revision history
          </Button>
          <Button variant="outline" onClick={() => setRevDialogOpen(true)}>
            <GitBranch className="h-4 w-4 mr-1" /> New revision
          </Button>
        </div>
      </div>

      {/* Revision creation — a note makes each version self-explanatory */}
      <Dialog open={revDialogOpen} onOpenChange={setRevDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New revision (R{(revisions[0]?.rev_no || 0) + 1})</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The full costing sheet (all fields) is carried forward from {revisions[0]?.label || "the current revision"}.
            </p>
            <div>
              <label className="text-sm font-medium">What changed in this revision? (note)</label>
              <Input value={revNote} onChange={(e) => setRevNote(e.target.value)} placeholder="e.g. Updated Avaya prices after revised quote" />
            </div>
            <Button className="w-full" onClick={newRevision}>Create revision</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full revision history */}
      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>Revision history — {project.code}</DialogTitle></DialogHeader>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2 pr-3">Rev</th><th className="py-2 pr-3">Created</th><th className="py-2 pr-3">By</th><th className="py-2 pr-3">Status</th><th className="py-2">Note</th></tr>
            </thead>
            <tbody>
              {revisions.map((r: any) => (
                <tr key={r.id} className={`border-b last:border-0 ${r.id === activeRevision?.id ? "bg-accent/50" : ""}`}>
                  <td className="py-2 pr-3 font-semibold">{r.label}{r.id === activeRevision?.id && <span className="ml-1 text-xs text-muted-foreground">(viewing)</span>}</td>
                  <td className="py-2 pr-3">{r.created_at?.slice(0, 16)}</td>
                  <td className="py-2 pr-3">{r.created_by_name}</td>
                  <td className="py-2 pr-3">
                    {r.status === "locked"
                      ? <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">locked{r.locked_by_name ? ` by ${r.locked_by_name}` : ""}</Badge>
                      : <Badge variant="secondary">open</Badge>}
                    {!!r.committed_at && (
                      <Badge variant="secondary" className="ml-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        committed{r.committed_by_name ? ` by ${r.committed_by_name}` : ""}
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 text-muted-foreground">{r.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="costing">Costing Sheet</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="options">Proposal Options</TabsTrigger>
          <TabsTrigger value="proposal">Proposal</TabsTrigger>
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
        <TabsContent value="proposal"><ProposalTab projectId={project.id} revision={activeRevision} /></TabsContent>
        <TabsContent value="quotes"><QuotesTab projectId={project.id} revisions={revisions} /></TabsContent>
        <TabsContent value="services"><ServicesTab projectId={project.id} revisions={revisions} activeRevision={activeRevision} /></TabsContent>
        <TabsContent value="tasks"><TasksTab projectId={project.id} /></TabsContent>
        <TabsContent value="activity"><ActivityTab projectId={project.id} /></TabsContent>
      </Tabs>
    </div>
  );
}
