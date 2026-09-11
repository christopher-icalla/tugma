import React from "react";
import { Link } from "react-router-dom";
import { FileCheck2, Package } from "lucide-react";
import { api } from "@/lib/api";
import { useApi, PageHeader, Card, shortDate } from "@/components/app/shared";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

const ASSOC = [
  ["exception_id", "Exception"], ["control_id", "Control"], ["transaction_id", "Transaction"],
  ["requirement_id", "Requirement"], ["control_test_id", "Test"], ["remediation_id", "Remediation"],
];

export default function Evidence() {
  const { loading, error, data, reload } = useApi("/evidence");
  const [completeness, setCompleteness] = React.useState(null);

  React.useEffect(() => { api.get("/evidence/completeness").then(({ data }) => setCompleteness(data)).catch(() => {}); }, [data]);

  if (loading) return <LoadingState label="Loading evidence" />;
  if (error) return <ErrorState description="Evidence could not be loaded." onRetry={reload} />;

  const evidence = data.evidence || [];
  const packages = data.packages || [];

  return (
    <div>
      <PageHeader eyebrow="Evidence" title="Evidence Center"
        subtitle="Evidence records captured against requirements, controls, tests, transactions, exceptions and remediation. Attach evidence from an exception's detail page." />

      {completeness && (
        <Card className="mb-6 p-6" testid="evidence-completeness">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Evidence Completeness (dynamic)</p>
              <p className="mt-2 font-heading text-4xl font-bold text-slate-50">{completeness.completeness}%</p>
              <p className="mt-1 font-mono text-xs text-slate-500">{completeness.exceptions_with_evidence} of {completeness.total_exceptions} exceptions have evidence</p>
            </div>
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-800 sm:w-64">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${completeness.completeness}%` }} />
            </div>
          </div>
        </Card>
      )}

      <Card testid="evidence-table" className="overflow-hidden">
        <div className="border-b border-slate-800 px-5 py-4"><h2 className="font-heading text-base font-semibold text-slate-200">Evidence Records ({evidence.length})</h2></div>
        {evidence.length === 0 ? (
          <div className="p-5"><EmptyState title="No evidence captured yet" description="Evidence records appear here once captured against an exception or control. Nothing is fabricated to inflate metrics." icon={FileCheck2} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-800 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Name</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Associated</th><th className="px-5 py-3">Captured</th><th className="px-5 py-3">SHA-256</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800">
                {evidence.map((ev) => (
                  <tr key={ev.id} data-testid={`evidence-row-${ev.id}`} className="transition-colors hover:bg-slate-900/60">
                    <td className="px-5 py-3 text-slate-200">{ev.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-400">{ev.evidence_type}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {ASSOC.filter(([f]) => ev[f]).map(([f, label]) => (
                          <span key={f} className="rounded border border-slate-800 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-400">{label}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{shortDate(ev.captured_at)} · {ev.captured_by}</td>
                    <td className="px-5 py-3 font-mono text-[10px] text-emerald-300/70">{ev.content_hash?.slice(0, 16)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {packages.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 font-heading text-base font-semibold text-slate-200">Evidence Packages</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {packages.map((p) => (
              <Card key={p.id} className="p-5" testid={`evidence-package-${p.id}`}>
                <div className="flex items-center justify-between"><Package className="h-5 w-5 text-sky-400" /><StatusBadge value={p.status} /></div>
                <h3 className="mt-3 font-heading text-base font-semibold text-slate-100">{p.name}</h3>
                <p className="mt-1 font-mono text-[10px] text-slate-500">{p.period_start} → {p.period_end}</p>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-slate-500">Canonical SHA-256</p>
                <p className="break-all font-mono text-[10px] text-emerald-300/80">{p.canonical_hash}</p>
                <Link to="/app/reports" className="mt-3 inline-block text-xs text-sky-400 hover:text-sky-300">View in Reports →</Link>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
