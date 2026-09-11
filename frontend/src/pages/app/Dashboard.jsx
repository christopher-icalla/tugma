import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Activity, ShieldCheck, AlertTriangle, Flame, FileCheck2, Wrench } from "lucide-react";
import { useApi, PageHeader, Card } from "@/components/app/shared";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

const KPI_META = [
  ["transactions_analyzed", "Transactions Analyzed", Activity],
  ["controls_tested", "Controls Tested", ShieldCheck],
  ["exceptions", "Exceptions", AlertTriangle],
  ["high_risk", "High Risk", Flame],
  ["evidence_readiness", "Evidence Readiness", FileCheck2],
  ["open_remediation", "Open Remediation", Wrench],
];

export default function Dashboard() {
  const { loading, error, data, reload } = useApi("/dashboard/summary");
  if (loading) return <LoadingState label="Loading control center" />;
  if (error) return <ErrorState description="The dashboard summary could not be loaded." onRetry={reload} />;

  const { kpis, control_health, priority_exceptions } = data;

  return (
    <div>
      <PageHeader
        eyebrow="Control Center"
        title="Compliance Control Center"
        subtitle="Continuous visibility into payment controls, exceptions and evidence readiness."
        right={<span className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-400">Engine: Foundation Demo</span>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {KPI_META.map(([key, label, Icon]) => {
          const val = kpis[key];
          const display = key === "evidence_readiness" ? `${val}%` : Number(val).toLocaleString();
          return (
            <Card key={key} testid={`kpi-${key.replace(/_/g, "-")}`} className="p-5">
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4 text-sky-400" />
                {key === "high_risk" && val > 0 && <span className="h-2 w-2 rounded-full bg-rose-400" />}
              </div>
              <p className="mt-4 font-heading text-3xl font-bold text-slate-50">{display}</p>
              <p className="mt-1 text-xs text-slate-400">{label}</p>
            </Card>
          );
        })}
      </div>

      <p className="mt-3 font-mono text-[11px] text-slate-600">
        KPI values reflect the seeded demonstration dataset. Live figures populate once the control engine runs in the next phase.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3" testid="control-health-section">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <h2 className="font-heading text-base font-semibold text-slate-200">Control Health</h2>
            <Link to="/app/controls" className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300">All controls <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="divide-y divide-slate-800">
            {control_health.map((c) => (
              <div key={c.control_code} className="flex items-center justify-between px-5 py-3.5" data-testid={`control-health-${c.control_code.toLowerCase()}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{c.control_code}</span>
                    <span className="truncate text-sm text-slate-200">{c.name}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge value={c.risk_level} />
                    {c.records_tested != null ? (
                      <span className="font-mono text-[11px] text-slate-500">{c.passed_count?.toLocaleString()} passed · {c.failed_count} exceptions</span>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-600">no run yet</span>
                    )}
                  </div>
                </div>
                <StatusBadge value={c.status} testid={`control-status-${c.control_code.toLowerCase()}`} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2" testid="priority-exceptions-section">
          <div className="border-b border-slate-800 px-5 py-4">
            <h2 className="font-heading text-base font-semibold text-slate-200">Priority Exceptions</h2>
          </div>
          {priority_exceptions.length === 0 ? (
            <div className="p-5"><EmptyState title="No open exceptions" description="All exceptions have been resolved in this dataset." /></div>
          ) : (
            <div className="divide-y divide-slate-800">
              {priority_exceptions.map((e) => (
                <Link to="/app/exceptions" key={e.id} className="block px-5 py-3.5 transition-colors hover:bg-slate-900/60" data-testid={`priority-exc-${e.id}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-500">{e.exception_code}</span>
                    <StatusBadge value={e.severity} />
                  </div>
                  <p className="mt-1.5 text-sm text-slate-200">{e.title}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusBadge value={e.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
