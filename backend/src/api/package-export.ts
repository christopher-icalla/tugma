import { canonicalJson, sha256 } from '../common/util';

/**
 * Portable export of a finalized evidence package: its manifest in canonical
 * form plus everything an independent verifier needs to check it against the
 * Stellar Testnet attestation contract without calling TUGMA's API.
 *
 * The exported hash is `sha256(canonicalJson(manifest))`, the same value the
 * package was generated with and the one an attestation records on-chain.
 * Bump EXPORT_FORMAT_VERSION if any field below changes meaning.
 */
export const EXPORT_FORMAT = 'tugma.evidence-package';
export const EXPORT_FORMAT_VERSION = 1;
export const CANONICALIZATION = 'json-sorted-keys-compact-utf8';

export type PackageExport = {
  format: typeof EXPORT_FORMAT;
  format_version: typeof EXPORT_FORMAT_VERSION;
  package_id: string;
  period_start: string;
  period_end: string;
  org: string;
  canonical_hash: string;
  hash_algorithm: 'sha256';
  canonicalization: typeof CANONICALIZATION;
  network: { name: string; passphrase: string; contract_id: string };
  manifest: unknown;
  canonical_manifest: string;
};

type ExportablePackage = {
  id: string;
  period_start: string;
  period_end: string;
  canonical_hash: string;
  manifest: unknown;
  status: string;
};

type Network = { name: string; passphrase: string; contract_id: string };

export class PackageNotExportableError extends Error {}

/**
 * Builds the export. Refuses packages that are not finalized, have no stored
 * manifest, or whose stored manifest no longer hashes to the stored hash, so
 * an export always verifies against its own hash.
 */
export function buildPackageExport(pkg: ExportablePackage, org: string, network: Network): PackageExport {
  if (pkg.status !== 'FINALIZED') throw new PackageNotExportableError('Only finalized packages can be exported.');
  if (pkg.manifest === null || pkg.manifest === undefined) {
    throw new PackageNotExportableError('This package has no stored manifest. Generate it again to export it.');
  }
  const canonical_manifest = canonicalJson(pkg.manifest);
  if (sha256(canonical_manifest) !== pkg.canonical_hash) {
    throw new PackageNotExportableError('The stored manifest does not match the package hash. Generate the package again.');
  }
  return {
    format: EXPORT_FORMAT,
    format_version: EXPORT_FORMAT_VERSION,
    package_id: pkg.id,
    period_start: pkg.period_start,
    period_end: pkg.period_end,
    org,
    canonical_hash: pkg.canonical_hash,
    hash_algorithm: 'sha256',
    canonicalization: CANONICALIZATION,
    network,
    manifest: pkg.manifest,
    canonical_manifest,
  };
}

/** File name for the download, e.g. `tugma-pkg-2026-01-01-2026-03-31.json`. */
export const exportFileName = (packageId: string) => `tugma-${packageId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`;
