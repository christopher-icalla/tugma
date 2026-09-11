import React from "react";
import { FileBarChart, ShieldCheck, Loader2, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, Card, shortDate } from "@/components/app/shared";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/perms";
import { toast } from "sonner";

export default function Reports() {
  const { user } = useAuth();
  const [packages, setPackages] = React.useState(null);
  const [state, setState] = React.useState({ loading: true, error: false });
  const [form, setForm] = React.useState({ name: "Q1 2026 Evidence Package", period_start: "2026-01-01", period_end: "2026-03-31" });
  const [busy, setBusy] = React.useState(false);
  const canGenerate = can(user?.role, "package:generate");

  const load = React.useCallback(async () => {
    setState({ loading: true, error: false });
    try {
      const { data } = await api.get("/evidence-packages");
      setPackages(data.packages);
      setState({ loading: false, error: false });
    } catch { setState({ loading: false, error: true }); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/evidence-packages/generate", form);
      toast.success(`Package generated · SHA-256 ${data.package.canonical_hash.slice(0, 12)}…`);
      await load();
    } catch (e) { toast.error(e.response?.data?.detail || "Generation failed"); }
    finally { setBusy(false); }
  };

  if (state.loading) return <LoadingState label="Loading reports" />;
  if (state.error) return <ErrorState description="Reports could not be loaded." onRetry={load} />;

  return (
    <div>
      <PageHeader eyebrow="Reports" title="Evidence Packages & Integrity Proof"
        subtitle="Generate a verifiable evidence package for a reporting period. The canonical package is hashed with SHA-256; the same package always reproduces the same hash." />

      <Card className="mb-6 p-6" testid="package-generator">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Generate Evidence Package</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1"><span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="pkg-name" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" /></label>
          <label className="flex flex-col gap-1"><span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Period start</span>
            <input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} data-testid="pkg-start" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" /></label>
          <label className="flex flex-col gap-1"><span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Period end</span>
            <input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} data-testid="pkg-end" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" /></label>
          {canGenerate ? (
            <button disabled={busy} onClick={generate} data-testid="generate-package-btn" className="inline-flex items-center gap-2 rounded-md bg-sky-500 px-5 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Generate Package
            </button>
          ) : <p className="font-mono text-[11px] text-amber-300/80">Your role cannot generate packages (COMPLIANCE / ADMIN only).</p>}
        </div>
      </Card>

      {(!packages || packages.length === 0) ? (
        <EmptyState title="No packages generated" description="Generate an evidence package for a reporting period to produce a verifiable SHA-256 integrity proof." icon={FileBarChart} />
      ) : (
        <div className="space-y-6">
          {packages.map((p) => (
            <Card key={p.id} testid={`report-${p.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-6 py-5">
                <div><h2 className="font-heading text-lg font-semibold text-slate-100">{p.name}</h2>
                  <p className="mt-1 font-mono text-xs text-slate-500">{p.period_start} → {p.period_end} · generated {shortDate(p.generated_at)}{p.generated_by ? ` by ${p.generated_by}` : ""}</p></div>
                <StatusBadge value={p.status} />
              </div>
              <div className="grid gap-6 px-6 py-6 lg:grid-cols-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Package Summary</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-3">
                    <Sum k="Controls" v={p.controls_count} /><Sum k="Transactions" v={p.transactions_count?.toLocaleString()} />
                    <Sum k="Exceptions" v={p.exceptions_count} /><Sum k="Evidence" v={p.evidence_count} /><Sum k="Completeness" v={`${p.completeness_score}%`} />
                  </div>
                  <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/50 p-3">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Canonical Evidence Package · SHA-256</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-emerald-300/80" data-testid={`pkg-hash-${p.id}`}>{p.canonical_hash}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-5">
                  <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-sky-400" /><span className="font-mono text-xs uppercase tracking-widest text-slate-300">Integrity Layer</span></div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">The canonical package is hashed with SHA-256. Re-generating the same period reproduces an identical hash, proving the evidence set is unchanged.</p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                    <Clock className="h-3.5 w-3.5 text-amber-300" />
                    <span className="font-mono text-[11px] uppercase tracking-wider text-amber-300">Stellar Testnet Attestation — Coming in next phase</span>
                  </div>
                </div>
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
