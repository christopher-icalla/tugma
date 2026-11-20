import React from "react";
import { Link } from "react-router-dom";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { can } from "@/lib/perms";
import { useAuth } from "@/context/AuthContext";
import { useApi, Card, shortDate } from "@/components/app/shared";
import { StatusBadge } from "@/components/StatusBadge";

const BUCKETS = [
  ["not_due", "Not yet due", "text-slate-300"],
  ["overdue_1_7", "1–7 days overdue", "text-amber-300"],
  ["overdue_8_30", "8–30 days overdue", "text-orange-300"],
  ["overdue_30_plus", "30+ days overdue", "text-rose-300"],
];

/** Dashboard card: exception ageing, overdue items, packages awaiting countersignature, reminder emails. */
export default function FollowUps() {
  const { user } = useAuth();
  const { data, reload } = useApi("/follow-ups");
  const [sending, setSending] = React.useState(false);
  if (!data) return null;

  const send = async () => {
    setSending(true);
    try {
      const { data: r } = await api.post("/follow-ups/remind");
      if (!r.email_configured) toast.warning(`Email is not configured: ${r.recipients} reminder(s) prepared, none sent.`);
      else toast.success(`Sent ${r.sent} of ${r.recipients} reminder(s).`);
      await reload();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Reminders could not be sent");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="mt-6" testid="follow-ups-section">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className="font-heading text-base font-semibold text-slate-200">Follow-ups</h2>
          <p className="mt-0.5 text-xs text-slate-500">Open exceptions by days past their due date, and attestations waiting for a second wallet.</p>
        </div>
        {can(user?.role, "reminders:send") && (
          <button
            type="button" onClick={send} disabled={sending} data-testid="send-reminders"
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-sky-500 disabled:opacity-60"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
            Send reminders
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-px bg-slate-800 lg:grid-cols-4">
        {BUCKETS.map(([key, label, tone]) => (
          <div key={key} className="bg-slate-950 px-5 py-4" data-testid={`ageing-${key}`}>
            <p className={`font-heading text-2xl font-bold ${tone}`}>{data.ageing[key].toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Most overdue ({data.overdue_total})</h3>
          {data.overdue.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing is past its due date.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-800">
              {data.overdue.slice(0, 5).map((e) => (
                <li key={e.exception_code} className="py-2.5">
                  <Link to={`/app/exceptions/${e.exception_code}`} className="flex items-center justify-between gap-3 hover:text-sky-300">
                    <span className="font-mono text-xs text-slate-400">{e.exception_code}</span>
                    <span className="font-mono text-[11px] text-rose-300">{e.days_overdue}d overdue</span>
                  </Link>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <StatusBadge value={e.severity} /> <span>{e.owner_name || e.owner_role || "Unassigned"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Awaiting countersignature ({data.awaiting_countersign.length})</h3>
          {data.awaiting_countersign.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Every attestation has been countersigned.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-800">
              {data.awaiting_countersign.slice(0, 5).map((a) => (
                <li key={`${a.evidence_package_id}-${a.version}`} className="py-2.5">
                  <Link to="/app/reports" className="flex items-center justify-between gap-3 hover:text-sky-300">
                    <span className="font-mono text-xs text-slate-400">{a.evidence_package_id} v{a.version}</span>
                    <span className="font-mono text-[11px] text-amber-300">{a.days_waiting}d waiting</span>
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">Attested by {a.attester_name} on {shortDate(a.submitted_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {!data.email_configured && (
        <p className="border-t border-slate-800 px-5 py-3 font-mono text-[11px] text-slate-600">Email is not configured on this server, so reminders are prepared and audited but not delivered.</p>
      )}
    </Card>
  );
}
