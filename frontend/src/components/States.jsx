import React from "react";
import { Loader2, Inbox, ShieldAlert, AlertTriangle, RotateCw } from "lucide-react";

export function LoadingState({ label = "Loading…", testid = "loading-state" }) {
  return (
    <div data-testid={testid} className="flex flex-col items-center justify-center py-20 text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
      <p className="mt-3 font-mono text-xs uppercase tracking-widest">{label}</p>
    </div>
  );
}

export function EmptyState({ title, description, icon: Icon = Inbox, testid = "empty-state" }) {
  return (
    <div
      data-testid={testid}
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-900/40 py-16 px-6 text-center"
    >
      <Icon className="h-8 w-8 text-slate-600" />
      <h4 className="mt-4 font-heading text-base font-medium text-slate-200">{title}</h4>
      <p className="mt-1 max-w-md text-sm text-slate-400">{description}</p>
    </div>
  );
}

export function ErrorState({ title = "Unable to load data", description, onRetry, testid = "error-state" }) {
  return (
    <div
      data-testid={testid}
      className="flex flex-col items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/5 py-16 px-6 text-center"
    >
      <AlertTriangle className="h-8 w-8 text-rose-400" />
      <h4 className="mt-4 font-heading text-base font-medium text-slate-100">{title}</h4>
      <p className="mt-1 max-w-md text-sm text-slate-400">{description}</p>
      {onRetry && (
        <button
          data-testid="error-retry-button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-sky-500/50 hover:text-sky-300"
        >
          <RotateCw className="h-4 w-4" /> Retry
        </button>
      )}
    </div>
  );
}

export function PermissionDenied({ role, testid = "permission-denied" }) {
  return (
    <div
      data-testid={testid}
      className="flex flex-col items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/5 py-16 px-6 text-center"
    >
      <ShieldAlert className="h-8 w-8 text-amber-400" />
      <h4 className="mt-4 font-heading text-base font-medium text-slate-100">Permission denied</h4>
      <p className="mt-1 max-w-md text-sm text-slate-400">
        Your role{role ? ` (${role})` : ""} does not have access to this section. Contact an
        organization administrator to request access.
      </p>
    </div>
  );
}
