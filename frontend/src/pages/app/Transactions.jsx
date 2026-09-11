import React from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, Card, money, shortDate, Pagination, Select } from "@/components/app/shared";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

const STATUS_OPTS = ["SETTLED", "PENDING"];
const RISK_OPTS = ["NORMAL", "MEDIUM", "HIGH"];
const CONTROL_OPTS = [{ value: "CTRL-005", label: "CTRL-005 Settlement" }, { value: "CTRL-002", label: "CTRL-002 Authorization" }, { value: "CTRL-004", label: "CTRL-004 Evidence" }];
const RESULT_OPTS = ["PASS", "FAIL", "WARNING", "NOT_TESTABLE"];

export default function Transactions() {
  const navigate = useNavigate();
  const [params, setParams] = React.useState({ page: 1, search: "", payment_status: "", risk_status: "", control: "", test_status: "", sort: "transaction_timestamp", direction: "desc" });
  const [searchInput, setSearchInput] = React.useState("");
  const [data, setData] = React.useState(null);
  const [state, setState] = React.useState({ loading: true, error: false });

  const load = React.useCallback(async () => {
    setState({ loading: true, error: false });
    try {
      const { data } = await api.get("/transactions", { params: { ...params, page_size: 25 } });
      setData(data);
      setState({ loading: false, error: false });
    } catch {
      setState({ loading: false, error: true });
    }
  }, [params]);

  React.useEffect(() => { load(); }, [load]);

  const update = (patch) => setParams((p) => ({ ...p, ...patch, page: patch.page ?? 1 }));
  const submitSearch = (e) => { e.preventDefault(); update({ search: searchInput }); };

  return (
    <div>
      <PageHeader eyebrow="Payment Activity" title="Transactions"
        subtitle="10,000 synthetic settlement transactions, tested by the control engine. Filter by control result to inspect detected defects."
        right={<button data-testid="find-hero-txn" onClick={() => navigate("/app/transactions/TX-847291")} className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-sky-300 transition-colors hover:bg-sky-500/20">Open demo TX-847291</button>} />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={submitSearch} className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search TX id or merchant…" data-testid="txn-search"
              className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500" />
          </form>
          <Select value={params.control} onChange={(v) => update({ control: v })} options={CONTROL_OPTS} placeholder="All controls" testid="txn-filter-control" />
          <Select value={params.test_status} onChange={(v) => update({ test_status: v })} options={RESULT_OPTS} placeholder="All results" testid="txn-filter-result" />
          <Select value={params.payment_status} onChange={(v) => update({ payment_status: v })} options={STATUS_OPTS} placeholder="All statuses" testid="txn-filter-status" />
          <Select value={params.risk_status} onChange={(v) => update({ risk_status: v })} options={RISK_OPTS} placeholder="All risk" testid="txn-filter-risk" />
          <Select value={`${params.sort}:${params.direction}`} onChange={(v) => { const [s, d] = v.split(":"); update({ sort: s, direction: d }); }}
            options={[{ value: "transaction_timestamp:desc", label: "Newest" }, { value: "transaction_timestamp:asc", label: "Oldest" }, { value: "transaction_amount:desc", label: "Amount high-low" }, { value: "transaction_amount:asc", label: "Amount low-high" }]}
            placeholder="Sort" testid="txn-sort" />
        </div>
      </Card>

      {state.loading ? <LoadingState label="Loading transactions" /> : state.error ? <ErrorState description="Transactions could not be loaded." onRetry={load} /> : (
        <Card testid="transactions-table" className="overflow-hidden">
          {data.transactions.length === 0 ? (
            <div className="p-5"><EmptyState title="No matching transactions" description="Adjust your search or filters to see results." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Transaction</th><th className="px-5 py-3">Merchant</th>
                    <th className="px-5 py-3 text-right">Processor</th><th className="px-5 py-3 text-right">Settlement</th>
                    <th className="px-5 py-3">Result</th><th className="px-5 py-3">Risk</th><th className="px-5 py-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.transactions.map((t) => (
                    <tr key={t.id} data-testid={`txn-row-${t.transaction_id}`} onClick={() => navigate(`/app/transactions/${t.transaction_id}`)} className="cursor-pointer transition-colors hover:bg-slate-900/60">
                      <td className="px-5 py-3 font-mono text-xs text-sky-300">{t.transaction_id}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-400">{t.merchant_id}</td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-slate-300">{money(t.processor_amount)}</td>
                      <td className={`px-5 py-3 text-right font-mono text-xs ${t.failed_controls?.includes("CTRL-005") ? "text-rose-300" : "text-slate-300"}`}>{t.actual_settlement == null ? "—" : money(t.actual_settlement)}</td>
                      <td className="px-5 py-3"><StatusBadge value={t.test_status || "PASS"} /></td>
                      <td className="px-5 py-3"><StatusBadge value={t.risk_status} /></td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{shortDate(t.transaction_timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => update({ page: p })} />
        </Card>
      )}
    </div>
  );
}
