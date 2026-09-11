import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, User, Cpu, Landmark, Store } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, Card, money, shortDate } from "@/components/app/shared";
import { LoadingState, ErrorState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

export default function TransactionDetail() {
  const { txId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [state, setState] = React.useState({ loading: true, error: false, code: null });

  const load = React.useCallback(async () => {
    setState({ loading: true, error: false });
    try {
      const { data } = await api.get(`/transactions/${txId}`);
      setData(data);
      setState({ loading: false, error: false });
    } catch (e) {
      setState({ loading: false, error: true, code: e.response?.status });
    }
  }, [txId]);

  React.useEffect(() => { load(); }, [load]);

  if (state.loading) return <LoadingState label="Loading transaction" />;
  if (state.error) return <ErrorState title={state.code === 404 ? "Transaction not found" : "Unable to load transaction"} description={state.code === 404 ? `No transaction ${txId} exists in this environment.` : "Please retry."} onRetry={load} />;

  const t = data.transaction;
  const flow = [
    ["Customer Payment", User, t.transaction_amount, "Amount charged to the customer"],
    ["Processor", Cpu, t.processor_amount, "Amount captured by the processor"],
    ["Settlement", Landmark, t.actual_settlement, `Expected ${money(t.expected_settlement)}`],
    ["Merchant Payout", Store, t.actual_payout, `Expected ${money(t.expected_payout)}`],
  ];

  return (
    <div>
      <button onClick={() => navigate("/app/transactions")} className="mb-4 inline-flex items-center gap-1.5 font-mono text-xs text-slate-400 transition-colors hover:text-sky-300"><ArrowLeft className="h-3.5 w-3.5" /> Back to transactions</button>
      <PageHeader eyebrow="Transaction Detail" title={t.transaction_id}
        subtitle={`Merchant ${t.merchant_id} · ${shortDate(t.transaction_timestamp)}`}
        right={<StatusBadge value={t.test_status || "PASS"} testid="txn-detail-status" />} />

      <Card className="mb-6 p-6" testid="txn-flow">
        <p className="mb-5 font-mono text-[10px] uppercase tracking-widest text-slate-500">Money Flow</p>
        <div className="grid gap-3 md:grid-cols-4">
          {flow.map(([label, Icon, amount, sub], i) => (
            <div key={label} className="relative rounded-lg border border-slate-800 bg-slate-950/40 p-4">
              <Icon className="h-4 w-4 text-sky-400" />
              <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
              <p className="mt-1 font-heading text-lg font-bold text-slate-100">{amount == null ? "—" : money(amount)}</p>
              <p className="mt-1 text-[11px] text-slate-500">{sub}</p>
              {i < flow.length - 1 && <ArrowRight className="absolute -right-3.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-sky-600 md:block" />}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6" testid="txn-control-results">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Control Results</p>
          <div className="mt-4 space-y-2">
            {data.control_results.map((c) => (
              <Link to={`/app/controls`} key={c.control_code} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/40 px-4 py-3 transition-colors hover:border-slate-700">
                <span className="font-mono text-xs text-slate-300">{c.control_code}</span>
                <StatusBadge value={c.result} />
              </Link>
            ))}
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-y-3 border-t border-slate-800 pt-5 font-mono text-xs">
            <Meta k="Approval" v={t.approval_status} />
            <Meta k="Initiated by" v={t.initiated_by} />
            <Meta k="Approved by" v={t.approved_by} />
            <Meta k="Evidence" v={t.has_evidence ? "Present" : "Missing"} />
            <Meta k="Idempotency" v={t.idempotency_key} />
            {t.duplicate_of && <Meta k="Duplicate of" v={t.duplicate_of} />}
          </dl>
        </Card>

        <Card className="p-6" testid="txn-exceptions">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Related Exceptions ({data.exceptions.length})</p>
          {data.exceptions.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No exceptions — this transaction passed all applicable controls.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {data.exceptions.map((e) => (
                <Link to={`/app/exceptions/${e.exception_code}`} key={e.id} className="block rounded-md border border-slate-800 bg-slate-950/40 p-4 transition-colors hover:border-sky-500/40">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-400">{e.exception_code}</span>
                    <StatusBadge value={e.severity} />
                  </div>
                  <p className="mt-1.5 text-sm text-slate-200">{e.title}</p>
                  <div className="mt-2"><StatusBadge value={e.status} /></div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Meta({ k, v }) {
  return <div><dt className="text-slate-500">{k}</dt><dd className="mt-0.5 break-all text-slate-200">{v ?? "—"}</dd></div>;
}
