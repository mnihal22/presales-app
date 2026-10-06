import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";

const UNASSIGNED = "__none__";

export default function Customers() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", entity: "", contactName: "", contactEmail: "", contactPhone: "", notes: "" });
  const canEdit = user?.role === "admin" || user?.role === "sales" || user?.role === "presales";

  const load = () => {
    api<any[]>("/api/customers").then(setRows).catch(console.error);
    api<any[]>("/api/masters/entities").then(setEntities).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    await api("/api/customers", { method: "POST", body: JSON.stringify({ ...form, entity: form.entity || null }) });
    setOpen(false);
    setForm({ name: "", entity: "", contactName: "", contactEmail: "", contactPhone: "", notes: "" });
    load();
  };

  const visible = rows.filter((c) =>
    filter === "all" ? true : filter === UNASSIGNED ? !c.entity : c.entity === filter);

  // Group by ATCOM entity — unassigned customers last
  const groupNames = [...new Set(visible.map((c) => c.entity || ""))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">Segregated by the ATCOM entity they are registered with. Manage entities under Masters.</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New customer</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add customer</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Customer name *</label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Registered with ATCOM entity</label>
                  <Select value={form.entity || UNASSIGNED} onValueChange={(v) => setForm({ ...form, entity: v === UNASSIGNED ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>— Unassigned —</SelectItem>
                      {entities.map((e) => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {([["contactName", "Contact name"], ["contactEmail", "Contact email"], ["contactPhone", "Contact phone"], ["notes", "Notes"]] as const).map(([k, label]) => (
                  <div key={k}>
                    <label className="text-sm font-medium">{label}</label>
                    <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                  </div>
                ))}
                <Button className="w-full" disabled={!form.name} onClick={create}>Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Entity:</span>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-56 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {entities.map((e) => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{visible.length} of {rows.length} customers</span>
      </div>

      <div className="rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Projects</th></tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No customers yet.</td></tr>}
            {groupNames.map((g) => (
              <Fragment key={g || "none"}>
                <tr className="bg-accent/60">
                  <td colSpan={4} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent-foreground">
                    {g || "Unassigned"}
                  </td>
                </tr>
                {visible.filter((c) => (c.entity || "") === g).map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5">{c.contact_name || "—"}</td>
                    <td className="px-4 py-2.5">{c.contact_email || "—"}</td>
                    <td className="px-4 py-2.5">{c.project_count}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
