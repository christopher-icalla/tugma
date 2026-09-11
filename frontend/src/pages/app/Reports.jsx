import React from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useApi, PageHeader, Card, shortDate } from "@/components/app/shared";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

export default function Reports() {
  const { loading, error, data, reload } = useApi("/reports");
  if (loading) return <LoadingState label="Loading reports" />;
  if (error) return <ErrorState description="Reports could not be loaded." onRetry={reload} />;

  const packages = data.packages || [];

  return (
    <div>
      <PageHeader eyebrow="Reports" title="Evidence Packages & Attestations"
        subtitle="Verifiable evidence packages with their Stellar testnet integrity attestations." />

      {packages.length === 0 ? (
        <EmptyState title="No reports generated" description="Finalized evidence packages will appear here for export and verification." />
      ) : (
        <div className="space-y-6">
          {packages.map((p) => (
            <Card key={p.id} testid={`report-${p.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-6 py-5">
                <div>
                  <h2 className="font-heading text-lg font-semibold text-slate-100">{p.name}</h2>
                  <p className="mt-1 font-mono text-xs text-slate-500">{p.period_start} → {p.period_end} · Generated {shortDate(p.generated_at)}</p>
                </div>
                <StatusBadge value={p.status} />
              </div>

              <div className="grid gap-6 px-6 py-6 lg:grid-cols-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Package Summary</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs">
                    <Sum k="Controls" v={p.controls_count} />
                    <Sum k="Transactions" v={p.transactions_count?.toLocaleString()} />
                    <Sum k="Exceptions" v={p.exceptions_count} />
                    <Sum k="Evidence" v={p.evidence_count} />
                    <Sum k="Completeness" v={`${p.completeness_score}%`} />
                  </div>
                  <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/50 p-3">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Canonical Hash</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-emerald-300/80">{p.canonical_hash}</p>
                  </div>
                </div>

                {p.stellar && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-sky-400" />
                        <span className="font-mono text-xs uppercase tracking-widest text-slate-300">Stellar Attestation</span>
                      </div>
                      <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-300">{p.stellar.network}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">
                      <span className="rounded border border-slate-700 px-2 py-1">Package</span>
                      <ArrowRight className="h-3 w-3 text-sky-500" />
                      <span className="rounded border border-slate-700 px-2 py-1">SHA-256</span>
                      <ArrowRight className="h-3 w-3 text-sky-500" />
                      <span className="rounded border border-slate-700 px-2 py-1">Stellar</span>
                      <ArrowRight className="h-3 w-3 text-sky-500" />
                      <StatusBadge value={p.stellar.verification_status} />
                    </div>
                    <dl className="mt-4 space-y-2 font-mono text-[11px]">
                      <Row k="Ledger" v={p.stellar.ledger?.toLocaleString()} />
                      <Row k="Tx Hash" v={`${p.stellar.transaction_hash?.slice(0, 24)}…`} />
                      <Row k="Verified" v={shortDate(p.stellar.verified_at)} />
                    </dl>
                    <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                      Only the canonical hash is attested. Sensitive payment and customer data remains off-chain. Testnet prototype — not mainnet.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Sum({ k, v }) {
  return <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3"><p className="font-heading text-lg font-bold text-slate-100">{v}</p><p className="font-mono text-[9px] uppercase tracking-widest text-slate-500">{k}</p></div>;
}
function Row({ k, v }) {
  return <div className="flex items-center justify-between border-b border-slate-800 pb-1.5"><dt className="text-slate-500">{k}</dt><dd className="text-slate-300">{v}</dd></div>;
}
