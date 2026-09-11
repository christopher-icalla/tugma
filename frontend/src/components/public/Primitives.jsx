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
              <span dangerouslySetInnerHTML={{ __html: l }} />
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

const SYN = (code) =>
  code
    .replace(/(control|expected|actual|if|abs|create_exception|evidence|verify)/g, '<span class="text-sky-400">$1</span>')
    .replace(/(&quot;[^&]*&quot;|"[^"]*")/g, '<span class="text-emerald-300">$1</span>')
    .replace(/(HIGH|True|tolerance)/g, '<span class="text-amber-300">$1</span>');

export function highlight(code) {
  return SYN(code.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
}
