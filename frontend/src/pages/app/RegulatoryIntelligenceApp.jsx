import React from "react";
import { ExternalLink } from "lucide-react";
import { useApi, PageHeader, Card } from "@/components/app/shared";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

export default function RegulatoryIntelligenceApp() {
  const { loading, error, data, reload } = useApi("/regulatory/sources");
  if (loading) return <LoadingState label="Loading regulatory sources" />;
  if (error) return <ErrorState description="Regulatory sources could not be loaded." onRetry={reload} />;

  const sources = data.sources || [];

  return (
    <div>
      <PageHeader eyebrow="Regulatory Intelligence" title="Regulatory Sources & Mapping"
        subtitle="Authoritative regulatory requirements mapped to TUGMA operational controls." />

      <div className="space-y-6">
        {sources.map((s) => (
          <Card key={s.id} testid={`reg-source-${s.regulator.toLowerCase()}`}>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
              <div>
                <div className="flex items-center gap-3">
                  <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 font-mono text-xs font-semibold tracking-widest text-sky-300">{s.regulator}</span>
                  <StatusBadge value={s.status} />
                </div>
                <h2 className="mt-3 font-heading text-lg font-semibold text-slate-100">{s.title}</h2>
                <p className="mt-1 text-sm text-slate-400">{s.regulator_full} · Version {s.version} · Effective {s.effective_date}</p>
              </div>
              <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-sky-400 transition-colors hover:text-sky-300">
                Official source <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="divide-y divide-slate-800">
              {(s.requirements || []).map((r) => (
                <div key={r.id} className="px-6 py-5" data-testid={`requirement-${r.requirement_code.toLowerCase()}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{r.requirement_code}</span>
                    <span className="text-sm font-medium text-slate-200">{r.title}</span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <Layer label="Official Regulatory Requirement" tone="border-slate-700" text={r.requirement_summary} />
                    <Layer label="TUGMA Interpretation" tone="border-sky-500/40"
                      text={r.mapped_controls?.[0]?.interpretation || "Interpretation is defined when a control is mapped."} />
                    <Layer label="TUGMA Operational Control" tone="border-emerald-500/40"
                      text={r.mapped_controls?.length ? r.mapped_controls.map((c) => `${c.control_code} · ${c.name}`).join("  |  ") : null}
                      empty="No control mapped yet" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
        {sources.length === 0 && <EmptyState title="No regulatory sources" description="No sources have been loaded into this environment." />}
      </div>

      <div className="mt-8 rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-xs leading-relaxed text-slate-400">
        TUGMA provides regulatory intelligence and control-mapping software. It does not provide legal
        advice, certify compliance, or represent that an organization is approved or certified by any
        government authority. Regulatory requirements should always be reviewed against the applicable
        official publication.
      </div>
    </div>
  );
}

function Layer({ label, tone, text, empty }) {
  return (
    <div className={`rounded-lg border ${tone} bg-slate-950/40 p-4`}>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      {text ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-300">{text}</p>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300/80"><span className="text-[8px]">▲</span> {empty}</p>
      )}
    </div>
  );
}
