import React from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, Card, shortDate } from "@/components/app/shared";
import { LoadingState, ErrorState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

export default function ControlsApp() {
  const navigate = useNavigate();
  const [controls, setControls] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [state, setState] = React.useState({ loading: true, error: false });

  const loadList = React.useCallback(async () => {
    setState({ loading: true, error: false });
    try {
      const { data } = await api.get("/controls");
      setControls(data.controls);
      const primary = data.controls.find((c) => c.primary) || data.controls[0];
      setSelected(primary?.control_code);
      setState({ loading: false, error: false });
    } catch {
      setState({ loading: false, error: true });
    }
  }, []);

  React.useEffect(() => { loadList(); }, [loadList]);

  React.useEffect(() => {
    if (!selected) return;
    setDetail(null);
    api.get(`/controls/${selected}`).then(({ data }) => setDetail(data)).catch(() => setDetail(false));
  }, [selected]);

  if (state.loading) return <LoadingState label="Loading controls" />;
  if (state.error) return <ErrorState description="Controls could not be loaded." onRetry={loadList} />;

  return (
    <div>
      <PageHeader eyebrow="Controls" title="Operational Controls"
        subtitle="Deterministic controls mapping regulatory requirements to automated tests against payment operations data." />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          {controls.map((c) => (
            <button key={c.id} onClick={() => setSelected(c.control_code)} data-testid={`control-row-${c.control_code.toLowerCase()}`}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${selected === c.control_code ? "border-sky-500/50 bg-sky-500/5" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-500">{c.control_code}{c.primary && <span className="ml-2 text-sky-400">★</span>}</span>
                <StatusBadge value={c.risk_level} />
              </div>
              <p className="mt-2 text-sm font-medium text-slate-200">{c.name}</p>
              {c.run && (
                <p className="mt-2 font-mono text-[11px] text-slate-500">
                  {c.run.passed_count?.toLocaleString()} passed · {c.run.failed_count} failed · {c.run.warning_count} warn · {c.run.not_testable_count} n/t
                </p>
              )}
            </button>
          ))}
        </div>

        <div className="lg:col-span-3">
          {detail === null ? <LoadingState label="Loading control" /> : detail === false ? <ErrorState description="Control detail could not be loaded." /> : (
            <ControlDetail detail={detail} navigate={navigate} />
          )}
        </div>
      </div>
    </div>
  );
}

function ControlDetail({ detail, navigate }) {
  const { control: c, test, requirement, source, latest_run, runs, exceptions, exceptions_count } = detail;
  return (
    <Card testid="control-detail">
      <div className="border-b border-slate-800 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-slate-500">{c.control_code}</span>
          <StatusBadge value={c.status} />
          <StatusBadge value={c.risk_level} />
        </div>
        <h2 className="mt-2 font-heading text-xl font-semibold text-slate-100">{c.name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.description}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-6 py-5 font-mono text-xs sm:grid-cols-3">
        <Meta k="Category" v={c.category} /><Meta k="Control Type" v={c.control_type} />
        <Meta k="Frequency" v={c.frequency} /><Meta k="Owner Role" v={c.owner_role} />
        <Meta k="Automated" v={c.automated ? "Yes" : "No"} />
        <Meta k="Regulatory Map" v={requirement ? requirement.requirement_code : "—"} />
      </dl>

      <Section title="Regulatory Mapping">
        {source && requirement ? (
          <div className="space-y-3">
            <Layer label="Official Regulatory Source" tone="border-slate-700" text={`${source.regulator} · ${source.title} (${source.version})`} link={source.source_url} />
            <Layer label="Regulatory Requirement" tone="border-slate-700" text={`${requirement.requirement_code} — ${requirement.title}: ${requirement.requirement_summary}`} />
            <Layer label="TUGMA Interpretation" tone="border-sky-500/40" text={c.interpretation} />
            <Layer label="TUGMA Operational Control / Automated Test" tone="border-emerald-500/40" text={c.test_logic} mono />
          </div>
        ) : <p className="text-sm text-amber-300/80">Missing regulatory mapping.</p>}
      </Section>

      <Section title="Control Objective"><p className="text-sm text-slate-300">{c.objective}</p></Section>

      {latest_run && (
        <Section title="Latest Test Run">
          <p className="mb-3 font-mono text-[11px] text-slate-500">Completed {shortDate(latest_run.completed_at)} · triggered by {latest_run.triggered_by}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <RunStat label="Tested" value={latest_run.records_tested?.toLocaleString()} />
            <RunStat label="Passed" value={latest_run.passed_count?.toLocaleString()} tone="text-emerald-300" />
            <RunStat label="Failed" value={latest_run.failed_count} tone="text-rose-300" />
            <RunStat label="Warning" value={latest_run.warning_count} tone="text-amber-300" />
            <RunStat label="Not Testable" value={latest_run.not_testable_count} tone="text-slate-300" />
          </div>
        </Section>
      )}

      {runs?.length > 1 && (
        <Section title={`Historical Runs (${runs.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-800 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Completed</th><th className="py-2 pr-4">Tested</th><th className="py-2 pr-4">Passed</th><th className="py-2 pr-4">Failed</th><th className="py-2 pr-4">Trigger</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800 font-mono text-xs">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-4 text-slate-400">{shortDate(r.completed_at)}</td>
                    <td className="py-2 pr-4 text-slate-300">{r.records_tested?.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-emerald-300">{r.passed_count?.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-rose-300">{r.failed_count}</td>
                    <td className="py-2 pr-4 text-slate-500">{r.triggered_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {exceptions_count > 0 && (
        <Section title={`Related Exceptions (${exceptions_count})`}>
          <div className="space-y-2">
            {exceptions.slice(0, 8).map((e) => (
              <button key={e.id} onClick={() => navigate(`/app/exceptions/${e.exception_code}`)} data-testid={`control-exc-${e.exception_code}`}
                className="flex w-full items-center justify-between rounded-md border border-slate-800 bg-slate-950/40 px-4 py-2.5 text-left transition-colors hover:border-sky-500/40">
                <span className="font-mono text-xs text-slate-300">{e.exception_code}</span>
                <div className="flex items-center gap-2"><StatusBadge value={e.severity} /><StatusBadge value={e.status} /></div>
              </button>
            ))}
            {exceptions_count > 8 && <p className="pt-1 font-mono text-[11px] text-slate-500">+ {exceptions_count - 8} more — see Exceptions</p>}
          </div>
        </Section>
      )}
    </Card>
  );
}

function Section({ title, children }) {
  return <div className="border-t border-slate-800 px-6 py-5"><p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-slate-500">{title}</p>{children}</div>;
}
function Meta({ k, v }) { return <div><dt className="text-slate-500">{k}</dt><dd className="mt-0.5 text-slate-200">{v}</dd></div>; }
function RunStat({ label, value, tone = "text-slate-100" }) {
  return <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3 text-center"><p className={`font-heading text-lg font-bold ${tone}`}>{value ?? 0}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-slate-500">{label}</p></div>;
}
function Layer({ label, tone, text, link, mono }) {
  return (
    <div className={`rounded-lg border ${tone} bg-slate-950/40 p-4`}>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1.5 ${mono ? "font-mono text-[11px]" : "text-xs"} leading-relaxed text-slate-300`}>{text}</p>
      {link && <a href={link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[11px] text-sky-400 hover:text-sky-300">Official source →</a>}
    </div>
  );
}
