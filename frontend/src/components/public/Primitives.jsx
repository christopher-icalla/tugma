import React from "react";

export function Eyebrow({ children }) {
  return (
    <span className="font-mono text-xs uppercase tracking-[0.2em] text-sky-400">{children}</span>
  );
}

export function Section({ children, className = "", id }) {
  return (
    <section id={id} className={`mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 ${className}`}>
      {children}
    </section>
  );
}

// Monospace terminal-style code card representing conceptual TUGMA architecture.
export function CodePanel({ title = "control_engine.py", lines, testid }) {
  return (
    <div data-testid={testid} className="overflow-hidden rounded-lg border border-slate-800 bg-[#0b0f18] shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-3 font-mono text-xs text-slate-500">{title}</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-slate-300">
        <code>
          {lines.map((l, i) => (
            <div key={i} className="whitespace-pre">
              <span className="mr-4 select-none text-slate-700">{String(i + 1).padStart(2, "0")}</span>
              <span>{l}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

// Syntax colouring for the static snippets, built as React nodes (no HTML parsing).
const TOKEN = /("[^"]*")|(control|expected|actual|if|abs|create_exception|evidence|verify)|(HIGH|True|tolerance)/g;
const TOKEN_CLASS = ["text-emerald-300", "text-sky-400", "text-amber-300"];

export function highlight(code) {
  const out = [];
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const group = m.slice(1).findIndex(Boolean);
    out.push(<span key={m.index} className={TOKEN_CLASS[group]}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}
