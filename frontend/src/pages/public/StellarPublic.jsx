import React from "react";
import { PublicNav, PublicFooter } from "@/components/public/PublicChrome";
import { Section, Eyebrow } from "@/components/public/Primitives";
import { ArrowDown, ShieldCheck, Lock, FileCheck, Loader2, SearchCheck } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";

const CHAIN = [
  ["Evidence Package", "A finalized, immutable set of control evidence assembled for a period."],
  ["Canonical Hash", "The package is serialized into a canonical form and hashed with SHA-256."],
  ["Stellar Testnet", "An authorized signer anchors the hash — never the underlying data — in a Soroban contract; a second signer countersigns."],
  ["Verification", "Anyone can re-hash the package and look the fingerprint up in the contract below."],
];

export default function StellarPublic() {
  return (
    <div className="min-h-screen bg-[#090d16]">
      <PublicNav />
      <Section>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-amber-300">Prototype / Testnet</span>
        </div>
        <Eyebrow>Integrity & Attestation</Eyebrow>
        <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
          An integrity layer, not a data store.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300">
          Stellar is used as an integrity and attestation layer. TUGMA publishes only a cryptographic
          fingerprint of a finalized evidence package so its integrity can be independently verified.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-4">
          {CHAIN.map(([t, d], i) => (
            <div key={t} className="relative rounded-lg border border-slate-800 bg-slate-900/50 p-6">
              <p className="font-mono text-xs uppercase tracking-widest text-sky-400">Step {i + 1}</p>
              <h3 className="mt-2 font-heading text-base font-semibold text-slate-100">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
              {i < CHAIN.length - 1 && <ArrowDown className="absolute -bottom-3 left-6 h-5 w-5 rotate-[-90deg] text-sky-500 md:rotate-0 md:-right-5 md:left-auto md:top-1/2 md:-translate-y-1/2 md:rotate-[-90deg]" />}
            </div>
          ))}
        </div>

        <VerifyHash />

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          <Note icon={Lock} title="Data stays off-chain" text="Sensitive payment and customer information is never written to any blockchain. Only a hash is attested." />
          <Note icon={FileCheck} title="Tamper-evident" text="If a single byte of the evidence package changes, its hash changes and verification fails." />
          <Note icon={ShieldCheck} title="Testnet only" text="This is a prototype on the Stellar test network. It does not imply mainnet production readiness." />
        </div>
      </Section>
      <PublicFooter />
    </div>
  );
}

function Note({ icon: Icon, title, text }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-6">
      <Icon className="h-5 w-5 text-sky-400" />
      <h3 className="mt-3 font-heading text-base font-semibold text-slate-100">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
    </div>
  );
}

const HEX64 = /^[0-9a-f]{64}$/i;

// Public lookup: checks a package hash against the attestation contract.
function VerifyHash() {
  const [hash, setHash] = React.useState("");
  const [state, setState] = React.useState({ loading: false, result: null, error: null });
  const valid = HEX64.test(hash.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setState({ loading: true, result: null, error: null });
    try {
      const { data } = await api.get(`/stellar/verify/${hash.trim().toLowerCase()}`);
      setState({ loading: false, result: data, error: null });
    } catch (err) {
      setState({ loading: false, result: null, error: formatApiErrorDetail(err.response?.data?.detail ?? err.message) });
    }
  };

  const r = state.result;
  return (
    <div className="mt-14 rounded-xl border border-slate-800 bg-slate-900/50 p-6" data-testid="public-verify">
      <p className="font-mono text-[10px] uppercase tracking-widest text-sky-400">Verify an evidence package</p>
      <h2 className="mt-2 font-heading text-xl font-semibold text-slate-100">Check a SHA-256 fingerprint on Stellar</h2>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="64-character package hash" spellCheck={false}
          data-testid="verify-hash-input"
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-sky-500" />
        <button type="submit" disabled={!valid || state.loading} data-testid="verify-hash-btn"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-500 px-5 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-50">
          {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />} Verify
        </button>
      </form>
      {state.error && <p className="mt-3 font-mono text-xs text-rose-300">{state.error}</p>}
      {r && (r.found ? (
        <dl className="mt-4 grid gap-2 font-mono text-[11px] sm:grid-cols-2" data-testid="verify-hash-found">
          <Fact k="Result" v={<span className="text-emerald-300">Attested on {r.network}</span>} />
          <Fact k="Package" v={r.package?.name ?? r.onchain.package_id} />
          <Fact k="Organization" v={r.onchain.org} />
          <Fact k="Period" v={`${r.onchain.period_start} → ${r.onchain.period_end}`} />
          <Fact k="Version" v={`v${r.onchain.version} · ledger ${r.onchain.attested_ledger}`} />
          <Fact k="Attested" v={new Date(r.onchain.attested_at).toUTCString()} />
          <Fact k="Attester" v={r.onchain.attester} />
          <Fact k="Countersigned by" v={r.onchain.verifier ?? "Not yet countersigned"} />
        </dl>
      ) : (
        <p className="mt-4 font-mono text-xs text-rose-300" data-testid="verify-hash-missing">This hash is not attested in contract {r.contract_id}.</p>
      ))}
    </div>
  );
}

function Fact({ k, v }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
      <dt className="text-slate-500">{k}</dt>
      <dd className="mt-0.5 break-all text-slate-200">{v}</dd>
    </div>
  );
}
