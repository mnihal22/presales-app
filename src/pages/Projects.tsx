import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";

const statusColor: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  in_review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  submitted: "bg-purple-100 text-purple-700",
  won: "bg-green-100 text-green-800",
  lost: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [presalesUsers, setPresalesUsers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [error, setError] = useState("");

  const canCreate = user?.role === "admin" || user?.role === "sales";

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
                {error && <div className="text-sm text-red-600">{error}</div>}
                <Button className="w-full" disabled={!name} onClick={create}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Code</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Owner</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Revs</th>
              <th className="px-4 py-3">Open tasks</th><th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No projects yet.</td></tr>
            )}
            {projects.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs"><Link className="text-blue-600 hover:underline" to={`/projects/${p.id}`}>{p.code}</Link></td>
                <td className="px-4 py-2.5 font-medium"><Link className="hover:underline" to={`/projects/${p.id}`}>{p.name}</Link></td>
                <td className="px-4 py-2.5">{p.customer_name || "—"}</td>
                <td className="px-4 py-2.5">{p.owner_name}</td>
                <td className="px-4 py-2.5"><Badge className={statusColor[p.status]} variant="secondary">{p.status.replace("_", " ")}</Badge></td>
                <td className="px-4 py-2.5">{p.revision_count}</td>
                <td className="px-4 py-2.5">{p.open_tasks}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.updated_at?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
