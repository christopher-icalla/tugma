import React from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { packageQrText, verifierLink } from "@/lib/verifier";

const PRINT_CSS = `
@page { size: A4; margin: 14mm; }
@media print {
  html, body, #root, .App { background: #fff !important; }
  .no-print { display: none !important; }
  .report section { break-inside: avoid-page; }
  .report tr { break-inside: avoid; }
}`;

const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" }) : "—");
const time = (iso) => (iso ? new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const short = (h, n = 16) => (h ? `${h.slice(0, n)}…` : "—");

function H2({ n, children }) {
  return <h2 className="mb-3 mt-8 border-b border-slate-300 pb-1 text-base font-bold text-slate-900">{n}. {children}</h2>;
}

function Table({ head, rows, testid }) {
  return (
    <table className="w-full border-collapse text-[11px]" data-testid={testid}>
      <thead><tr>{head.map((h) => <th key={h} className="border-b border-slate-400 py-1.5 pr-2 text-left font-semibold text-slate-700">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-slate-200 align-top">{r.map((c, j) => <td key={j} className="py-1.5 pr-2 text-slate-800">{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

/** Printable, regulator-style audit report for one finalized package; the browser saves it as PDF. */
export default function AuditReport() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const { user } = useAuth();
  const [state, setState] = React.useState({ loading: true, error: null, data: null });

  React.useEffect(() => {
    if (!user) return;
    api.get(`/evidence-packages/${encodeURIComponent(id)}/report`)
      .then(({ data }) => setState({ loading: false, error: null, data }))
      .catch((e) => setState({ loading: false, error: e.response?.data?.detail || "The report could not be loaded.", data: null }));
  }, [id, user]);

  const autoPrint = search.get("print") === "1";
  React.useEffect(() => {
    if (!state.data) return undefined;
    document.title = `TUGMA audit report - ${state.data.package.id}`;
    if (!autoPrint) return undefined;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [state.data, autoPrint]);

  if (user === false) return <Navigate to="/login" replace />;
  if (!user || state.loading) return <p className="p-8 text-sm text-slate-400">Preparing the audit report…</p>;
  if (state.error) return <p className="p-8 text-sm text-rose-300">{state.error}</p>;

  const r = state.data;
  const p = r.package;
  const latest = p.attestations?.[0];
  const tx = (h) => (h ? `${r.network.explorer_url.replace(/\/+$/, "")}/tx/${h}` : null);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{PRINT_CSS}</style>
      <div className="no-print sticky top-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-3">
        <Link to="/app/reports" className="text-sm text-sky-700 hover:underline">← Back to Reports</Link>
        <button type="button" onClick={() => window.print()} data-testid="print-report"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Print / Save as PDF</button>
      </div>

      <article className="report mx-auto max-w-[820px] px-8 py-10 text-[12px] leading-relaxed" data-testid="audit-report">
        <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">TUGMA · Control Evidence Audit Report</p>
            <h1 className="mt-1 text-2xl font-bold">{p.name}</h1>
            <p className="mt-1 text-slate-600">{r.organization.name} · Period {p.period_start} to {p.period_end}</p>
          </div>
          <div className="text-right text-[11px] text-slate-600">
            <p>Report prepared {time(r.generated_at)}</p>
            <p>by {r.prepared_by}</p>
            <p className="mt-1">Package generated {time(p.generated_at)}{p.generated_by ? ` by ${p.generated_by}` : ""}</p>
          </div>
        </header>

        <section>
          <H2 n={1}>Integrity proof</H2>
          <div className="flex items-start gap-5">
            <div className="shrink-0 border border-slate-300 p-1.5"><QRCodeSVG value={packageQrText(p)} size={112} level="M" /></div>
            <dl className="grid flex-1 grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[11px]">
              <dt className="text-slate-500">Package id</dt><dd className="font-mono">{p.id}</dd>
              <dt className="text-slate-500">SHA-256</dt><dd className="break-all font-mono">{p.canonical_hash}</dd>
              <dt className="text-slate-500">Network</dt><dd>Stellar {r.network.name}</dd>
              <dt className="text-slate-500">Contract</dt><dd className="break-all font-mono">{r.network.contract_id}</dd>
              <dt className="text-slate-500">On-chain organization id</dt><dd className="font-mono">{r.organization.chain_org_id}</dd>
              {latest ? (
                <>
                  <dt className="text-slate-500">Attested</dt>
                  <dd>Version {latest.version} on {time(latest.submitted_at)} by {latest.attester_name}<br />
                    <span className="break-all font-mono">ledger {latest.ledger}{latest.transaction_hash ? ` · tx ${latest.transaction_hash}` : ""}</span></dd>
                  <dt className="text-slate-500">Countersigned</dt>
                  <dd>{latest.verified_at
                    ? <>{time(latest.verified_at)} by {latest.verifier_name}<br /><span className="break-all font-mono">ledger {latest.countersign_ledger}{latest.countersign_tx_hash ? ` · tx ${latest.countersign_tx_hash}` : ""}</span></>
                    : "Not yet countersigned"}</dd>
                  <dt className="text-slate-500">Hash matches package</dt><dd>{p.stellar?.hash_matches_package ? "Yes" : "No: the latest attestation is for a different hash"}</dd>
                </>
              ) : (
                <><dt className="text-slate-500">Attestation</dt><dd>Not yet attested on Stellar</dd></>
              )}
            </dl>
          </div>
          <p className="mt-3 break-words text-[11px] text-slate-600">
            To check this package independently, download its file from TUGMA and open it in the open-source verifier
            ({verifierLink(p.canonical_hash)}), or run <span className="font-mono">tugma-verify</span>. The verifier recomputes the SHA-256 and reads the attestation directly from the Stellar contract.
            {latest?.transaction_hash && <> Attestation transaction: {tx(latest.transaction_hash)}</>}
          </p>
        </section>

        <section>
          <H2 n={2}>Summary</H2>
          <div className="grid grid-cols-5 gap-2 text-center">
            {[["Controls", p.controls_count], ["Transactions", p.transactions_count?.toLocaleString()], ["Exceptions", p.exceptions_count], ["Evidence", p.evidence_count], ["Completeness", `${p.completeness_score}%`]].map(([k, v]) => (
              <div key={k} className="border border-slate-300 py-2"><p className="text-lg font-bold">{v}</p><p className="text-[10px] uppercase tracking-wider text-slate-500">{k}</p></div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Exceptions by severity: {Object.entries(r.exceptions_by_severity).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.
            {" "}By status: {Object.entries(r.exceptions_by_status).map(([k, v]) => `${k.replace("_", " ")} ${v}`).join(", ") || "none"}.
          </p>
        </section>

        <section>
          <H2 n={3}>Control results</H2>
          <Table testid="report-controls" head={["Control", "Requirement", "Tested", "Passed", "Failed", "Warnings", "Not testable", "Last run"]}
            rows={r.controls.map((c) => [
              <span key="c"><b>{c.control_code}</b> {c.name}</span>, `${c.regulator ?? ""} ${c.requirement_code ?? "—"}`,
              c.run?.records_tested?.toLocaleString() ?? "—", c.run?.passed_count?.toLocaleString() ?? "—", c.run?.failed_count ?? "—",
              c.run?.warning_count ?? "—", c.run?.not_testable_count ?? "—", day(c.run?.completed_at),
            ])} />
          <p className="mt-1 text-[10px] text-slate-500">Control results are the latest run at the time of this report.</p>
        </section>

        <section>
          <H2 n={4}>Exceptions in this package ({r.exceptions.length})</H2>
          {r.exceptions.length === 0 ? <p className="text-slate-600">No exceptions in this period.</p> : (
            <Table testid="report-exceptions" head={["Exception", "Control", "Severity", "Status", "Description", "Due"]}
              rows={r.exceptions.map((e) => [<span key="e" className="font-mono">{e.exception_code}</span>, e.control_code, e.severity, e.status.replace("_", " "), e.title, day(e.due_date)])} />
          )}
        </section>

        <section>
          <H2 n={5}>Evidence index ({r.evidence.length})</H2>
          {r.evidence.length === 0 ? <p className="text-slate-600">No evidence records in this package.</p> : (
            <>
              <Table testid="report-evidence" head={["Evidence", "Name", "Type", "Captured", "SHA-256 in package", "Record now"]}
                rows={r.evidence.map((e) => [
                  <span key="i" className="font-mono">{e.id}</span>, e.name ?? "(record not found)", e.evidence_type ?? "—",
                  e.captured_at ? `${day(e.captured_at)} · ${e.captured_by}` : "—", <span key="h" className="font-mono">{short(e.hash_in_package)}</span>,
                  e.unchanged ? "Unchanged" : <b key="x">Changed or missing</b>,
                ])} />
              {r.evidence_changed > 0 && <p className="mt-1 text-[11px] font-semibold">{r.evidence_changed} evidence record(s) no longer match the hash recorded in this package.</p>}
            </>
          )}
        </section>

        <section>
          <H2 n={6}>Scope and limitations</H2>
          <p className="text-[11px] text-slate-600">
            A matching attestation shows that this package is exactly the package attested on Stellar. It establishes package
            integrity only, not that the contents are true or that the organization is compliant. TUGMA does not provide legal
            advice or certify compliance. All data in this demonstration is synthetic, and the Stellar integration runs on Testnet.
          </p>
        </section>
      </article>
    </div>
  );
}
