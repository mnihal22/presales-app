import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const roleBadge: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  sales: "bg-blue-100 text-blue-700",
  presales: "bg-emerald-100 text-emerald-700",
};

export default function Users() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", email: "", role: "presales" });
  const [error, setError] = useState("");

  const load = () => api<any[]>("/api/users").then(setRows).catch(console.error);
  useEffect(() => { load(); }, []);

  const create = async () => {
    setError("");
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify(form) });
      setOpen(false);
      setForm({ username: "", password: "", displayName: "", email: "", role: "presales" });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New user</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><label className="text-sm font-medium">Username *</label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Display name *</label><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Password * (min 6 chars)</label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Email</label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Role</label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="presales">Presales</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select></div>
              {error && <div className="text-sm text-red-600">{error}</div>}
              <Button className="w-full" disabled={!form.username || !form.displayName || form.password.length < 6} onClick={create}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Username</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">{u.display_name}</td>
                <td className="px-4 py-2.5">{u.username}</td>
                <td className="px-4 py-2.5"><Badge className={cn(roleBadge[u.role])} variant="secondary">{u.role}</Badge></td>
                <td className="px-4 py-2.5">{u.active ? "Active" : "Disabled"}</td>
                <td className="px-4 py-2.5">
                  <Button variant="ghost" size="sm" onClick={async () => { await api(`/api/users/${u.id}/toggle-active`, { method: "POST" }); load(); }}>
                    {u.active ? "Disable" : "Enable"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
