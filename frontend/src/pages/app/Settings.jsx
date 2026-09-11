import React from "react";
import { api } from "@/lib/api";
import { useApi, PageHeader, Card } from "@/components/app/shared";
import { LoadingState, ErrorState } from "@/components/States";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge } from "@/components/StatusBadge";
import { can } from "@/lib/perms";
import { shortDate } from "@/components/app/shared";

const ROLE_DESC = {
  ADMIN: "Full administrative access to the organization and its configuration.",
  PAYMENT_OPS: "Manages payment operations, settlement reconciliation and related exceptions.",
  COMPLIANCE: "Owns regulatory mapping, AML/end-user controls and evidence verification.",
  RISK: "Oversees third-party and IT risk controls and risk posture.",
  FINANCE: "Reviews financial settlement integrity and reporting.",
  AUDITOR: "Read-oriented access for internal audit and evidence review.",
  VIEWER: "Read-only observer access.",
};

export default function Settings() {
  const { user } = useAuth();
  const { loading, error, data, reload } = useApi("/organization");
  if (loading) return <LoadingState label="Loading settings" />;
  if (error) return <ErrorState description="Organization settings could not be loaded." onRetry={reload} />;

  const { organization: org, users = [], roles = [] } = data;

  return (
    <div>
      <PageHeader eyebrow="Administration" title="Settings"
        subtitle="Organization profile, role structure and demonstration environment status." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1" testid="org-profile">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Organization</p>
          <h2 className="mt-2 font-heading text-xl font-semibold text-slate-100">{org?.name}</h2>
          <dl className="mt-5 space-y-3 font-mono text-xs">
            <Row k="Country" v={org?.country} />
            <Row k="Industry" v={org?.industry} />
            <Row k="Environment" v={<StatusBadge value="info" testid="env-badge" />} raw />
            <Row k="Org ID" v={org?.id} />
          </dl>
          <div className="mt-5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 font-mono text-[11px] leading-relaxed text-amber-300/90">
            Synthetic Demonstration Environment — No Production Payment Data
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2" testid="users-list">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Users & Roles ({users.length})</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id} data-testid={`user-row-${u.role.toLowerCase()}`}>
                    <td className="py-2.5 pr-4 text-slate-200">{u.name}{u.email === user.email && <span className="ml-2 font-mono text-[10px] text-sky-400">you</span>}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-400">{u.email}</td>
                    <td className="py-2.5 pr-4"><StatusBadge value="info" testid={`role-${u.role.toLowerCase()}`} /><span className="ml-2 font-mono text-xs text-slate-300">{u.role}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-6" testid="roles-reference">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Role-Based Authorization</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <div key={r} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
              <p className="font-mono text-xs font-semibold tracking-widest text-sky-300">{r}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{ROLE_DESC[r]}</p>
            </div>
          ))}
        </div>
      </Card>

      {can(user.role, "audit:read") && <AuditTrail />}
    </div>
  );
}

function Row({ k, v, raw }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-200">{raw ? v : <span className="break-all">{v}</span>}</dd>
    </div>
  );
}

function AuditTrail() {
  const [logs, setLogs] = React.useState(null);
  React.useEffect(() => { api.get("/audit-logs?limit=50").then(({ data }) => setLogs(data.audit_logs)).catch(() => setLogs([])); }, []);
  return (
    <Card className="mt-6 p-6" testid="audit-trail">
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Audit Trail — append-only ({logs ? logs.length : "…"})</p>
      {!logs ? <p className="mt-3 text-sm text-slate-400">Loading…</p> : logs.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No audit records yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-800 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-4">Action</th><th className="py-2 pr-4">Entity</th><th className="py-2 pr-4">User</th><th className="py-2 pr-4">When</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-800 font-mono text-xs">
              {logs.map((a) => (
                <tr key={a.id} data-testid={`audit-row-${a.id}`}>
                  <td className="py-2 pr-4 text-slate-300">{a.action}</td>
                  <td className="py-2 pr-4 text-slate-400">{a.entity_type}</td>
                  <td className="py-2 pr-4 text-slate-400">{a.user_name} · {a.user_role}</td>
                  <td className="py-2 pr-4 text-slate-500">{shortDate(a.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
