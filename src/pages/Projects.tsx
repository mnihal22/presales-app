import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";

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

export default function Projects() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [presalesUsers, setPresalesUsers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [error, setError] = useState("");

  const canCreate = user?.role === "admin" || user?.role === "sales" || user?.role === "presales";

  const load = () => api<any[]>("/api/projects").then(setProjects).catch(console.error);
  useEffect(() => {
    load();
    if (canCreate) {
      api<any[]>("/api/customers").then(setCustomers).catch(() => {});
      api<any[]>("/api/users").then((rows) => setPresalesUsers(rows.filter((u) => u.role === "presales" && u.active))).catch(() => {});
    }
  }, []);

  const create = async () => {
    setError("");
    try {
      await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: description || null,
          customerId: customerId ? Number(customerId) : null,
          memberIds,
        }),
      });
      setOpen(false);
      setName(""); setDescription(""); setCustomerId(""); setMemberIds([]);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ---- edit / delete ----
  const [editProject, setEditProject] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCustomerId, setEditCustomerId] = useState<string>("");
  const [editMemberIds, setEditMemberIds] = useState<number[]>([]);
  const [editRoundUp, setEditRoundUp] = useState(false);

  const openEdit = async (p: any) => {
    const d = await api<any>(`/api/projects/${p.id}`);
    setEditProject(p);
    setEditName(d.project.name);
    setEditDescription(d.project.description || "");
    setEditCustomerId(d.project.customer_id ? String(d.project.customer_id) : "");
    setEditMemberIds(d.members.map((m: any) => m.id));
    setEditRoundUp(!!d.project.round_sell_up);
  };

  const saveEdit = async () => {
    await api(`/api/projects/${editProject.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: editName,
        description: editDescription || null,
        customerId: editCustomerId ? Number(editCustomerId) : null,
        memberIds: editMemberIds,
        roundSellUp: editRoundUp,
      }),
    });
    setEditProject(null);
    load();
  };

  const duplicateProject = async (p: any) => {
    if (!confirm(`Duplicate ${p.code} — ${p.name}?\n\nCopies the whole quote process: revisions, costing sheets, vendor quotes, proposal options and services.\n(Attachments and tasks stay with the original.)`)) return;
    const r = await api<{ id: number }>(`/api/projects/${p.id}/duplicate`, { method: "POST" });
    navigate(`/projects/${r.id}`);
  };

  const deleteProject = async (p: any) => {
    if (!confirm(`Delete ${p.code} — ${p.name}?\n\nThis permanently removes the project with all its revisions, costing sheets, quotes, tasks and options. This cannot be undone.`)) return;
    if (!confirm("Are you absolutely sure?")) return;
    await api(`/api/projects/${p.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New project</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create project</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><label className="text-sm font-medium">Project name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Network Refresh" /></div>
                <div><label className="text-sm font-medium">Customer</label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
                <div><label className="text-sm font-medium">Description</label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                <div>
                  <label className="text-sm font-medium">Assign presales</label>
                  <div className="mt-1 space-y-1.5 rounded-md border p-2 max-h-40 overflow-y-auto">
                    {presalesUsers.length === 0 && <div className="text-xs text-muted-foreground">No presales users yet.</div>}
                    {presalesUsers.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={memberIds.includes(u.id)}
                          onCheckedChange={(v) => setMemberIds(v ? [...memberIds, u.id] : memberIds.filter((x) => x !== u.id))}
                        />
                        {u.display_name}
                      </label>
                    ))}
                  </div>
                </div>
                {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
                <Button className="w-full" disabled={!name} onClick={create}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Owner</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Revs</th>
              <th className="px-4 py-3">Open tasks</th><th className="px-4 py-3">Updated</th>
              {canCreate && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No projects yet.</td></tr>
            )}
            {projects.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-muted/60">
                <td className="px-4 py-2.5 font-mono text-xs"><Link className="text-blue-600 hover:underline" to={`/projects/${p.id}`}>{p.code}</Link></td>
                <td className="px-4 py-2.5 font-medium"><Link className="hover:underline" to={`/projects/${p.id}`}>{p.name}</Link></td>
                <td className="px-4 py-2.5">{p.customer_name || "—"}</td>
                <td className="px-4 py-2.5">{p.owner_name}</td>
                <td className="px-4 py-2.5"><Badge className={statusColor[p.status]} variant="secondary">{p.status.replace("_", " ")}</Badge></td>
                <td className="px-4 py-2.5">{p.revision_count}</td>
                <td className="px-4 py-2.5">{p.open_tasks}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.updated_at?.slice(0, 10)}</td>
                {canCreate && (
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" title="Duplicate whole quote process (costing, quotes, options, services)" onClick={() => duplicateProject(p)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Edit project" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {user?.role === "admin" && (
                      <Button variant="ghost" size="icon" title="Delete project" onClick={() => deleteProject(p)}>
                        <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editProject} onOpenChange={(v) => { if (!v) setEditProject(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit project {editProject?.code}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-sm font-medium">Project name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div><label className="text-sm font-medium">Customer</label>
              <Select value={editCustomerId} onValueChange={setEditCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div><label className="text-sm font-medium">Description</label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></div>
            <div>
              <label className="text-sm font-medium">Assigned presales</label>
              <div className="mt-1 space-y-1.5 rounded-md border p-2 max-h-40 overflow-y-auto">
                {presalesUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editMemberIds.includes(u.id)}
                      onCheckedChange={(v) => setEditMemberIds(v ? [...editMemberIds, u.id] : editMemberIds.filter((x) => x !== u.id))}
                    />
                    {u.display_name}
                  </label>
                ))}
              </div>
            </div>
            <Button className="w-full" disabled={!editName} onClick={saveEdit}>Save changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
