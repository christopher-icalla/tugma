import { canonicalJson, sha256 } from '../common/util';

/**
 * Export of a single evidence record, so a reviewer can check one document
 * against its `id:content_hash` line in an evidence package without receiving
 * any other document. The package manifest lists only ids and hashes.
 *
 * `hash_input` is exactly the object `content_hash` was computed from when the
 * evidence was recorded (EvidenceController.createEvidence).
 */
export const EVIDENCE_EXPORT_FORMAT = 'tugma.evidence-item';
export const EVIDENCE_EXPORT_FORMAT_VERSION = 1;

type ExportableEvidence = {
  id: string;
  name: string;
  evidence_type: string;
  content: string | null;
  source_system: string | null;
  content_hash: string;
  captured_at: Date | null;
};

export class EvidenceNotExportableError extends Error {}

/** The object an evidence record's content_hash is computed from. */
export const evidenceHashInput = (ev: { name: string; evidence_type: string; content: string | null; source_system: string | null }) => ({
  name: ev.name, type: ev.evidence_type, content: ev.content ?? '', source: ev.source_system ?? '',
});

export function buildEvidenceExport(ev: ExportableEvidence, org: string) {
  const hash_input = evidenceHashInput(ev);
  const canonical_hash_input = canonicalJson(hash_input);
  if (sha256(canonical_hash_input) !== ev.content_hash) {
    throw new EvidenceNotExportableError('The stored evidence no longer matches its content hash.');
  }
  return {
    format: EVIDENCE_EXPORT_FORMAT,
    format_version: EVIDENCE_EXPORT_FORMAT_VERSION,
    evidence_id: ev.id,
    org,
    captured_at: ev.captured_at ? ev.captured_at.toISOString() : null,
    hash_input,
    canonical_hash_input,
    content_hash: ev.content_hash,
    manifest_entry: `${ev.id}:${ev.content_hash}`,
  };
}

export const evidenceFileName = (id: string) => `tugma-evidence-${id.replace(/[^A-Za-z0-9._-]/g, '_')}.json`;
