import React from "react";
import { useApi, PageHeader, Card, shortDate } from "@/components/app/shared";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

export default function Exceptions() {
  const { loading, error, data, reload } = useApi("/exceptions");
  const [open, setOpen] = React.useState(null);
  if (loading) return <LoadingState label="Loading exceptions" />;
  if (error) return <ErrorState description="Exceptions could not be loaded." onRetry={reload} />;

  const exceptions = data.exceptions || [];

  return (
    <div>
      <PageHeader eyebrow="Exceptions" title="Control Exceptions"
        subtitle="Failed control tests routed to owners with remediation actions and evidence requirements." />

      {exceptions.length === 0 ? (
        <EmptyState title="No exceptions" description="No control exceptions have been raised in this environment." />
      ) : (
        <Card testid="exceptions-table" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Title</th>
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Detected</th>
                  <th className="px-5 py-3">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {exceptions.map((e) => (
                  <React.Fragment key={e.id}>
                    <tr onClick={() => setOpen(open === e.id ? null : e.id)} data-testid={`exc-row-${e.id}`} className="cursor-pointer transition-colors hover:bg-slate-900/60">
                      <td className="px-5 py-3 font-mono text-xs text-slate-400">{e.exception_code}</td>
                      <td className="px-5 py-3 text-slate-200">{e.title}</td>
                      <td className="px-5 py-3"><StatusBadge value={e.severity} /></td>
                      <td className="px-5 py-3"><StatusBadge value={e.status} /></td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{shortDate(e.detected_at)}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{shortDate(e.due_date)}</td>
                    </tr>
                    {open === e.id && (
                      <tr className="bg-slate-950/40">
                        <td colSpan={6} className="px-5 py-5">
                          <p className="text-sm text-slate-300">{e.description}</p>
                          <div className="mt-3 grid gap-3 md:grid-cols-3 font-mono text-xs">
                            <Detail k="Control" v={e.control_id?.replace("ctl-", "").toUpperCase()} />
                            <Detail k="Transaction" v={e.transaction_id} />
                            <Detail k="Owner Role" v={e.owner_role} />
                            {e.root_cause && <Detail k="Root Cause" v={e.root_cause} />}
                            {e.remediation_summary && <Detail k="Remediation" v={e.remediation_summary} />}
                          </div>
                          {e.remediation_actions?.length > 0 && (
                            <div className="mt-4">
                              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Remediation Actions</p>
                              <div className="mt-2 space-y-2">
                                {e.remediation_actions.map((a) => (
                                  <div key={a.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/50 px-4 py-2.5">
                                    <span className="text-xs text-slate-300">{a.action}</span>
                                    <StatusBadge value={a.status} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Detail({ k, v }) {
  return <div><span className="text-slate-500">{k}: </span><span className="text-slate-300">{v || "—"}</span></div>;
}
