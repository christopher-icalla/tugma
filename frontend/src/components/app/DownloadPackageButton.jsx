import React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

/**
 * Downloads a finalized evidence package in canonical form
 * (GET /evidence-packages/:id/export). The file can be checked against the
 * Stellar Testnet contract with the standalone verifier, without this app.
 */
export default function DownloadPackageButton({ pkg }) {
  const [busy, setBusy] = React.useState(false);
  if (pkg.status !== "FINALIZED") return null;

  const download = async () => {
    setBusy(true);
    try {
      const res = await api.get(`/evidence-packages/${encodeURIComponent(pkg.id)}/export`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tugma-${pkg.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      let detail = "Download failed";
      const body = e.response?.data;
      if (body instanceof Blob) {
        try { detail = JSON.parse(await body.text()).detail || detail; } catch { /* keep the generic message */ }
      }
      toast.error(detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      data-testid={`pkg-download-${pkg.id}`}
      className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-300 transition hover:border-emerald-500/60 hover:text-emerald-300 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      Download canonical package
    </button>
  );
}
