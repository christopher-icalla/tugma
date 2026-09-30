import React from "react";
import { Wallet, Loader2, ExternalLink, Unlink } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/app/shared";
import { StatusBadge } from "@/components/StatusBadge";
import { FREIGHTER_URL, linkWallet, shortKey } from "@/lib/stellar";

const errorText = (e) => formatApiErrorDetail(e.response?.data?.detail ?? e.message);

// Links the user's Freighter account to their TUGMA login so they can sign
// evidence-package attestations on Stellar.
export default function StellarWallet() {
  const { refresh } = useAuth();
  const [wallet, setWallet] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const { data } = await api.get("/stellar/wallet");
      setWallet(data);
    } catch (e) {
      setWallet({ address: null, is_signer: false, error: errorText(e) });
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setBusy(true);
    try {
      setWallet(await linkWallet());
      await refresh?.();
      toast.success("Stellar wallet linked");
    } catch (e) {
      toast.error(errorText(e));
    } finally { setBusy(false); }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      const { data } = await api.delete("/stellar/wallet");
      setWallet(data);
      await refresh?.();
      toast.success("Wallet unlinked");
    } catch (e) {
      toast.error(errorText(e));
    } finally { setBusy(false); }
  };

  return (
    <Card className="mt-6 p-6" testid="stellar-wallet">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Stellar Wallet</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
            Link your <a href={FREIGHTER_URL} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Freighter</a> account
            to sign evidence-package attestations. TUGMA never sees your secret key: you sign a one-time message to prove
            ownership, and every transaction is approved in Freighter.
          </p>
        </div>
        <Wallet className="h-5 w-5 text-sky-400" />
      </div>

      {wallet === null ? (
        <p className="mt-4 font-mono text-xs text-slate-500">Loading wallet status…</p>
      ) : wallet.address ? (
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Linked account</p>
            <p className="mt-1 font-mono text-xs text-slate-200" title={wallet.address} data-testid="wallet-address">{shortKey(wallet.address)}</p>
          </div>
          <div className="flex items-center gap-2" data-testid="wallet-signer-status">
            <StatusBadge value={wallet.is_signer ? "active" : "pending"} />
            <span className="font-mono text-xs text-slate-300">
              {wallet.is_signer ? "Authorized signer on-chain" : "Not yet an on-chain signer"}
            </span>
          </div>
          <button onClick={unlink} disabled={busy} data-testid="wallet-unlink-btn"
            className="ml-auto inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-50">
            <Unlink className="h-3.5 w-3.5" /> Unlink
          </button>
          {!wallet.is_signer && (
            <p className="w-full font-mono text-[11px] leading-relaxed text-amber-300/80">
              The contract admin must authorize this account for {wallet.organization_id} before it can attest or countersign.
              Admins see the ready-to-run command under Settings → Stellar Signers.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={connect} disabled={busy} data-testid="wallet-connect-btn"
            className="inline-flex items-center gap-2 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Connect Freighter
          </button>
          <a href={FREIGHTER_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 hover:text-slate-300">
            Get Freighter <ExternalLink className="h-3 w-3" />
          </a>
          {wallet.error && <p className="w-full font-mono text-[11px] text-rose-300/80">{wallet.error}</p>}
        </div>
      )}
    </Card>
  );
}
