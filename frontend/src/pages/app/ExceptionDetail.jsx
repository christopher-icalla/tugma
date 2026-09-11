import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, ChevronRight, Plus, MessageSquare, CheckCircle2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, Card, shortDate } from "@/components/app/shared";
import { LoadingState, ErrorState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";

const WORKFLOW = ["OPEN", "IN_REVIEW", "REMEDIATION", "RESOLVED", "VERIFIED"];
const NEXT = { OPEN: "IN_REVIEW", IN_REVIEW: "REMEDIATION", REMEDIATION: "RESOLVED", RESOLVED: "VERIFIED", VERIFIED: null };

export default function ExceptionDetail() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [chain, setChain] = React.useState([]);
  const [users, setUsers] = React.useState([]);
  const [state, setState] = React.useState({ loading: true, error: false, code: null });
  const [busy, setBusy] = React.useState(false);
  const [showEvidence, setShowEvidence] = React.useState(false);
  const [evForm, setEvForm] = React.useState({ name: "", evidence_type: "RESOLUTION_RECORD", source_system: "ERP", content: "" });
  const [comment, setComment] = React.useState("");
  const [assignee, setAssignee] = React.useState("");

  const load = React.useCallback(async () => {
    setState({ loading: true, error: false });
    try {
      const [d, c] = await Promise.all([api.get(`/exceptions/${code}`), api.get(`/exceptions/${code}/chain`)]);
      setData(d.data); setChain(c.data.chain);
      setState({ loading: false, error: false });
    } catch (e) {
      setState({ loading: false, error: true, code: e.response?.status });
    }
  }, [code]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { api.get("/organization").then(({ data }) => setUsers(data.users)).catch(() => {}); }, []);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast.success(okMsg); await load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Action failed"); }
    finally { setBusy(false); }
  };

  if (state.loading) return <LoadingState label="Loading exception" />;
  if (state.error) return <ErrorState title={state.code === 404 ? "Exception not found" : "Unable to load exception"} description={state.code === 404 ? `No exception ${code} exists.` : "Please retry."} onRetry={load} />;

  const e = data.exception;
  const exp = e.explanation || {};
  const perms = data.permissions || {};
  const step = WORKFLOW.indexOf(e.status);
  const next = NEXT[e.status];
  const advanceLabel = next === "VERIFIED" ? "Verify (independent)" : next ? `Advance to ${next.replace("_", " ")}` : "Fully verified";
  const canAdvance = next === "VERIFIED" ? perms.can_verify : perms.can_transition;

  const doAdvance = () => act(() => api.post(`/exceptions/${code}/transition`, { to_status: next }), `Moved to ${next.replace("_", " ")}`);
  const doAssign = () => act(() => api.post(`/exceptions/${code}/assign`, { owner_id: assignee }), "Exception assigned");
  const doRemediation = () => act(() => api.post(`/exceptions/${code}/remediation`, { status: "COMPLETED", completion_note: "Remediation completed." }), "Remediation marked complete");
  const doComment = () => act(async () => { await api.post(`/exceptions/${code}/comment`, { text: comment }); setComment(""); }, "Comment added");
  const doEvidence = () => act(async () => {
    await api.post(`/evidence`, { ...evForm, exception_id: e.id, control_id: e.control_id, transaction_id: e.transaction_id });
    setShowEvidence(false); setEvForm({ name: "", evidence_type: "RESOLUTION_RECORD", source_system: "ERP", content: "" });
  }, "Evidence attached");

  return (
    <div>
      <button onClick={() => navigate("/app/exceptions")} className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs text-slate-400 transition-colors hover:text-sky-300"><ArrowLeft className="h-3.5 w-3.5" /> Back to exceptions</button>
      <PageHeader eyebrow={e.exception_code} title={e.title} subtitle={e.description}
        right={<div className="flex items-center gap-2"><StatusBadge value={e.severity} /><StatusBadge value={e.status} testid="exc-detail-status" /></div>} />

      {/* Evidence chain */}
      <Card className="mb-6 p-6" testid="evidence-chain">
        <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-slate-500">Evidence Chain</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {chain.map((s, i) => (
            <React.Fragment key={s.step}>
              {s.route ? (
                <Link to={s.route} className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 transition-colors hover:border-sky-500/40">
                  <span className="block font-mono text-[9px] uppercase tracking-widest text-sky-400">{s.step}</span>
                  <span className="block max-w-[160px] truncate text-[11px] text-slate-300">{s.label || "—"}</span>
                </Link>
              ) : (
                <div className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <span className="block font-mono text-[9px] uppercase tracking-widest text-slate-500">{s.step}</span>
                  <span className="block max-w-[160px] truncate text-[11px] text-slate-300">{s.label || "—"}</span>
                </div>
              )}
              {i < chain.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-slate-700" />}
            </React.Fragment>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-sky-500/30 p-6 lg:col-span-2" testid="why-flagged-panel">
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-sky-400" /><p className="font-mono text-[11px] uppercase tracking-widest text-sky-300">Why TUGMA flagged this</p></div>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">{exp.narrative}</p>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field k="Control" v={`${e.control_code} — ${data.control?.name || ""}`} />
            <Field k="Check" v={exp.check} />
            <Field k="Expected" v={exp.expected} />
            <Field k="Actual" v={exp.actual} tone="text-rose-300" />
            <Field k="Variance" v={exp.variance || "n/a"} tone="text-amber-300" />
            <Field k="Tolerance" v={exp.tolerance} />
          </dl>
          <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5"><span className="font-mono text-xs uppercase tracking-widest text-rose-300">Result: {exp.result}</span></div>
        </Card>

        <Card className="p-6" testid="exc-meta">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Exception</p>
          <dl className="mt-4 space-y-3 font-mono text-xs">
            <Row k="Owner" v={e.owner_name ? `${e.owner_name} (${e.owner_role})` : e.owner_role} />
            <Row k="Detected" v={shortDate(e.detected_at)} />
            <Row k="Due" v={shortDate(e.due_date)} />
            {e.resolved_at && <Row k="Resolved" v={shortDate(e.resolved_at)} />}
            {e.verified_by_name && <Row k="Verified by" v={e.verified_by_name} />}
            {e.transaction_id && <div className="flex items-center justify-between border-b border-slate-800 pb-2"><dt className="text-slate-500">Transaction</dt><dd><Link to={`/app/transactions/${e.transaction_id}`} className="text-sky-400 hover:text-sky-300">{e.transaction_id}</Link></dd></div>}
          </dl>
        </Card>
      </div>

      {/* Workflow + actions */}
      <Card className="mt-6 p-6" testid="exc-workflow">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Remediation Workflow</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {WORKFLOW.map((s, i) => (
            <React.Fragment key={s}>
              <span className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider ${i <= step ? "border-sky-500/40 bg-sky-500/10 text-sky-300" : "border-slate-800 text-slate-500"}`}>{s.replace("_", " ")}</span>
              {i < WORKFLOW.length - 1 && <span className="text-slate-700">→</span>}
            </React.Fragment>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {perms.can_assign && (
            <div className="flex items-center gap-2">
              <select value={assignee} onChange={(ev) => setAssignee(ev.target.value)} data-testid="assign-select" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-sky-500">
                <option value="">Assign to…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
              </select>
              <button disabled={!assignee || busy} onClick={doAssign} data-testid="assign-btn" className="rounded-md border border-slate-700 px-3 py-2 font-mono text-xs text-slate-200 transition-colors hover:border-sky-500/50 disabled:opacity-40">Assign</button>
            </div>
          )}
          {perms.can_remediate && e.status === "REMEDIATION" && (
            <button disabled={busy} onClick={doRemediation} data-testid="complete-remediation-btn" className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-2 font-mono text-xs text-slate-200 transition-colors hover:border-emerald-500/50"><CheckCircle2 className="h-3.5 w-3.5" /> Complete remediation</button>
          )}
          {perms.can_add_evidence && (
            <button disabled={busy} onClick={() => setShowEvidence((s) => !s)} data-testid="attach-evidence-btn" className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-2 font-mono text-xs text-slate-200 transition-colors hover:border-sky-500/50"><Plus className="h-3.5 w-3.5" /> Attach evidence</button>
          )}
          {next && canAdvance && (
            <button disabled={busy} onClick={doAdvance} data-testid="advance-status-btn" className="inline-flex items-center gap-1.5 rounded-md bg-sky-500 px-4 py-2 font-mono text-xs font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-40">
              {next === "VERIFIED" ? <ShieldCheck className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} {advanceLabel}
            </button>
          )}
          {next === "RESOLVED" && <span className="font-mono text-[11px] text-slate-500">Requires attached evidence + completed remediation</span>}
        </div>

        {showEvidence && (
          <div className="mt-4 grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 sm:grid-cols-2" data-testid="evidence-form">
            <input value={evForm.name} onChange={(ev) => setEvForm({ ...evForm, name: ev.target.value })} placeholder="Evidence name" data-testid="evidence-name" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
            <input value={evForm.evidence_type} onChange={(ev) => setEvForm({ ...evForm, evidence_type: ev.target.value })} placeholder="Type" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
            <input value={evForm.source_system} onChange={(ev) => setEvForm({ ...evForm, source_system: ev.target.value })} placeholder="Source system" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
            <textarea value={evForm.content} onChange={(ev) => setEvForm({ ...evForm, content: ev.target.value })} placeholder="Evidence content / reference (hashed)" className="sm:col-span-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" rows={2} />
            <button disabled={!evForm.name || busy} onClick={doEvidence} data-testid="evidence-save" className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-40">Save evidence</button>
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6" testid="exc-evidence-list">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Evidence ({data.evidence.length})</p>
          {data.evidence.length === 0 ? <p className="mt-3 text-sm text-slate-400">No evidence attached yet.</p> : (
            <div className="mt-3 space-y-2">
              {data.evidence.map((ev) => (
                <div key={ev.id} className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between"><span className="text-sm text-slate-200">{ev.name}</span><StatusBadge value={ev.verification_status} /></div>
                  <p className="mt-1 font-mono text-[10px] text-slate-500">{ev.evidence_type} · {ev.source_system} · by {ev.captured_by}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-emerald-300/70">sha256: {ev.content_hash}</p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Comments ({e.comments?.length || 0})</p>
            <div className="mt-2 space-y-2">
              {(e.comments || []).map((c, i) => (
                <div key={i} className="rounded-md border border-slate-800 bg-slate-950/40 p-2.5"><p className="text-sm text-slate-300">{c.text}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{c.author} · {c.role} · {shortDate(c.at)}</p></div>
              ))}
            </div>
            {perms.can_comment && (
              <div className="mt-2 flex items-center gap-2">
                <input value={comment} onChange={(ev) => setComment(ev.target.value)} placeholder="Add a comment…" data-testid="comment-input" className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                <button disabled={!comment || busy} onClick={doComment} data-testid="comment-btn" className="rounded-md border border-slate-700 p-2 text-slate-300 transition-colors hover:border-sky-500/50 disabled:opacity-40"><MessageSquare className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6" testid="exc-audit">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Audit Trail ({data.audit.length})</p>
          <div className="mt-3 space-y-2">
            {data.audit.length === 0 ? <p className="text-sm text-slate-400">No audit entries yet.</p> : data.audit.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-mono text-xs text-slate-300">{a.action}</span>
                <span className="font-mono text-[10px] text-slate-500">{a.user_name} · {shortDate(a.timestamp)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ k, v, tone = "text-slate-200" }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"><dt className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{k}</dt><dd className={`mt-1.5 font-mono text-sm ${tone}`}>{v ?? "—"}</dd></div>;
}
function Row({ k, v }) {
  return <div className="flex items-center justify-between border-b border-slate-800 pb-2"><dt className="text-slate-500">{k}</dt><dd className="break-all text-slate-300">{v}</dd></div>;
}
