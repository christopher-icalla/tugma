import React from "react";
import { ExternalLink, History } from "lucide-react";
import { api } from "@/lib/api";

const DOT = {
  generated: "bg-sky-400",
  cosign: "bg-amber-400",
  attested: "bg-emerald-400",
  countersigned: "bg-emerald-300",
  exported: "bg-slate-400",
  synced: "bg-violet-400",
};

const when = (iso) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** Collapsible history of one package; loads when first opened. */
export default function PackageTimeline({ pkg }) {
  const [events, setEvents] = React.useState(null);
  const [error, setError] = React.useState(false);

  const load = async (e) => {
    if (!e.currentTarget.open || events) return;
    try {
      const { data } = await api.get(`/evidence-packages/${encodeURIComponent(pkg.id)}/timeline`);
      setEvents(data.events);
    } catch {
      setError(true);
    }
  };

  return (
    <details className="border-t border-slate-800 px-6 py-4" onToggle={load} data-testid={`timeline-${pkg.id}`}>
      <summary className="flex cursor-pointer items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-300">
        <History className="h-3.5 w-3.5" /> Package timeline
      </summary>
      {error && <p className="mt-3 text-sm text-rose-300">The timeline could not be loaded.</p>}
      {!error && !events && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
      {events && (
        <ol className="mt-4 space-y-4 border-l border-slate-800 pl-5">
          {events.map((e, i) => (
            <li key={`${e.kind}-${e.at}-${i}`} className="relative">
              <span className={`absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ${DOT[e.kind] || "bg-slate-500"}`} />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-slate-200">{e.title}</p>
                <p className="font-mono text-[11px] text-slate-500">{when(e.at)}</p>
              </div>
              {e.actor && <p className="mt-0.5 break-all font-mono text-[11px] text-slate-400">{e.actor}</p>}
              {e.detail && <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{e.detail}</p>}
              {e.link && (
                <a href={e.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-sky-400 hover:text-sky-300">
                  {e.ledger ? `Ledger ${e.ledger} · ` : ""}tx {e.tx_hash.slice(0, 12)}… <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {!e.link && e.ledger && <p className="mt-1 font-mono text-[11px] text-slate-500">Ledger {e.ledger} (transaction hash not recorded)</p>}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
