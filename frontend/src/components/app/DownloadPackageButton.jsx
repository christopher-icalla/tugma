import React from "react";
import { Download, Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { signExport } from "@/lib/stellar";

const BTN =
  "inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-slate-300 transition hover:border-emerald-500/60 hover:text-emerald-300 disabled:opacity-50";

function save(text, fileName) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function errorDetail(e, fallback) {
  const body = e.response?.data;
  if (body instanceof Blob) {
    try { return JSON.parse(await body.text()).detail || fallback; } catch { return fallback; }
  }
  return body?.detail || e.message || fallback;
}

/**
 * Downloads a finalized evidence package in canonical form
 * (GET /evidence-packages/:id/export), optionally signed by the user's linked
 * Stellar wallet. The file can be checked against the Stellar Testnet
 * contract with the standalone verifier, without this app.
 */
export default function DownloadPackageButton({ pkg }) {
  const { user } = useAuth();
  const [busy, setBusy] = React.useState(null);
  if (pkg.status !== "FINALIZED") return null;
  const wallet = user?.stellar_address;

  const download = async (signed) => {
    setBusy(signed ? "signed" : "plain");
    try {
      const res = await api.get(`/evidence-packages/${encodeURIComponent(pkg.id)}/export`, { responseType: "text" });
      let text = res.data;
      let name = `tugma-${pkg.id}.json`;
      if (signed) {
        text = JSON.stringify(await signExport(JSON.parse(text), wallet), null, 2);
        name = `tugma-${pkg.id}.signed.json`;
      }
      save(text, name);
      if (signed) toast.success("Signed package downloaded");
    } catch (e) {
      toast.error(await errorDetail(e, "Download failed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={() => download(false)} disabled={!!busy} data-testid={`pkg-download-${pkg.id}`} className={BTN}>
        {busy === "plain" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Download canonical package
      </button>
      {wallet && (
        <button type="button" onClick={() => download(true)} disabled={!!busy} data-testid={`pkg-download-signed-${pkg.id}`}
          title="Sign the export with your linked Freighter wallet (SEP-53) so a verifier can see who exported it" className={BTN}>
          {busy === "signed" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
          Download signed copy
        </button>
      )}
    </div>
  );
}
