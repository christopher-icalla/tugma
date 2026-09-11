import React from "react";
import { PublicNav, PublicFooter } from "@/components/public/PublicChrome";
import { Section, Eyebrow } from "@/components/public/Primitives";
import { Building, KeyRound, Lock, FileClock, Fingerprint, ScrollText, FlaskConical } from "lucide-react";

const ITEMS = [
  [Building, "Organization-level isolation", "Every organization-owned record carries an organization_id. There is no cross-organization access path in the application."],
  [KeyRound, "Role-based access", "Access is governed by roles: ADMIN, PAYMENT_OPS, COMPLIANCE, RISK, FINANCE, AUDITOR and VIEWER."],
  [Lock, "Authenticated application", "The control center sits behind email/password authentication with server-issued, http-only session cookies."],
  [Fingerprint, "Evidence integrity hashing", "Finalized evidence packages are hashed (SHA-256) so their integrity can be independently verified."],
  [FileClock, "Audit trail", "Audit logs are designed to be append-only from normal users, preserving a record of actions."],
  [FlaskConical, "Synthetic demonstration data", "The demonstration environment uses only synthetic data. No production payment data is present."],
  [ScrollText, "Off-chain sensitive data", "For Stellar proof, only a hash is attested. Sensitive payment and customer data remains off-chain."],
];

export default function SecurityPublic() {
  return (
    <div className="min-h-screen bg-[#090d16]">
      <PublicNav />
      <Section>
        <Eyebrow>Security & Architecture</Eyebrow>
        <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
          Designed for regulatory-grade trust.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300">
          The intended architecture prioritizes isolation, access control, integrity and auditability.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {ITEMS.map(([Icon, t, d]) => (
            <div key={t} className="flex gap-4 rounded-lg border border-slate-800 bg-slate-900/50 p-6">
              <Icon className="h-5 w-5 shrink-0 text-sky-400" />
              <div>
                <h3 className="font-heading text-base font-semibold text-slate-100">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{d}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm leading-relaxed text-slate-400">
          <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500">What we do not claim</p>
          <p className="mt-3">
            TUGMA does not claim to be SOC 2 certified, ISO certified, penetration tested or
            bank-grade certified, and does not claim to be approved or certified by any government
            authority. Any such assurances would be stated only if and when they are actually
            performed and verifiable.
          </p>
        </div>
      </Section>
      <PublicFooter />
    </div>
  );
}
