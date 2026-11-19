import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { packageQrText, verifierLink, VERIFIER_URL } from "@/lib/verifier";

/**
 * QR code for printed audit reports: carries the package id and SHA-256 (and
 * a verifier link when one is configured), so a reader can check the printed
 * package against Stellar without TUGMA.
 */
export default function PackageQr({ pkg }) {
  if (pkg.status !== "FINALIZED") return null;
  return (
    <div className="mt-3 flex items-center gap-4 rounded-md border border-slate-800 bg-slate-950/50 p-3" data-testid={`pkg-qr-${pkg.id}`}>
      <div className="rounded bg-white p-1.5">
        <QRCodeSVG value={packageQrText(pkg)} size={88} level="M" />
      </div>
      <div className="text-xs text-slate-400">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Verify this package</p>
        <p className="mt-1">Scan for the package id and SHA-256, then check the downloaded file with the open-source verifier.</p>
        <a href={verifierLink(pkg.canonical_hash)} target="_blank" rel="noopener noreferrer"
          className="mt-1 inline-block text-emerald-300 hover:underline">
          {VERIFIER_URL ? "Open the verifier" : "How to verify a package"}
        </a>
      </div>
    </div>
  );
}
