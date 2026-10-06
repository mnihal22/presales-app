import { useEffect, useState } from "react";
import { NavLink, Outlet, Navigate } from "react-router";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, FolderKanban, ClipboardList, Activity, FileText, UserCog, LogOut, Building2, Database,
  Sun, Moon, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/customers", label: "Customers", icon: Building2 },
  { to: "/tasks", label: "My Tasks", icon: ClipboardList },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/templates", label: "Proposal Templates", icon: FileText, roles: ["admin", "sales", "presales"] },
  { to: "/masters", label: "Masters", icon: Database, roles: ["admin", "sales", "presales"] },
  { to: "/users", label: "Users", icon: UserCog, roles: ["admin"] },
];

const roleBadge: Record<string, string> = {
  admin: "bg-red-400/20 text-red-200",
  sales: "bg-sky-400/20 text-sky-200",
  presales: "bg-emerald-400/20 text-emerald-200",
};

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    localStorage.getItem("atcom-theme") === "dark" ? "dark" : "light");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("atcom-theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("atcom-nav-collapsed") === "1");
  useEffect(() => {
    localStorage.setItem("atcom-nav-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);
  return { collapsed, toggle: () => setCollapsed((c) => !c) };
}

export default function Layout() {
  const { user, loading, logout } = useAuth();
  const [version, setVersion] = useState("");
  const { theme, toggle } = useTheme();
  const { collapsed, toggle: toggleNav } = useCollapsed();
  useEffect(() => {
    api<{ version: string }>("/api/version").then((v) => setVersion(v.version)).catch(() => {});
  }, []);

  if (loading) return <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen bg-background">
      <aside
        className={cn(
          "shrink-0 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-[6px_0_20px_-10px_rgba(25,10,55,0.5)] transition-[width] duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className={cn("border-b border-sidebar-border", collapsed ? "px-2 py-4 flex flex-col items-center gap-3" : "px-5 py-5")}>
          {collapsed ? (
            <>
              <img src="/logo-white.png" alt="ATCOM" className="w-10 h-auto" />
              <button onClick={toggleNav} title="Expand menu"
                className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <img src="/logo-white.png" alt="ATCOM" className="h-7 w-auto mb-2" />
                <button onClick={toggleNav} title="Collapse menu"
                  className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors mt-0.5">
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
              <div className="font-semibold text-sm leading-tight">Costing &amp; Proposal Hub</div>
              <div className="text-[11px] text-sidebar-foreground/50 mt-0.5">Presales module</div>
            </>
          )}
        </div>
        <nav className={cn("flex-1 space-y-1 overflow-y-auto", collapsed ? "p-2" : "p-3")}>
          {nav
            .filter((n) => !n.roles || n.roles.includes(user.role))
            .map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                title={n.label}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    collapsed && "justify-center px-2",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_0_hsl(var(--sidebar-primary))]"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  )
                }
              >
                <n.icon className="h-4 w-4 shrink-0" />
                {!collapsed && n.label}
              </NavLink>
            ))}
        </nav>
        <div className={cn("border-t border-sidebar-border", collapsed ? "p-2 flex flex-col items-center gap-2" : "p-4 space-y-3")}>
          {collapsed ? (
            <>
              <div
                title={`${user.displayName} (${user.role})`}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-bold uppercase select-none"
              >
                {user.displayName.slice(0, 1)}
              </div>
              <button onClick={toggle} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button onClick={logout} title="Sign out" className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{user.displayName}</div>
                  <span className={cn("inline-block mt-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", roleBadge[user.role])}>
                    {user.role}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={toggle} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                    className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                  <button onClick={logout} title="Sign out" className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div>
                <span className="inline-block rounded-full bg-sidebar-primary/15 text-sidebar-primary px-2 py-0.5 text-[10px] font-semibold">
                  v{version || "…"}
                </span>
              </div>
            </>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
