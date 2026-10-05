import { useEffect, useState } from "react";
import { NavLink, Outlet, Navigate } from "react-router";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, FolderKanban, ClipboardList, Activity, FileText, UserCog, LogOut, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/customers", label: "Customers", icon: Building2 },
  { to: "/tasks", label: "My Tasks", icon: ClipboardList },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/templates", label: "Proposal Templates", icon: FileText, roles: ["admin", "sales"] },
  { to: "/users", label: "Users", icon: UserCog, roles: ["admin"] },
];

const roleBadge: Record<string, string> = {
  admin: "bg-red-400/20 text-red-200",
  sales: "bg-sky-400/20 text-sky-200",
  presales: "bg-emerald-400/20 text-emerald-200",
};

export default function Layout() {
  const { user, loading, logout } = useAuth();
  const [version, setVersion] = useState("");
  useEffect(() => {
    api<{ version: string }>("/api/version").then((v) => setVersion(v.version)).catch(() => {});
  }, []);

  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen bg-violet-50/40">
      <aside className="w-60 shrink-0 flex flex-col bg-[#2B176D] text-white">
        <div className="px-5 py-5 border-b border-white/10">
          <img src="/logo-white.png" alt="ATCOM" className="h-7 w-auto mb-2" />
          <div className="font-semibold text-sm leading-tight">Costing &amp; Proposal Hub</div>
          <div className="text-[11px] text-white/50 mt-0.5">Presales module</div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav
            .filter((n) => !n.roles || n.roles.includes(user.role))
            .map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                  )
                }
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </NavLink>
            ))}
        </nav>
        <div className="border-t border-white/10 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{user.displayName}</div>
              <span className={cn("inline-block mt-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", roleBadge[user.role])}>
                {user.role}
              </span>
            </div>
            <button onClick={logout} title="Sign out" className="text-white/50 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          <div className="text-[10px] text-white/40">v{version || "…"}</div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
