import React from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, PenLine, Wallet } from "lucide-react";
import { PublicNav, PublicFooter } from "@/components/public/PublicChrome";
import { Section, Eyebrow } from "@/components/public/Primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { api, formatApiErrorDetail } from "@/lib/api";
import { connectReviewerWallet, signWithReviewerWallet } from "@/lib/walletsKit";
import { explorerTx, shortKey } from "@/lib/stellar";

const TESTNET = "Test SDF Network ; September 2015";
const errorText = (e) => formatApiErrorDetail(e.response?.data?.detail ?? e.message);
const STATUS_LABEL = {
  AWAITING_REVIEWER: "Awaiting reviewer signature",
  SUBMITTING: "Submitting",
  CO_SIGNED: "Co-signed",
  STALE: "Expired, needs rebuild",
  SUPERSEDED: "Replaced by a newer request",
};

/**
 * The independent reviewer's signing step for a two-party attestation. No TUGMA
 * login is needed: the reviewer connects their own wallet through Stellar
 * Wallets Kit, checks what is being signed, and signs it there. Only the signed
 * transaction comes back to TUGMA; the reviewer's key never does.
 */
export default function ReviewSign() {
  const { id } = useParams();
  const [req, setReq] = React.useState(null);
  const [loadError, setLoadError] = React.useState(null);
  const [address, setAddress] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [done, setDone] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      const { data } = await api.get(`/stellar/cosign/${encodeURIComponent(id)}`);
      setReq(data.request);
    } catch (e) {
      setLoadError(e.response?.status === 404 ? "This signing request does not exist." : errorText(e));
    }
  }, [id]);
  React.useEffect(() => { load(); }, [load]);

  const run = async (key, fn) => {
    setBusy(key);
    setError(null);
    try { await fn(); } catch (e) { setError(errorText(e)); } finally { setBusy(null); }
  };

  const connect = () => run("connect", async () => setAddress(await connectReviewerWallet()));

  const sign = () => run("sign", async () => {
    if (req.network_passphrase !== TESTNET) throw new Error("Co-signing is available on Stellar Testnet only.");
    const signed = await signWithReviewerWallet(req.xdr, { address, networkPassphrase: req.network_passphrase });
    const { data } = await api.post(`/stellar/cosign/${encodeURIComponent(id)}/submit`, { signed_xdr: signed });
    setDone(data);
    setReq(data.request);
  });

  const wrongWallet = address && req && address !== req.reviewer_signer;
  const canSign = req?.status === "AWAITING_REVIEWER" && req.xdr;

  return (
    <div className="min-h-screen bg-[#090d16]">
      <PublicNav />
      <Section>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-amber-300">Stellar Testnet</span>
        </div>
        <Eyebrow>Two-party attestation · reviewer signature</Eyebrow>
        <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">Review and co-sign an evidence package</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300">
          TUGMA has signed the attestation below with its key. The attestation account needs your key too, so nothing is anchored on
          Stellar until you sign. Your wallet signs on your device; TUGMA only receives the signed transaction, never your key.
        </p>

        {loadError && <p className="mt-8 rounded-md border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200" data-testid="review-error">{loadError}</p>}
        {!req && !loadError && <p className="mt-8 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading the request…</p>}

        {req && (
          <div className="mt-8 max-w-3xl rounded-lg border border-slate-800 bg-slate-950/40 p-6" data-testid="review-request">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-xs uppercase tracking-widest text-slate-300">What you are signing</p>
              <StatusBadge value={STATUS_LABEL[req.status] || req.status} testid="review-status" />
            </div>
            <dl className="mt-4 space-y-2 font-mono text-[11px]">
              <Row k="Action" v={`attest(…) on contract ${req.contract_id}`} />
              <Row k="Package" v={`${req.package.id}${req.package.name ? ` · ${req.package.name}` : ""}`} />
              <Row k="Period" v={`${req.package.period_start} to ${req.package.period_end}`} />
              <Row k="Version" v={`v${req.package.expected_version} (expected)`} />
              <Row k="Canonical SHA-256" v={req.package.canonical_hash} />
              <Row k="Attestation account" v={req.attestation_account} />
              <Row k="TUGMA signer" v={`${req.tugma_signer} · signed`} />
              <Row k="Reviewer signer (you)" v={req.reviewer_signer} />
              <Row k="Network" v={`${req.network} · ${req.network_passphrase}`} />
              <Row k="Transaction hash" v={req.tx_hash} />
              <Row k="Sign before" v={new Date(req.expires_at).toLocaleString()} />
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-slate-400">
              Check that the hash matches the package you reviewed (the verifier recomputes it from the package file). Your wallet will
              show the same transaction hash and contract call.
            </p>

            {req.status === "STALE" && (
              <Notice tone="amber">{req.status_detail || "This transaction can no longer be submitted."} Ask TUGMA to rebuild it, then open the new link.</Notice>
            )}
            {req.status === "SUPERSEDED" && <Notice tone="amber">This request was replaced by a newer one. Use the latest signing link from TUGMA.</Notice>}

            {canSign && !done && (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button onClick={connect} disabled={!!busy} data-testid="review-connect"
                  className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:border-slate-500 disabled:opacity-50">
                  {busy === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                  {address ? `Wallet ${shortKey(address)}` : "Connect wallet"}
                </button>
                <button onClick={sign} disabled={!address || wrongWallet || !!busy} data-testid="review-sign"
                  className="inline-flex items-center gap-2 rounded-md bg-sky-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50">
                  {busy === "sign" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                  Sign in wallet and submit
                </button>
              </div>
            )}
            {wrongWallet && canSign && (
              <Notice tone="amber">The connected wallet is {shortKey(address)}, but this attestation needs the reviewer key {shortKey(req.reviewer_signer)}. Switch accounts in your wallet and connect again.</Notice>
            )}
            {error && <Notice tone="rose">{error}</Notice>}

            {(done || req.status === "CO_SIGNED") && (
              <div className="mt-6 flex gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4" data-testid="review-done">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <div className="text-sm text-emerald-100">
                  <p>{done?.message || `Co-signed and attested on-chain${req.version ? ` as version ${req.version}` : ""}.`}</p>
                  {req.submitted_tx_hash && (
                    <a href={explorerTx(req.explorer_url, req.submitted_tx_hash)} target="_blank" rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-sky-300 hover:underline">
                      tx {shortKey(req.submitted_tx_hash)}{req.ledger ? ` · ledger ${req.ledger}` : ""} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>
      <PublicFooter />
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-800/60 pb-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <dt className="shrink-0 text-slate-500">{k}</dt>
      <dd className="break-all text-slate-200 sm:text-right">{v}</dd>
    </div>
  );
}

function Notice({ tone, children }) {
  const cls = tone === "rose" ? "border-rose-500/40 bg-rose-500/10 text-rose-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return (
    <div className={`mt-4 flex gap-2 rounded-md border p-3 text-xs leading-relaxed ${cls}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
