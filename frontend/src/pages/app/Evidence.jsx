import React from "react";
import { FileCheck2, Package } from "lucide-react";
import { useApi, PageHeader, Card, shortDate } from "@/components/app/shared";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

export default function Evidence() {
  const { loading, error, data, reload } = useApi("/evidence");
  if (loading) return <LoadingState label="Loading evidence" />;
  if (error) return <ErrorState description="Evidence could not be loaded." onRetry={reload} />;

  const evidence = data.evidence || [];
  const packages = data.packages || [];

  return (
    <div>
      <PageHeader eyebrow="Evidence" title="Evidence & Packages"
        subtitle="Control evidence artifacts and the canonical, hashable evidence packages assembled from them." />

      {packages.length > 0 && (
        <div className="mb-8 grid gap-4 md:grid-cols-2">
          {packages.map((p) => (
            <Card key={p.id} testid={`evidence-package-${p.id}`} className="p-6">
              <div className="flex items-center justify-between">
                <Package className="h-5 w-5 text-sky-400" />
                <StatusBadge value={p.status} />
              </div>
              <h3 className="mt-3 font-heading text-lg font-semibold text-slate-100">{p.name}</h3>
              <p className="mt-1 font-mono text-xs text-slate-500">{p.period_start} → {p.period_end}</p>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                <Mini k="Controls" v={p.controls_count} />
                <Mini k="Exceptions" v={p.exceptions_count} />
                <Mini k="Evidence" v={p.evidence_count} />
                <Mini k="Complete" v={`${p.completeness_score}%`} />
              </div>
              <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/50 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Canonical SHA-256</p>
                <p className="mt-1 break-all font-mono text-[11px] text-emerald-300/80">{p.canonical_hash}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card testid="evidence-table" className="overflow-hidden">
        <div className="border-b border-slate-800 px-5 py-4"><h2 className="font-heading text-base font-semibold text-slate-200">Evidence Artifacts</h2></div>
        {evidence.length === 0 ? (
          <div className="p-5"><EmptyState title="No evidence captured" description="Evidence artifacts appear here once controls capture supporting records." icon={FileCheck2} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Captured</th>
                  <th className="px-5 py-3">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {evidence.map((e) => (
                  <tr key={e.id} data-testid={`evidence-row-${e.id}`} className="transition-colors hover:bg-slate-900/60">
                    <td className="px-5 py-3 text-slate-200">{e.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-400">{e.evidence_type}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-400">{e.source_system}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{shortDate(e.captured_at)}</td>
                    <td className="px-5 py-3"><StatusBadge value={e.verification_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Mini({ k, v }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/50 p-2">
      <p className="font-heading text-lg font-bold text-slate-100">{v}</p>
      <p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{k}</p>
    </div>
  );
}
