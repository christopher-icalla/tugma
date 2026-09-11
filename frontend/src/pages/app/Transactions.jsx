import React from "react";
import { useApi, PageHeader, Card, money, shortDate } from "@/components/app/shared";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";

export default function Transactions() {
  const { loading, error, data, reload } = useApi("/transactions");
  if (loading) return <LoadingState label="Loading transactions" />;
  if (error) return <ErrorState description="Transactions could not be loaded." onRetry={reload} />;

  const txns = data.transactions || [];

  return (
    <div>
      <PageHeader eyebrow="Payment Activity" title="Transactions"
        subtitle="Representative synthetic settlement activity. The full 10,000-transaction dataset arrives with the control engine."
        right={<span className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-[11px] text-slate-400">{txns.length} shown</span>} />

      {txns.length === 0 ? (
        <EmptyState title="No transactions" description="No payment transactions are available in this environment yet." />
      ) : (
        <Card testid="transactions-table" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Transaction</th>
                  <th className="px-5 py-3">Merchant</th>
                  <th className="px-5 py-3 text-right">Processor</th>
                  <th className="px-5 py-3 text-right">Settlement</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Risk</th>
                  <th className="px-5 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {txns.map((t) => {
                  const mismatch = Math.abs((t.processor_amount || 0) - (t.actual_settlement || 0)) > 0.01;
                  return (
                    <tr key={t.id} data-testid={`txn-row-${t.id}`} className="transition-colors hover:bg-slate-900/60">
                      <td className="px-5 py-3 font-mono text-xs text-slate-300">{t.transaction_id}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-400">{t.merchant_id}</td>
                      <td className="px-5 py-3 text-right font-mono text-xs text-slate-300">{money(t.processor_amount)}</td>
                      <td className={`px-5 py-3 text-right font-mono text-xs ${mismatch ? "text-rose-300" : "text-slate-300"}`}>{money(t.actual_settlement)}</td>
                      <td className="px-5 py-3"><StatusBadge value={t.payment_status} /></td>
                      <td className="px-5 py-3"><StatusBadge value={t.risk_status} /></td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{shortDate(t.transaction_timestamp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
