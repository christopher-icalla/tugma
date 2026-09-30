import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Loader2, ExternalLink, RefreshCw, SearchCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/perms";
import { StatusBadge } from "@/components/StatusBadge";
import { shortDate } from "@/components/app/shared";
import { explorerContract, explorerTx, shortKey, signAndSubmit } from "@/lib/stellar";

const errorText = (e) => formatApiErrorDetail(e.response?.data?.detail ?? e.message);

// On-chain anchoring for one evidence package: attest -> countersign -> verify.
export default function AttestationPanel({ pkg, stellarConfig, onChange }) {
  const { user } = useAuth();
  const [busy, setBusy] = React.useState(null);
  const [check, setCheck] = React.useState(null);

  const st = pkg.stellar || {};
  const attested = st.verification_status && st.verification_status !== "NOT_SUBMITTED";
  const finalized = pkg.status === "FINALIZED";
  const stale = attested && st.hash_matches_package === false;
  const explorer = stellarConfig?.explorer_url;
  const wallet = user?.stellar_address;

  const canAttest = finalized && can(user?.role, "package:attest") && (!attested || stale);
  const canCountersign =
    finalized && attested && !stale && st.verification_status === "ATTESTED" &&
    can(user?.role, "package:countersign") && st.attester_user_id !== user?.id;

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(errorText(e)); } finally { setBusy(null); }
  };

  const doSign = (action) => run(action, async () => {
    const { message } = await signAndSubmit(pkg.id, action, wallet, stellarConfig?.network_passphrase);
    toast.success(message);
    await onChange();
  });

  const doVerify = () => run("verify", async () => {
    const { data } = await api.get(`/stellar/verify/${pkg.canonical_hash}`);
    setCheck(data);
  });

  const doSync = () => run("sync", async () => {
    const { data } = await api.post(`/stellar/packages/${pkg.id}/sync`);
    toast.success(data.message);
    await onChange();
  });

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-5" data-testid={`attestation-${pkg.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-sky-400" /><span className="font-mono text-xs uppercase tracking-widest text-slate-300">Stellar Attestation</span></div>
        <StatusBadge value={st.verification_status || "NOT_SUBMITTED"} testid={`attestation-status-${pkg.id}`} />
      </div>

      {!finalized ? (
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          This is the rolling draft. Generate a package for a period to produce a finalized manifest that can be anchored on Stellar.
        </p>
      ) : !attested ? (
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Anchor this package's SHA-256 hash in the TUGMA attestation contract. Only the hash goes on-chain, never the evidence.
          A second authorized signer then countersigns it for segregation of duties.
        </p>
      ) : (
        <dl className="mt-4 space-y-2 font-mono text-[11px]">
          <Item k="Version" v={`v${st.version}`} />
          <Item k="Attested by" v={`${st.attester_name} · ${shortKey(st.attester_address)}`} />
          <Item k="Ledger" v={st.ledger} />
          <Item k="Attest tx" v={<TxLink explorer={explorer} hash={st.transaction_hash} />} />
          <Item k="Countersigned by" v={st.verifier_address ? `${st.verifier_name} · ${shortKey(st.verifier_address)}` : "Awaiting independent signer"} />
          {st.countersign_tx_hash && <Item k="Countersign tx" v={<TxLink explorer={explorer} hash={st.countersign_tx_hash} />} />}
          {st.verified_at && <Item k="Verified" v={shortDate(st.verified_at)} />}
        </dl>
      )}

      {stale && (
        <div className="mt-4 flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <p className="text-xs leading-relaxed text-amber-200/90">
            The package was regenerated and its hash changed since v{st.version} was attested. Attest again to anchor the new version; earlier versions stay on-chain.
          </p>
        </div>
      )}

      {finalized && (canAttest || canCountersign) && !wallet && (
        <p className="mt-4 font-mono text-[11px] text-amber-300/80">
          <Link to="/app/settings" className="underline">Link a Freighter wallet</Link> in Settings to sign.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canAttest && (
          <Action onClick={() => doSign("attest")} busy={busy === "attest"} disabled={!wallet || !!busy} primary testid={`attest-btn-${pkg.id}`}>
            {stale ? "Re-attest new hash" : "Attest on Stellar"}
          </Action>
        )}
        {canCountersign && (
          <Action onClick={() => doSign("countersign")} busy={busy === "countersign"} disabled={!wallet || !!busy} primary testid={`countersign-btn-${pkg.id}`}>
            Countersign
          </Action>
        )}
        {attested && (
          <Action onClick={doVerify} busy={busy === "verify"} disabled={!!busy} icon={SearchCheck} testid={`verify-btn-${pkg.id}`}>Verify on-chain</Action>
        )}
        {finalized && can(user?.role, "package:attest") && (
          <Action onClick={doSync} busy={busy === "sync"} disabled={!!busy} icon={RefreshCw} testid={`sync-btn-${pkg.id}`}>Sync from chain</Action>
        )}
      </div>

      {check && (
        <div className={`mt-4 rounded-md border p-3 ${check.found ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/40 bg-rose-500/10"}`} data-testid={`verify-result-${pkg.id}`}>
          <p className={`font-mono text-[11px] ${check.found ? "text-emerald-300" : "text-rose-300"}`}>
            {check.found
              ? `Found on-chain · v${check.onchain.version} · ledger ${check.onchain.attested_ledger} · ${check.onchain.verifier ? "countersigned" : "not countersigned"}`
              : "This hash is not attested in the contract."}
          </p>
        </div>
      )}

      {stellarConfig && (
        <a href={explorerContract(explorer, stellarConfig.contract_id)} target="_blank" rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1 font-mono text-[10px] text-slate-500 hover:text-slate-300">
          Contract {shortKey(stellarConfig.contract_id)} · {stellarConfig.network} <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {pkg.attestations?.length > 1 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-slate-500">Earlier versions ({pkg.attestations.length - 1})</summary>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-slate-400">
            {pkg.attestations.slice(1).map((a) => (
              <li key={a.id}>v{a.version} · {a.verification_status} · {a.attestation_hash.slice(0, 16)}… · <TxLink explorer={explorer} hash={a.transaction_hash} /></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Item({ k, v }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-800/60 pb-1.5">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right text-slate-200">{v}</dd>
    </div>
  );
}

function TxLink({ explorer, hash }) {
  if (!hash) return <span className="text-slate-500">—</span>;
  return (
    <a href={explorerTx(explorer, hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-400 hover:underline">
      {shortKey(hash)} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function Action({ children, onClick, busy, disabled, primary, icon: Icon, testid }) {
  return (
    <button onClick={onClick} disabled={disabled} data-testid={testid}
      className={primary
        ? "inline-flex items-center gap-2 rounded-md bg-sky-500 px-4 py-2 text-xs font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
        : "inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-slate-500 disabled:opacity-50"}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}
