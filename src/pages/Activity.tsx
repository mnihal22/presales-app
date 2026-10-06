import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FilterX } from "lucide-react";

const ALL = "__all__";

export default function Activity() {
  const [rows, setRows] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [projectId, setProjectId] = useState(ALL);
  const [userId, setUserId] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    api<any[]>("/api/projects").then(setProjects).catch(() => {});
    api<any[]>("/api/users").then(setUsers).catch(() => {});
    api<string[]>("/api/activity/actions").then(setActions).catch(() => {});
  }, []);

  const queryString = () => {
    const p = new URLSearchParams();
    p.set("limit", "200");
    if (projectId !== ALL) p.set("projectId", projectId);
    if (userId !== ALL) p.set("userId", userId);
    if (action !== ALL) p.set("action", action);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  };

  const load = () => api<any[]>(`/api/activity?${queryString()}`).then(setRows).catch(console.error);
  useEffect(() => { load(); }, [projectId, userId, action, from, to]);

  const reset = () => { setProjectId(ALL); setUserId(ALL); setAction(ALL); setFrom(""); setTo(""); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Activity &amp; audit log</h1>
        <Button variant="outline" onClick={() => downloadFile(`/api/activity/export.csv?${queryString()}`, "activity.csv")}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3">
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="h-8 w-52"><SelectValue placeholder="All projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.code} — {p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="h-8 w-44"><SelectValue placeholder="All users" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All users</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="h-8 w-52"><SelectValue placeholder="All actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All actions</SelectItem>
            {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="h-8 w-40" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" className="h-8 w-40" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
        <Button variant="ghost" size="sm" onClick={reset}><FilterX className="h-4 w-4 mr-1" /> Reset</Button>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} entries</span>
      </div>

      <div className="rounded-md border bg-card p-4">
        {rows.length === 0 && <div className="text-sm text-muted-foreground">No activity matches these filters.</div>}
        <div className="space-y-3">
          {rows.map((a) => (
            <div key={a.id} className="flex items-start gap-3 border-b pb-2.5 last:border-0">
              <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/40" />
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{a.user_name || "System"}</span>{" "}
                <span className="text-muted-foreground">{a.action.replaceAll("_", " ").replaceAll(".", " · ")}</span>
                {a.details && <span> — {a.details}</span>}
                {a.project_id && (
                  <Link to={`/projects/${a.project_id}`} className="ml-2 text-primary hover:underline">
                    {a.project_code}
                  </Link>
                )}
                <div className="text-xs text-muted-foreground">{a.created_at}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
