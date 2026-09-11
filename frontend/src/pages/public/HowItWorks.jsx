import React from "react";
import { PublicNav, PublicFooter } from "@/components/public/PublicChrome";
import { Section, Eyebrow } from "@/components/public/Primitives";
import { FlowDiagram } from "@/components/public/FlowDiagram";
import { ArrowDown } from "lucide-react";

const STEPS = [
  ["01", "MAP", "Regulation → Requirement", "Authoritative regulatory publications are mapped into discrete, trackable requirements with source, version and effective date."],
  ["02", "DEFINE", "Requirement → Control", "Each requirement is connected to one or more operational controls with an owner, risk level and testing frequency."],
  ["03", "TEST", "Control → Operational Data", "Controls are tested against actual payment operations data to determine pass, fail or warning outcomes."],
  ["04", "RESOLVE", "Exception → Remediation", "Failed tests raise exceptions, which are routed to owners with remediation actions and due dates."],
  ["05", "PROVE", "Evidence → Verifiable Evidence Package", "Evidence is collected, hashed and assembled into a canonical, verifiable evidence package."],
];

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-[#090d16]">
      <PublicNav />
      <Section>
        <Eyebrow>How It Works</Eyebrow>
        <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
          Regulation → Control → Proof
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300">
          TUGMA connects the rules that govern payments to the operational activity they apply to,
          then produces evidence you can verify.
        </p>

        <div className="mt-14 grid gap-12 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {STEPS.map(([n, t, s, d]) => (
              <div key={n} className="flex gap-5 rounded-lg border border-slate-800 bg-slate-900/50 p-6">
                <div className="font-mono text-3xl font-bold text-sky-500/70">{n}</div>
                <div>
                  <p className="font-heading text-lg font-semibold text-slate-100">{t}</p>
                  <p className="mt-0.5 font-mono text-xs uppercase tracking-widest text-sky-400">{s}</p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{d}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 lg:sticky lg:top-24 lg:self-start">
            <p className="mb-5 font-mono text-[11px] uppercase tracking-widest text-slate-500">Conceptual flow</p>
            <FlowDiagram testid="hiw-flow-diagram" />
          </div>
        </div>
      </Section>
      <PublicFooter />
    </div>
  );
}
