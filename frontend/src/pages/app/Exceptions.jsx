import React from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, Card, shortDate, Pagination, Select } from "@/components/app/shared";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

const CONTROL_OPTS = [{ value: "CTRL-005", label: "CTRL-005 Settlement" }, { value: "CTRL-002", label: "CTRL-002 Authorization" }, { value: "CTRL-004", label: "CTRL-004 Evidence" }];
const SEV_OPTS = ["HIGH", "MEDIUM", "LOW"];
const STATUS_OPTS = ["OPEN", "IN_REVIEW", "REMEDIATION", "RESOLVED", "VERIFIED"];

export default function Exceptions() {
  const navigate = useNavigate();
  const [params, setParams] = React.useState({ page: 1, search: "", control: "", severity: "", status: "" });
  const [searchInput, setSearchInput] = React.useState("");
  const [data, setData] = React.useState(null);
  const [state, setState] = React.useState({ loading: true, error: false });

  const load = React.useCallback(async () => {
    setState({ loading: true, error: false });
    try {
      const { data } = await api.get("/exceptions", { params: { ...params, page_size: 25 } });
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
      <PageHeader eyebrow="Exceptions" title="Control Exceptions"
        subtitle="Every exception is created automatically by a deterministic control failure and links back to its transaction and evidence." />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={submitSearch} className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search code, title or TX id…" data-testid="exc-search"
              className="w-full rounded-md border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none transition-colors focus:border-sky-500" />
          </form>
          <Select value={params.control} onChange={(v) => update({ control: v })} options={CONTROL_OPTS} placeholder="All controls" testid="exc-filter-control" />
          <Select value={params.severity} onChange={(v) => update({ severity: v })} options={SEV_OPTS} placeholder="All severities" testid="exc-filter-severity" />
          <Select value={params.status} onChange={(v) => update({ status: v })} options={STATUS_OPTS} placeholder="All statuses" testid="exc-filter-status" />
        </div>
      </Card>

      {state.loading ? <LoadingState label="Loading exceptions" /> : state.error ? <ErrorState description="Exceptions could not be loaded." onRetry={load} /> : (
        <Card testid="exceptions-table" className="overflow-hidden">
          {data.exceptions.length === 0 ? (
            <div className="p-5"><EmptyState title="No matching exceptions" description="Adjust your filters, or all exceptions in this view are resolved." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Code</th><th className="px-5 py-3">Title</th><th className="px-5 py-3">Control</th>
                    <th className="px-5 py-3">Severity</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Detected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.exceptions.map((e) => (
                    <tr key={e.id} data-testid={`exc-row-${e.exception_code}`} onClick={() => navigate(`/app/exceptions/${e.exception_code}`)} className="cursor-pointer transition-colors hover:bg-slate-900/60">
                      <td className="px-5 py-3 font-mono text-xs text-sky-300">{e.exception_code}</td>
                      <td className="px-5 py-3 text-slate-200">{e.title}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-400">{e.control_code}</td>
                      <td className="px-5 py-3"><StatusBadge value={e.severity} /></td>
                      <td className="px-5 py-3"><StatusBadge value={e.status} /></td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{shortDate(e.detected_at)}</td>
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
