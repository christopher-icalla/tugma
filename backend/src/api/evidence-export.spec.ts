import { canonicalJson, sha256 } from '../common/util';
import { buildEvidenceExport, evidenceFileName, evidenceHashInput, EvidenceNotExportableError } from './evidence-export';

const ev = {
  id: 'evd-0a1b2c3d4e',
  name: 'Settlement report TX-847291',
  evidence_type: 'DOCUMENT',
  content: 'Settled PHP 9,500.00 against PHP 10,000.00',
  source_system: null,
  captured_at: new Date('2026-11-19T08:00:00Z'),
};
const content_hash = sha256(canonicalJson(evidenceHashInput(ev)));

describe('buildEvidenceExport', () => {
  it('exports the exact input the content hash was computed from', () => {
    const out = buildEvidenceExport({ ...ev, content_hash }, 'org_0123');
    expect(out).toMatchObject({
      format: 'tugma.evidence-item', format_version: 1, evidence_id: ev.id, org: 'org_0123',
      hash_input: { name: ev.name, type: 'DOCUMENT', content: ev.content, source: '' },
      content_hash, manifest_entry: `${ev.id}:${content_hash}`, captured_at: '2026-11-19T08:00:00.000Z',
    });
    expect(sha256(out.canonical_hash_input)).toBe(content_hash);
  });

  it('uses the same hash input as evidence recording (null fields become empty strings)', () => {
    expect(canonicalJson(evidenceHashInput({ name: 'a', evidence_type: 'b', content: null, source_system: null })))
      .toBe('{"content":"","name":"a","source":"","type":"b"}');
  });

  it('refuses evidence whose stored content no longer matches its hash', () => {
    expect(() => buildEvidenceExport({ ...ev, content: 'edited', content_hash }, 'org_0123')).toThrow(EvidenceNotExportableError);
  });

  it('builds a safe file name', () => {
    expect(evidenceFileName('evd-0a1b')).toBe('tugma-evidence-evd-0a1b.json');
  });
});
