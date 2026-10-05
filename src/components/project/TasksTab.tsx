import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export default function TasksTab({ projectId }: any) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");

  const load = () => api<any[]>(`/api/tasks/project/${projectId}`).then(setTasks).catch(console.error);
  useEffect(() => {
    load();
    api<any[]>("/api/users").then((rows) => setUsers(rows.filter((u) => u.active))).catch(() => {});
  }, [projectId]);

  const create = async () => {
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        projectId, title, description: description || null, priority,
        assigneeId: assigneeId ? Number(assigneeId) : null, dueDate: dueDate || null,
      }),
    });
    setOpen(false);
    setTitle(""); setDescription(""); setPriority("medium"); setAssigneeId(""); setDueDate("");
    load();
  };

  const setStatus = async (id: number, status: string) => {
    await api(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
    load();
  };

  return (
    <div className="space-y-3 pt-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New task</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create task</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><label className="text-sm font-medium">Title *</label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div><label className="text-sm font-medium">Description</label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-sm font-medium">Priority</label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["low", "medium", "high", "urgent"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><label className="text-sm font-medium">Assignee</label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.display_name}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><label className="text-sm font-medium">Due date</label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
              </div>
              <Button className="w-full" disabled={!title} onClick={create}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Task</th><th className="px-4 py-3">Assignee</th><th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No tasks yet.</td></tr>}
            {tasks.map((t) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-muted/60">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{t.title}</div>
                  {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                </td>
                <td className="px-4 py-2.5">{t.assignee_name || "—"}</td>
                <td className="px-4 py-2.5 capitalize">{t.priority}</td>
                <td className="px-4 py-2.5">{t.due_date || "—"}</td>
                <td className="px-4 py-2.5">
                  <Select value={t.status} onValueChange={(v) => setStatus(t.id, v)}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{["todo", "in_progress", "blocked", "done"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-2.5">
                  <button onClick={async () => { await api(`/api/tasks/${t.id}`, { method: "DELETE" }); load(); }} className="text-muted-foreground/70 hover:text-red-600 dark:text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
