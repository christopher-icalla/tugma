import React from "react";
import { PublicNav, PublicFooter } from "@/components/public/PublicChrome";
import { Section, Eyebrow } from "@/components/public/Primitives";
import { ExternalLink } from "lucide-react";

const SOURCES = [
  {
    code: "BSP",
    regulator: "Bangko Sentral ng Pilipinas",
    document: "Manual of Regulations for Payment Systems",
    version: "December 2025",
    effective: "2025-12-01",
    section: "Payment Systems · IT Risk · Governance · End-User Protection",
    status: "ACTIVE",
    lastReviewed: "14 days ago",
    mapped: 4,
    url: "https://www.bsp.gov.ph/Regulations/MORPS/MORPS.pdf",
  },
  {
    code: "AMLC",
    regulator: "Anti-Money Laundering Council",
    document: "AML/CTF Regulatory Issuances",
    version: "2025",
    effective: "2025-01-15",
    section: "AML/CTF · Covered Persons · CTR/STR · Targeted Financial Sanctions",
    status: "ACTIVE",
    lastReviewed: "21 days ago",
    mapped: 1,
    url: "https://www.amlc.gov.ph/laws-and-issuances",
  },
];

const LAYERS = [
  ["Official Regulatory Requirement", "The authoritative text as published by the regulator. TUGMA does not alter or reinterpret official source text.", "border-slate-700"],
  ["TUGMA Interpretation", "How TUGMA reads a requirement for the purpose of building a testable control. This is TUGMA's interpretation, not the regulation itself.", "border-sky-500/40"],
  ["TUGMA Operational Control", "The deterministic control and test TUGMA runs against your operational data. A TUGMA control is never presented as literal regulatory text.", "border-emerald-500/40"],
];

export default function RegulatoryIntelligence() {
  return (
    <div className="min-h-screen bg-[#090d16]">
      <PublicNav />
      <Section>
        <Eyebrow>Regulatory Intelligence</Eyebrow>
        <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
          Built around the rules that govern payments.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300">
          TUGMA maps authoritative regulatory requirements to operational controls and continuously
          tests whether those controls are being followed.
        </p>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {SOURCES.map((s) => (
            <div key={s.code} className="rounded-xl border border-slate-800 bg-slate-900/50 p-6" data-testid={`reg-source-${s.code.toLowerCase()}`}>
              <div className="flex items-start justify-between">
                <div>
                  <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 font-mono text-xs font-semibold tracking-widest text-sky-300">{s.code}</span>
                  <h3 className="mt-4 font-heading text-lg font-semibold text-slate-100">{s.document}</h3>
                  <p className="mt-1 text-sm text-slate-400">{s.regulator}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-emerald-300">
                  <span className="text-[8px]">●</span> {s.status}
                </span>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-y-3 font-mono text-xs">
                <Meta k="Version" v={s.version} />
                <Meta k="Effective" v={s.effective} />
                <Meta k="Last Reviewed" v={s.lastReviewed} />
                <Meta k="Mapped Controls" v={String(s.mapped)} />
              </dl>
              <p className="mt-4 border-t border-slate-800 pt-4 text-xs text-slate-400">{s.section}</p>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm text-sky-400 transition-colors hover:text-sky-300">
                Official source <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>

        <div className="mt-16">
          <h2 className="font-heading text-2xl font-semibold text-slate-100">Three distinct layers, never conflated</h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-400">
            TUGMA keeps a clear separation so that a TUGMA-created operational test is never presented
            as though it is literally written in a government regulation.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {LAYERS.map(([t, d, border]) => (
              <div key={t} className={`rounded-lg border ${border} bg-slate-900/50 p-6`}>
                <p className="font-mono text-[11px] uppercase tracking-widest text-slate-500">Layer</p>
                <h3 className="mt-2 font-heading text-base font-semibold text-slate-100">{t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{d}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-xs leading-relaxed text-slate-400">
          TUGMA provides regulatory intelligence and control-mapping software. It does not provide
          legal advice, certify compliance, or represent that an organization is approved or certified
          by any government authority. Regulatory requirements should always be reviewed against the
          applicable official publication.
        </div>
      </Section>
      <PublicFooter />
    </div>
  );
}

function Meta({ k, v }) {
  return (
    <div>
      <dt className="text-slate-500">{k}</dt>
      <dd className="mt-0.5 text-slate-200">{v}</dd>
    </div>
  );
}
