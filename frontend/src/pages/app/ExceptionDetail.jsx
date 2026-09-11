import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, Card, shortDate } from "@/components/app/shared";
import { LoadingState, ErrorState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

const WORKFLOW = ["OPEN", "IN_REVIEW", "REMEDIATION", "RESOLVED", "VERIFIED"];

export default function ExceptionDetail() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [state, setState] = React.useState({ loading: true, error: false, code: null });

  const load = React.useCallback(async () => {
    setState({ loading: true, error: false });
    try {
      const { data } = await api.get(`/exceptions/${code}`);
      setData(data);
      setState({ loading: false, error: false });
    } catch (e) {
      setState({ loading: false, error: true, code: e.response?.status });
    }
  }, [code]);

  React.useEffect(() => { load(); }, [load]);

  if (state.loading) return <LoadingState label="Loading exception" />;
  if (state.error) return <ErrorState title={state.code === 404 ? "Exception not found" : "Unable to load exception"} description={state.code === 404 ? `No exception ${code} exists.` : "Please retry."} onRetry={load} />;

  const e = data.exception;
  const exp = e.explanation || {};
  const currentStep = WORKFLOW.indexOf(e.status);

  return (
    <div>
      <button onClick={() => navigate("/app/exceptions")} className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs text-slate-400 transition-colors hover:text-sky-300"><ArrowLeft className="h-3.5 w-3.5" /> Back to exceptions</button>
      <PageHeader eyebrow={e.exception_code} title={e.title}
        subtitle={e.description}
        right={<div className="flex items-center gap-2"><StatusBadge value={e.severity} /><StatusBadge value={e.status} testid="exc-detail-status" /></div>} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* WHY panel — generated from the actual test result */}
        <Card className="border-sky-500/30 p-6 lg:col-span-2" testid="why-flagged-panel">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-sky-400" />
            <p className="font-mono text-[11px] uppercase tracking-widest text-sky-300">Why TUGMA flagged this</p>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">{exp.narrative}</p>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field k="Control" v={`${e.control_code} — ${data.control?.name || ""}`} />
            <Field k="Check" v={exp.check} />
            <Field k="Expected" v={exp.expected} tone="text-slate-100" />
            <Field k="Actual" v={exp.actual} tone="text-rose-300" />
            <Field k="Variance" v={exp.variance || "n/a"} tone="text-amber-300" />
            <Field k="Tolerance" v={exp.tolerance} />
          </dl>
          <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5">
            <span className="font-mono text-xs uppercase tracking-widest text-rose-300">Result: {exp.result}</span>
          </div>
        </Card>

        <Card className="p-6" testid="exc-meta">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Exception</p>
          <dl className="mt-4 space-y-3 font-mono text-xs">
            <Row k="Owner" v={e.owner_name ? `${e.owner_name} (${e.owner_role})` : e.owner_role} />
            <Row k="Detected" v={shortDate(e.detected_at)} />
            <Row k="Due" v={shortDate(e.due_date)} />
            {e.resolved_at && <Row k="Resolved" v={shortDate(e.resolved_at)} />}
            {e.verified_at && <Row k="Verified" v={shortDate(e.verified_at)} />}
            {e.transaction_id && (
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <dt className="text-slate-500">Transaction</dt>
                <dd><Link to={`/app/transactions/${e.transaction_id}`} className="text-sky-400 hover:text-sky-300">{e.transaction_id}</Link></dd>
              </div>
            )}
            {data.test_run && <Row k="Test run" v={data.test_run.id} />}
          </dl>
        </Card>
      </div>

      <Card className="mt-6 p-6" testid="exc-workflow">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Remediation Workflow</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {WORKFLOW.map((s, i) => (
            <React.Fragment key={s}>
              <span className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider ${i <= currentStep && currentStep >= 0 ? "border-sky-500/40 bg-sky-500/10 text-sky-300" : "border-slate-800 text-slate-500"}`}>{s.replace("_", " ")}</span>
              {i < WORKFLOW.length - 1 && <span className="text-slate-700">→</span>}
            </React.Fragment>
          ))}
        </div>
        {data.remediation_actions.length > 0 && (
          <div className="mt-6 space-y-2">
            {data.remediation_actions.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/40 px-4 py-3">
                <span className="text-sm text-slate-300">{a.action}</span>
                <StatusBadge value={a.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ k, v, tone = "text-slate-200" }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{k}</dt>
      <dd className={`mt-1.5 font-mono text-sm ${tone}`}>{v ?? "—"}</dd>
    </div>
  );
}
function Row({ k, v }) {
  return <div className="flex items-center justify-between border-b border-slate-800 pb-2"><dt className="text-slate-500">{k}</dt><dd className="break-all text-slate-300">{v}</dd></div>;
}
