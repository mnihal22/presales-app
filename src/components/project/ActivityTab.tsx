import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function ActivityTab({ projectId }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api<any[]>(`/api/activity/project/${projectId}`).then(setRows).catch(console.error);
  }, [projectId]);

  return (
    <div className="pt-3">
      <div className="rounded-md border bg-card p-4">
        {rows.length === 0 && <div className="text-sm text-muted-foreground">No activity yet.</div>}
        <div className="space-y-3">
          {rows.map((a) => (
            <div key={a.id} className="flex items-start gap-3 border-b pb-2.5 last:border-0">
              <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="font-medium">{a.user_name || "System"}</span>{" "}
                  <span className="text-muted-foreground">{a.action.replaceAll("_", " ").replaceAll(".", " · ")}</span>
                  {a.details && <span> — {a.details}</span>}
                </div>
                <div className="text-xs text-muted-foreground">{a.created_at}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
