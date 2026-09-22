import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowDown, Building2, Cpu, FileSpreadsheet, Database, ShieldCheck, Mail, Store, Cloud, ExternalLink } from "lucide-react";
import { PublicNav, PublicFooter } from "@/components/public/PublicChrome";
import { FlowDiagram } from "@/components/public/FlowDiagram";
import { Section, Eyebrow, CodePanel, highlight } from "@/components/public/Primitives";

const CONTROL_CODE = [
  'control("settlement_reconciliation")',
  "",
  "expected = processor.amount",
  "actual   = settlement.amount",
  "",
  "if abs(expected - actual) > tolerance:",
  "    create_exception(",
  '        severity="HIGH",',
  "        evidence_required=True",
  "    )",
];

const EVIDENCE_CODE = [
  "evidence.verify([",
  '    "processor_record",',
  '    "settlement_record",',
  '    "payout_record",',
  '    "resolution"',
  "])",
];

const SYSTEMS = [
  ["Bank", Building2],
  ["Payment Processor", Cpu],
  ["ERP", Database],
  ["Spreadsheet", FileSpreadsheet],
  ["AML System", ShieldCheck],
  ["Email", Mail],
  ["Merchant Portal", Store],
  ["Cloud Storage", Cloud],
];

const HIW = [
  ["01", "MAP", "Regulation → Requirement"],
  ["02", "DEFINE", "Requirement → Control"],
  ["03", "TEST", "Control → Operational Data"],
  ["04", "RESOLVE", "Exception → Remediation"],
  ["05", "PROVE", "Evidence → Verifiable Evidence Package"],
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#090d16]">
      <PublicNav />

      {/* HERO */}
      <Section className="!py-20 sm:!py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="tg-fade-up">
            <Eyebrow>Continuous Payment Control Intelligence</Eyebrow>

            <h1 className="mt-5 font-heading text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl lg:text-6xl">
              Compliance You Can Prove.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              TUGMA continuously tests payment operations against regulatory and organizational
              controls, connecting transactions, exceptions, remediation, and evidence into one
              verifiable compliance record.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                to="/how-it-works"
                data-testid="hero-primary-cta"
                className="inline-flex items-center gap-2 rounded-md bg-sky-500 px-5 py-3 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400"
              >
                See How TUGMA Works
                <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                to="/regulatory-intelligence"
                data-testid="hero-secondary-cta"
                className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-5 py-3 text-sm text-slate-200 transition-colors hover:border-sky-500/50 hover:text-sky-300"
              >
                Explore Regulatory Intelligence
              </Link>
            </div>

            <p className="mt-8 font-mono text-[11px] uppercase tracking-widest text-slate-500">
              For Philippine regulated payment operators
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 sm:p-8">
            <p className="mb-5 font-mono text-[11px] uppercase tracking-widest text-slate-500">
              Conceptual control flow
            </p>

            <FlowDiagram testid="hero-flow-diagram" />
          </div>
        </div>
      </Section>

      {/* PROBLEM */}
      <div className="border-y border-slate-800/60 bg-[#070a11]">
        <Section>
          <div className="max-w-3xl">
            <Eyebrow>The Problem</Eyebrow>

            <h2 className="mt-4 font-heading text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl lg:text-4xl">
              Payment operations are fragmented. Compliance evidence shouldn't be.
            </h2>

            <p className="mt-5 text-base leading-relaxed text-slate-300">
              Payment operators manage money across multiple systems while compliance evidence lives
              across even more. TUGMA connects operational activity to the controls that govern it.
            </p>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
              {SYSTEMS.map(([label, Icon]) => (
                <div
                  key={label}
                  className="flex items-center gap-2.5 rounded-md border border-slate-800 bg-slate-900/50 px-3 py-3"
                >
                  <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="text-xs text-slate-300">{label}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center">
              <ArrowRight className="hidden h-6 w-6 text-sky-500 lg:block" />
              <ArrowDown className="h-6 w-6 text-sky-500 lg:hidden" />
            </div>

            <div className="rounded-xl border border-sky-500/40 bg-sky-500/5 p-8 text-center">
              <p className="font-heading text-2xl font-bold text-slate-50">TUGMA</p>
              <p className="mt-2 font-mono text-xs uppercase tracking-widest text-sky-300">
                Continuous Control Layer
              </p>
            </div>
          </div>
        </Section>
      </div>

      {/* CODE SHOWCASE */}
      <Section>
        <div className="max-w-3xl">
          <Eyebrow>The Control Engine</Eyebrow>

          <h2 className="mt-4 font-heading text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl lg:text-4xl">
            Turn requirements into executable controls.
          </h2>
        </div>

        {/* CONTROL ENGINE + CTRL-005 */}
        <div className="mt-12 grid gap-6 lg:grid-cols-2 lg:items-center">
          <CodePanel
            testid="code-panel-control"
            title="control_engine.py"
            lines={CONTROL_CODE.map(highlight)}
          />

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8">
            <p className="font-mono text-xs uppercase tracking-widest text-sky-400">
              CTRL-005
            </p>

            <h3 className="mt-2 font-heading text-xl font-semibold text-slate-100">
              Settlement Reconciliation
            </h3>

            <p className="mt-6 text-sm leading-relaxed text-slate-400">
              TUGMA compares expected settlement values against actual payment activity,
              identifies material variances, and creates evidence-linked exceptions for remediation.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />

              <span className="font-mono text-xs uppercase tracking-widest text-emerald-300">
                Control Active
              </span>
            </div>
          </div>
        </div>

        {/* EVIDENCE CHAIN + VERIFICATION */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-center">
          <div className="order-2 rounded-xl border border-slate-800 bg-slate-900/50 p-8 lg:order-1">
            <p className="font-mono text-xs uppercase tracking-widest text-slate-500">
              Evidence Chain
            </p>

            <p className="mt-3 font-heading text-3xl font-bold text-slate-50">
              From exception to proof
            </p>

            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Exceptions connect to remediation, resolution evidence, verification,
              and a deterministic evidence package.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-slate-400">
              <span className="rounded border border-slate-700 px-2 py-1">
                Evidence Package
              </span>

              <ArrowRight className="h-3 w-3 text-sky-500" />

              <span className="rounded border border-slate-700 px-2 py-1">
                SHA-256
              </span>

              <ArrowRight className="h-3 w-3 text-sky-500" />

              <span className="rounded border border-slate-700 px-2 py-1">
                Stellar
              </span>
            </div>
          </div>

          <CodePanel
            testid="code-panel-evidence"
            title="evidence_verify.py"
            lines={EVIDENCE_CODE.map(highlight)}
          />
        </div>

        <p className="mt-8 max-w-3xl text-xs leading-relaxed text-slate-500">
          These code examples are conceptual representations of the TUGMA architecture.
          They do not claim to be the exact production implementation.
        </p>
      </Section>

      {/* HOW IT WORKS */}
      <div className="border-y border-slate-800/60 bg-[#070a11]">
        <Section>
          <Eyebrow>How It Works</Eyebrow>

          <h2 className="mt-4 font-heading text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
            From regulation to verifiable proof.
          </h2>

          <div className="mt-12 grid gap-5 md:grid-cols-3 lg:grid-cols-5">
            {HIW.map(([n, t, d]) => (
              <div
                key={n}
                className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-sky-500/40"
              >
                <p className="font-mono text-2xl font-bold text-sky-500/80">
                  {n}
                </p>

                <p className="mt-3 font-heading text-lg font-semibold text-slate-100">
                  {t}
                </p>

                <p className="mt-2 text-sm text-slate-400">
                  {d}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* REGULATORY INTELLIGENCE */}
      <Section>
        <div className="max-w-3xl">
          <Eyebrow>Regulatory Intelligence</Eyebrow>

          <h2 className="mt-4 font-heading text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl lg:text-4xl">
            Built around the rules that govern payments.
          </h2>

          <p className="mt-5 text-base leading-relaxed text-slate-300">
            TUGMA maps authoritative regulatory requirements to operational controls and continuously
            tests whether those controls are being followed.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <SourceCard
            code="BSP"
            regulator="Bangko Sentral ng Pilipinas"
            title="Manual of Regulations for Payment Systems"
            version="December 2025"
            coverage={[
              "Payment Systems",
              "Merchant Payment Acceptance",
              "IT Risk Management",
              "Governance",
              "End-User Protection",
            ]}
            url="https://www.bsp.gov.ph/Regulations/MORPS/MORPS.pdf"
          />

          <SourceCard
            code="AMLC"
            regulator="Anti-Money Laundering Council"
            title="AML/CTF Regulatory Issuances"
            version="2025"
            coverage={[
              "AML / CTF",
              "Covered Persons",
              "CTR / STR",
              "Targeted Financial Sanctions",
            ]}
            url="https://www.amlc.gov.ph/laws-and-issuances"
          />
        </div>

        <Link
          to="/regulatory-intelligence"
          className="mt-8 inline-flex items-center gap-2 text-sm text-sky-400 transition-colors hover:text-sky-300"
          data-testid="home-official-sources-link"
        >
          Official sources
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Section>

      {/* STELLAR */}
      <div className="border-y border-slate-800/60 bg-[#070a11]">
        <Section>
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-amber-300">
                  Prototype / Testnet
                </span>
              </div>

              <h2 className="font-heading text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl lg:text-4xl">
                Proof without putting sensitive payment data on-chain.
              </h2>

              <p className="mt-5 text-base leading-relaxed text-slate-300">
                TUGMA uses cryptographic evidence fingerprints to help verify that a finalized evidence
                package has not been altered.
              </p>

              <p className="mt-4 text-sm text-slate-400">
                Sensitive payment and customer information always remains off-chain. Only a canonical
                hash of a finalized evidence package is attested.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8">
              {[
                "TUGMA EVIDENCE",
                "CANONICAL PACKAGE",
                "SHA-256 HASH",
                "STELLAR TESTNET",
                "INTEGRITY VERIFICATION",
              ].map((s, i, arr) => (
                <React.Fragment key={s}>
                  <div
                    className={`rounded-md border px-4 py-3 text-center font-mono text-xs uppercase tracking-widest ${
                      i === arr.length - 1
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-slate-800 bg-slate-900/60 text-slate-300"
                    }`}
                  >
                    {s}
                  </div>

                  {i < arr.length - 1 && (
                    <div className="flex justify-center py-1.5">
                      <ArrowDown className="h-4 w-4 text-sky-500" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </Section>
      </div>

      {/* FINAL CTA */}
      <Section className="text-center">
        <h2 className="mx-auto max-w-3xl font-heading text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl lg:text-5xl">
          From regulatory requirements to verifiable proof.
        </h2>

        <Link
          to="/login"
          data-testid="final-cta-button"
          className="mt-10 inline-flex items-center gap-2 rounded-md bg-sky-500 px-6 py-3 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400"
        >
          Explore TUGMA
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Section>

      <PublicFooter />
    </div>
  );
}

function SourceCard({ code, regulator, title, version, coverage, url }) {
  return (
    <div
      className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-sky-500/40"
      data-testid={`source-card-${code.toLowerCase()}`}
    >
      <div className="flex items-center justify-between">
        <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 font-mono text-xs font-semibold tracking-widest text-sky-300">
          {code}
        </span>

        <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
          {version}
        </span>
      </div>

      <h3 className="mt-4 font-heading text-lg font-semibold text-slate-100">
        {title}
      </h3>

      <p className="mt-1 text-sm text-slate-400">
        {regulator}
      </p>

      <ul className="mt-4 flex flex-wrap gap-2">
        {coverage.map((c) => (
          <li
            key={c}
            className="rounded border border-slate-800 bg-slate-900/60 px-2 py-1 text-[11px] text-slate-300"
          >
            {c}
          </li>
        ))}
      </ul>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-1.5 text-sm text-sky-400 transition-colors hover:text-sky-300"
      >
        Official source
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
