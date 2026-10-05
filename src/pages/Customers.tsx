import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";

export default function Customers() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", entity: "", contactName: "", contactEmail: "", contactPhone: "", notes: "" });
  const canEdit = user?.role === "admin" || user?.role === "sales";

  const load = () => api<any[]>("/api/customers").then(setRows).catch(console.error);
  useEffect(() => { load(); }, []);

  const create = async () => {
    await api("/api/customers", { method: "POST", body: JSON.stringify(form) });
    setOpen(false);
    setForm({ name: "", entity: "", contactName: "", contactEmail: "", contactPhone: "", notes: "" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New customer</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add customer</DialogTitle></DialogHeader>
              <div className="space-y-3">
                {([["name", "Customer name *"], ["entity", "Entity / legal entity"], ["contactName", "Contact name"], ["contactEmail", "Contact email"], ["contactPhone", "Contact phone"], ["notes", "Notes"]] as const).map(([k, label]) => (
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
      <div className="rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Entity</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Projects</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No customers yet.</td></tr>}
            {rows.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">{c.name}</td>
                <td className="px-4 py-2.5">{c.entity || "—"}</td>
                <td className="px-4 py-2.5">{c.contact_name || "—"}</td>
                <td className="px-4 py-2.5">{c.project_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
