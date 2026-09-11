import React from "react";
import { useApi, PageHeader, Card } from "@/components/app/shared";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

export default function ControlsApp() {
  const { loading, error, data, reload } = useApi("/controls");
  const [selected, setSelected] = React.useState(null);
  if (loading) return <LoadingState label="Loading controls" />;
  if (error) return <ErrorState description="Controls could not be loaded." onRetry={reload} />;

  const controls = data.controls || [];
  const active = selected || controls.find((c) => c.primary) || controls[0];

  return (
    <div>
      <PageHeader eyebrow="Controls" title="Operational Controls"
        subtitle="Deterministic controls mapping regulatory requirements to tests against payment operations data." />

      {controls.length === 0 ? (
        <EmptyState title="No controls defined" description="No controls have been configured for this organization." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            {controls.map((c) => (
              <button key={c.id} onClick={() => setSelected(c)} data-testid={`control-row-${c.control_code.toLowerCase()}`}
                className={`w-full rounded-lg border p-4 text-left transition-colors ${active?.id === c.id ? "border-sky-500/50 bg-sky-500/5" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-500">{c.control_code}{c.primary && <span className="ml-2 text-sky-400">★</span>}</span>
                  <StatusBadge value={c.risk_level} />
                </div>
                <p className="mt-2 text-sm font-medium text-slate-200">{c.name}</p>
                <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-slate-500">
                  <span>{c.category}</span>·<span>{c.frequency}</span>·<span>{c.automated ? "Automated" : "Manual"}</span>
                </div>
              </button>
            ))}
          </div>

          {active && (
            <Card className="lg:col-span-3" testid="control-detail">
              <div className="border-b border-slate-800 px-6 py-5">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate-500">{active.control_code}</span>
                  <StatusBadge value={active.status} />
                </div>
                <h2 className="mt-2 font-heading text-xl font-semibold text-slate-100">{active.name}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{active.description}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-6 py-5 font-mono text-xs">
                <Meta k="Category" v={active.category} />
                <Meta k="Risk Level" v={active.risk_level} />
                <Meta k="Control Type" v={active.control_type} />
                <Meta k="Frequency" v={active.frequency} />
                <Meta k="Owner Role" v={active.owner_role} />
                <Meta k="Automated" v={active.automated ? "Yes" : "No"} />
              </dl>
              <div className="border-t border-slate-800 px-6 py-5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Objective</p>
                <p className="mt-2 text-sm text-slate-300">{active.objective}</p>
              </div>
              {active.requirement && (
                <div className="border-t border-slate-800 px-6 py-5">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Regulatory Mapping</p>
                  <p className="mt-2 text-sm text-slate-300">{active.requirement.requirement_code} · {active.requirement.title}</p>
                </div>
              )}
              {active.run && (
                <div className="border-t border-slate-800 px-6 py-5">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Latest Test Run</p>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <RunStat label="Tested" value={active.run.records_tested.toLocaleString()} />
                    <RunStat label="Passed" value={active.run.passed_count.toLocaleString()} tone="text-emerald-300" />
                    <RunStat label="Exceptions" value={active.run.failed_count} tone="text-rose-300" />
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Meta({ k, v }) {
  return <div><dt className="text-slate-500">{k}</dt><dd className="mt-0.5 text-slate-200">{v}</dd></div>;
}
function RunStat({ label, value, tone = "text-slate-100" }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3 text-center">
      <p className={`font-heading text-xl font-bold ${tone}`}>{value}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
    </div>
  );
}
