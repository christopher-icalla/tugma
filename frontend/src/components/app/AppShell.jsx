import React from "react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Scale, ShieldCheck, ArrowLeftRight, AlertTriangle,
  FileCheck2, FileBarChart, Settings, LogOut, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LoadingState } from "@/components/States";
import { TugmaMark } from "@/components/public/PublicChrome";

const CONTROL_CENTER = [
  ["/app/dashboard", "Dashboard", LayoutDashboard],
  ["/app/regulatory-intelligence", "Regulatory Intelligence", Scale],
  ["/app/controls", "Controls", ShieldCheck],
  ["/app/transactions", "Transactions", ArrowLeftRight],
  ["/app/exceptions", "Exceptions", AlertTriangle],
  ["/app/evidence", "Evidence", FileCheck2],
  ["/app/reports", "Reports", FileBarChart],
];
const ADMIN = [["/app/settings", "Settings", Settings]];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = React.useState(false);

  if (user === null) return <div className="min-h-screen bg-[#090d16]"><LoadingState label="Authenticating" /></div>;
  if (user === false) return <Navigate to="/login" replace />;

  const doLogout = async () => { await logout(); navigate("/login"); };

  return (
    <div className="flex min-h-screen bg-[#090d16]">
      <aside className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-slate-800 bg-[#070a11] transition-all duration-200 ${collapsed ? "w-16" : "w-64"}`} data-testid="app-sidebar">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
          {!collapsed ? <TugmaMark /> : <span className="mx-auto font-heading text-lg font-bold text-sky-400">T</span>}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {!collapsed && <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-widest text-slate-600">Control Center</p>}
          <div className="space-y-1">
            {CONTROL_CENTER.map(([to, label, Icon]) => <NavItem key={to} to={to} label={label} Icon={Icon} collapsed={collapsed} />)}
          </div>
          <div className="my-4 border-t border-slate-800" />
          {!collapsed && <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-widest text-slate-600">Administration</p>}
          <div className="space-y-1">
            {ADMIN.map(([to, label, Icon]) => <NavItem key={to} to={to} label={label} Icon={Icon} collapsed={collapsed} />)}
          </div>
        </nav>

        <div className="border-t border-slate-800 p-3">
          {!collapsed && (
            <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2.5" data-testid="sidebar-org">
              <p className="font-heading text-sm font-semibold text-slate-200">TUGMA Demo PSP</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Payment Operations</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={doLogout} data-testid="logout-button" className="flex flex-1 items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-rose-500/40 hover:text-rose-300">
              <LogOut className="h-4 w-4" /> {!collapsed && "Sign out"}
            </button>
            <button onClick={() => setCollapsed((c) => !c)} data-testid="sidebar-collapse" className="rounded-md border border-slate-800 p-2 text-slate-400 transition-colors hover:text-slate-200">
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-amber-500/20 bg-amber-500/5 px-6 py-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-amber-300/90">
            Synthetic Demonstration Environment — No Production Payment Data
          </p>
          <div className="hidden items-center gap-2 sm:flex" data-testid="topbar-user">
            <span className="font-mono text-[11px] text-slate-400">{user.name}</span>
            <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-sky-300">{user.role}</span>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto px-6 py-8"><Outlet /></main>
      </div>
    </div>
  );
}

function NavItem({ to, label, Icon, collapsed }) {
  return (
    <NavLink
      to={to}
      data-testid={`sidebar-link-${to.split("/").pop()}`}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          isActive ? "bg-sky-500/10 text-sky-300" : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}
