import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const roleBadge: Record<string, string> = {
  admin: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  sales: "bg-blue-100 text-blue-700 dark:bg-sky-500/15 dark:text-sky-300",
  presales: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

// Modules in the business suite — presales is live; the rest are planned.
const MODULES: { key: string; label: string; live: boolean }[] = [
  { key: "presales", label: "Costing & Proposals", live: true },
  { key: "opportunities", label: "Opportunity tracking", live: false },
  { key: "customers", label: "Customers", live: false },
  { key: "leave", label: "Leave management", live: false },
  { key: "amc", label: "AMC tracking", live: false },
  { key: "orders", label: "Orders", live: false },
  { key: "tickets", label: "Tickets", live: false },
];

const MODULE_ROLES = [
  { value: "admin", label: "Module admin — full control, can unlock any revision" },
  { value: "manager", label: "Manager — can manage masters & projects" },
  { value: "member", label: "Member — normal editing" },
  { value: "viewer", label: "Viewer — read only" },
];

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

  // ---- per-module roles ----
  const [moduleUser, setModuleUser] = useState<any>(null);
  const [moduleRoles, setModuleRoles] = useState<Record<string, string>>({});
  const defaultFor = (u: any) => (u?.role === "admin" ? "admin (via global admin)" : u?.role === "sales" ? "manager" : "member");

  const openModuleRoles = async (u: any) => {
    setModuleUser(u);
    const rows = await api<any[]>(`/api/users/${u.id}/module-roles`);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.module] = r.role;
    setModuleRoles(map);
  };

  const setModuleRole = async (module: string, role: string | null) => {
    await api(`/api/users/${moduleUser.id}/module-roles`, { method: "PUT", body: JSON.stringify({ module, role }) });
    setModuleRoles((p) => {
      const n = { ...p };
      if (role) n[module] = role; else delete n[module];
      return n;
    });
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
              {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
              <Button className="w-full" disabled={!form.username || !form.displayName || form.password.length < 6} onClick={create}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Username</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">{u.display_name}</td>
                <td className="px-4 py-2.5">{u.username}</td>
                <td className="px-4 py-2.5"><Badge className={cn(roleBadge[u.role])} variant="secondary">{u.role}</Badge></td>
                <td className="px-4 py-2.5">{u.active ? "Active" : "Disabled"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => openModuleRoles(u)}>
                    <ShieldCheck className="h-4 w-4 mr-1" /> Module access
                  </Button>
                  <Button variant="ghost" size="sm" onClick={async () => { await api(`/api/users/${u.id}/toggle-active`, { method: "POST" }); load(); }}>
                    {u.active ? "Disable" : "Enable"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!moduleUser} onOpenChange={(v) => { if (!v) setModuleUser(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Module access — {moduleUser?.display_name}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Overrides the default derived from the global role. Global admins are module admins everywhere automatically.
            A module admin can unlock any locked revision in that module.
          </p>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {MODULES.map((m) => (
              <div key={m.key} className={cn("flex items-center justify-between gap-3 rounded-md border p-2", !m.live && "opacity-50")}>
                <div className="text-sm">
                  {m.label} {!m.live && <span className="text-xs text-muted-foreground">(planned)</span>}
                  <span className="block text-xs text-muted-foreground">Default: {defaultFor(moduleUser)}</span>
                </div>
                <Select
                  value={moduleRoles[m.key] || "__default__"}
                  onValueChange={(v) => setModuleRole(m.key, v === "__default__" ? null : v)}
                  disabled={!m.live}
                >
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Default</SelectItem>
                    {MODULE_ROLES.map((r) => <SelectItem key={r.value} value={r.value} title={r.label}>{r.value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
