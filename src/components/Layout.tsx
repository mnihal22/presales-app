import { NavLink, Outlet, Navigate } from "react-router";
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
  admin: "bg-red-100 text-red-700",
  sales: "bg-blue-100 text-blue-700",
  presales: "bg-emerald-100 text-emerald-700",
};

export default function Layout() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-60 shrink-0 border-r bg-white flex flex-col">
        <div className="px-5 py-5 border-b">
          <div className="font-bold text-lg leading-tight">Costing &amp; Proposal Hub</div>
          <div className="text-xs text-muted-foreground mt-0.5">Presales module</div>
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
                    isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  )
                }
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </NavLink>
            ))}
        </nav>
        <div className="border-t p-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{user.displayName}</div>
              <span className={cn("inline-block mt-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", roleBadge[user.role])}>
                {user.role}
              </span>
            </div>
            <button onClick={logout} title="Sign out" className="text-slate-400 hover:text-slate-700">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
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
