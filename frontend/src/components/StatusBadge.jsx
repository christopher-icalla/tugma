import React from "react";

const TONES = {
  passed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  active: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  verified: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  resolved: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  completed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  normal: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  medium: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  warning: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  in_remediation: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  in_progress: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  pending: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  high: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  critical: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  open: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  failed: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  info: "bg-sky-500/10 text-sky-300 border-sky-500/30",
};

const GLYPH = {
  emerald: "●",
  amber: "▲",
  rose: "■",
  slate: "○",
  sky: "◆",
};

function glyphFor(tone) {
  if (/emerald/.test(tone)) return GLYPH.emerald;
  if (/amber/.test(tone)) return GLYPH.amber;
  if (/rose/.test(tone)) return GLYPH.rose;
  if (/sky/.test(tone)) return GLYPH.sky;
  return GLYPH.slate;
}

// Status never relies on color alone: a glyph + label always accompany it.
export function StatusBadge({ value, testid }) {
  const key = String(value || "").toLowerCase().replace(/[\s-]/g, "_");
  const tone = TONES[key] || TONES.info;
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${tone}`}
    >
      <span aria-hidden="true" className="text-[8px] leading-none">{glyphFor(tone)}</span>
      {String(value || "—").replace(/_/g, " ")}
    </span>
  );
}
