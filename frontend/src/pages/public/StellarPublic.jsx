import React from "react";
import { PublicNav, PublicFooter } from "@/components/public/PublicChrome";
import { Section, Eyebrow } from "@/components/public/Primitives";
import { ArrowDown, ShieldCheck, Lock, FileCheck } from "lucide-react";

const CHAIN = [
  ["Evidence Package", "A finalized, immutable set of control evidence assembled for a period."],
  ["Canonical Hash", "The package is serialized into a canonical form and hashed with SHA-256."],
  ["Stellar Testnet", "The hash — never the underlying data — is attested to the Stellar test network."],
  ["Verification", "Anyone can re-hash the package and compare it against the attested fingerprint."],
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
