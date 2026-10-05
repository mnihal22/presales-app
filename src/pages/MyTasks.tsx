import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function MyTasks() {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api<any[]>("/api/tasks/mine").then(setRows).catch(console.error);
  useEffect(() => { load(); }, []);

  const setStatus = async (id: number, status: string) => {
    await api(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
    load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My Tasks</h1>
      <div className="rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3">Task</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No open tasks assigned to you.</td></tr>}
            {rows.map((t) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-muted/60">
                <td className="px-4 py-2.5 font-medium">{t.title}</td>
                <td className="px-4 py-2.5">
                  {t.project_id ? <Link className="text-blue-600 hover:underline" to={`/projects/${t.project_id}`}>{t.project_code} — {t.project_name}</Link> : "—"}
                </td>
                <td className="px-4 py-2.5 capitalize">{t.priority}</td>
                <td className="px-4 py-2.5">{t.due_date || "—"}</td>
                <td className="px-4 py-2.5">
                  <Select value={t.status} onValueChange={(v) => setStatus(t.id, v)}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{["todo", "in_progress", "blocked", "done"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
