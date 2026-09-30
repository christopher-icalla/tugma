import React from "react";
import { Copy, KeyRound, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Card, shortDate } from "@/components/app/shared";
import { StatusBadge } from "@/components/StatusBadge";
import { shortKey } from "@/lib/stellar";

// Admin view: which linked wallets the contract has authorized, with the exact
// add_signer command for the ones it hasn't. The contract admin key never
// touches TUGMA, so the admin runs the command with the Stellar CLI.
export default function StellarSigners() {
  const [state, setState] = React.useState({ loading: true, data: null, error: null });

  const load = React.useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const { data } = await api.get("/stellar/signers");
      setState({ loading: false, data, error: null });
    } catch (e) {
      setState({ loading: false, data: null, error: formatApiErrorDetail(e.response?.data?.detail ?? e.message) });
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Command copied");
    } catch {
      toast.error("Copy failed. Select the command and copy it manually.");
    }
  };

  const { loading, data, error } = state;

  return (
    <Card className="mt-6 p-6" testid="stellar-signers">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Stellar Signers · Admin</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Linked wallets can attest or countersign only after the contract admin authorizes them for this organization.
            Run the command below on the machine that holds the admin key (<span className="font-mono text-slate-300">tugma-admin</span>), then refresh.
          </p>
        </div>
        <button onClick={load} disabled={loading} data-testid="signers-refresh-btn"
          className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-slate-500 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <p className="mt-4 font-mono text-xs text-rose-300">{error}</p>}

      {data && (
        data.wallets.length === 0 ? (
          <p className="mt-5 font-mono text-xs text-slate-500">No wallets linked yet. Users link Freighter under Settings → Stellar Wallet.</p>
        ) : (
          <>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Wallet</th>
                    <th className="py-2 pr-4">Linked</th>
                    <th className="py-2 pr-4">On-chain</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.wallets.map((w) => (
                    <tr key={w.user_id} data-testid={`signer-row-${w.role.toLowerCase()}`}>
                      <td className="py-2.5 pr-4 text-slate-200">{w.name}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-400">{w.role}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-300" title={w.address}>{shortKey(w.address)}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">{shortDate(w.linked_at)}</td>
                      <td className="py-2.5 pr-4">
                        <span className="inline-flex items-center gap-2">
                          <StatusBadge value={w.is_signer ? "active" : "pending"} />
                          <span className="font-mono text-xs text-slate-300">{w.is_signer ? "Authorized" : "Pending"}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.script_command ? (
              <div className="mt-5 rounded-md border border-amber-500/30 bg-amber-500/5 p-4" data-testid="signers-command">
                <div className="flex items-center justify-between gap-3">
                  <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-amber-300">
                    <KeyRound className="h-3.5 w-3.5" /> {data.pending_count} wallet{data.pending_count === 1 ? "" : "s"} awaiting authorization
                  </p>
                  <button onClick={() => copy(data.script_command)} data-testid="signers-copy-btn"
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-[11px] text-slate-300 hover:border-slate-500">
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                </div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-950/70 p-3 font-mono text-[11px] leading-relaxed text-slate-200">{data.script_command}</pre>
                <p className="mt-2 font-mono text-[10px] text-slate-500">
                  Run from the repository root. Contract {shortKey(data.contract_id)} · {data.network} · org {data.organization_id}
                </p>
              </div>
            ) : (
              <p className="mt-5 font-mono text-xs text-emerald-300/90">All linked wallets are authorized on-chain.</p>
            )}
          </>
        )
      )}
    </Card>
  );
}
