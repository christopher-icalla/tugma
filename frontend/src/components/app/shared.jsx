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
