import React from "react";
import { PublicNav, PublicFooter } from "@/components/public/PublicChrome";
import { Section, Eyebrow } from "@/components/public/Primitives";

const CONTROLS = [
  { code: "CTRL-001", name: "Critical Third-Party Oversight", category: "Third-Party Risk", risk: "HIGH", type: "Preventive", desc: "Verifies that active critical vendors have current due-diligence, contracts and monitoring evidence on file.", map: "BSP · IT Risk Management / Outsourcing" },
  { code: "CTRL-002", name: "IT Risk Control Evidence", category: "IT Risk", risk: "MEDIUM", type: "Detective", desc: "Checks that required IT risk controls (access review, change logs, backups) have evidence within the review window.", map: "BSP · IT Risk Management" },
  { code: "CTRL-003", name: "AML/CTPF Control Evidence", category: "AML/CTF", risk: "HIGH", type: "Detective", desc: "Verifies AML program artifacts and reporting completeness. Not an AML transaction-monitoring replacement.", map: "AMLC · AML/CTF Program" },
  { code: "CTRL-004", name: "Merchant / End-User Protection", category: "End-User Protection", risk: "MEDIUM", type: "Detective", desc: "Checks disclosure, complaint-handling and dispute-resolution evidence for the period.", map: "BSP · End-User Protection" },
  { code: "CTRL-005", name: "Settlement Reconciliation", category: "Settlement Integrity", risk: "HIGH", type: "Detective", desc: "Tests every transaction where |processor_amount − actual_settlement| exceeds tolerance and raises a HIGH exception requiring evidence.", map: "BSP · Payment Systems / Settlement", primary: true },
];

const RISK_TONE = { HIGH: "text-rose-300 border-rose-500/30", MEDIUM: "text-amber-300 border-amber-500/30" };

export default function ControlsPublic() {
  return (
    <div className="min-h-screen bg-[#090d16]">
      <PublicNav />
      <Section>
        <Eyebrow>Control Library</Eyebrow>
        <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
          Controls that connect rules to operations.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300">
          Each control maps a regulatory requirement to a deterministic, testable check against your
          payment operations data.
        </p>

        {CONTROLS.filter((c) => c.primary).map((c) => (
          <div key={c.code} className="mt-12 rounded-xl border border-sky-500/40 bg-sky-500/5 p-8" data-testid="control-primary-ctrl-005">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 font-mono text-xs font-semibold tracking-widest text-sky-300">{c.code}</span>
              <span className="font-mono text-[11px] uppercase tracking-widest text-sky-400">Primary Example</span>
            </div>
            <h2 className="mt-4 font-heading text-2xl font-semibold text-slate-50">{c.name}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">{c.desc}</p>
            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 font-mono text-xs">
              <Meta k="Category" v={c.category} />
              <Meta k="Risk" v={c.risk} />
              <Meta k="Type" v={c.type} />
              <Meta k="Mapping" v={c.map} />
            </dl>
          </div>
        ))}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {CONTROLS.filter((c) => !c.primary).map((c) => (
            <div key={c.code} className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-slate-700" data-testid={`control-card-${c.code.toLowerCase()}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold tracking-widest text-slate-300">{c.code}</span>
                <span className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${RISK_TONE[c.risk]}`}>{c.risk} risk</span>
              </div>
              <h3 className="mt-3 font-heading text-lg font-semibold text-slate-100">{c.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.desc}</p>
              <div className="mt-4 flex flex-wrap gap-2 font-mono text-[11px] text-slate-400">
                <span className="rounded border border-slate-800 px-2 py-1">{c.category}</span>
                <span className="rounded border border-slate-800 px-2 py-1">{c.type}</span>
              </div>
              <p className="mt-4 border-t border-slate-800 pt-3 font-mono text-[11px] text-slate-500">{c.map}</p>
            </div>
          ))}
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
