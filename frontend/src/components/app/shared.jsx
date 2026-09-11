import React from "react";
import { api } from "@/lib/api";

// Small data hook: exposes loading / error / data + retry for app pages.
export function useApi(path) {
  const [state, setState] = React.useState({ loading: true, error: null, data: null });

  const load = React.useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data } = await api.get(path);
      setState({ loading: false, error: null, data });
    } catch (err) {
      const status = err.response?.status;
      setState({ loading: false, error: { status, message: err.message }, data: null });
    }
  }, [path]);

  React.useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function PageHeader({ eyebrow, title, subtitle, right }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sky-400">{eyebrow}</p>}
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className = "", testid }) {
  return (
    <div data-testid={testid} className={`rounded-xl border border-slate-800 bg-slate-900/50 ${className}`}>
      {children}
    </div>
  );
}

export function money(v, currency = "PHP") {
  if (v == null) return "—";
  return `${currency} ${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shortDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function mono(text) {
  return <span className="font-mono text-xs text-slate-400">{text}</span>;
}

export function Pagination({ page, pages, total, onPage, testid = "pagination" }) {
  if (!pages || pages <= 1) return (
    <div data-testid={testid} className="flex items-center justify-between px-5 py-3 font-mono text-[11px] text-slate-500">
      <span>{total} record{total === 1 ? "" : "s"}</span>
    </div>
  );
  return (
    <div data-testid={testid} className="flex items-center justify-between border-t border-slate-800 px-5 py-3 font-mono text-[11px] text-slate-400">
      <span>{total.toLocaleString()} records · page {page} of {pages}</span>
      <div className="flex items-center gap-2">
        <button data-testid="pagination-prev" disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="rounded-md border border-slate-700 px-3 py-1.5 transition-colors hover:border-sky-500/50 hover:text-sky-300 disabled:opacity-40">Prev</button>
        <button data-testid="pagination-next" disabled={page >= pages} onClick={() => onPage(page + 1)}
          className="rounded-md border border-slate-700 px-3 py-1.5 transition-colors hover:border-sky-500/50 hover:text-sky-300 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

export function Select({ value, onChange, options, placeholder, testid }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}
      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 outline-none transition-colors focus:border-sky-500">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  );
}
