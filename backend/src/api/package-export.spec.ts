import { canonicalJson, sha256 } from '../common/util';
import { buildPackageExport, exportFileName, PackageNotExportableError } from './package-export';

const manifest = {
  period: ['2026-01-01', '2026-03-31'],
  controls: ['CTRL-002', 'CTRL-001'],
  counts: { evidence: 2, controls: 2 },
  evidence: ['evd-a:00ff', 'evd-b:11ee'],
};
const network = { name: 'TESTNET', passphrase: 'Test SDF Network ; September 2015', contract_id: 'C'.padEnd(56, 'A') };
const pkg = (over: Partial<Parameters<typeof buildPackageExport>[0]> = {}) => ({
  id: 'pkg-2026-01-01-2026-03-31',
  period_start: '2026-01-01',
  period_end: '2026-03-31',
  canonical_hash: sha256(canonicalJson(manifest)),
  manifest,
  status: 'FINALIZED',
  ...over,
});

describe('buildPackageExport', () => {
  it('exports the manifest in canonical form with the hash it was attested under', () => {
    const out = buildPackageExport(pkg(), 'org_0123', network);
    expect(out).toMatchObject({
      format: 'tugma.evidence-package',
      format_version: 1,
      package_id: 'pkg-2026-01-01-2026-03-31',
      org: 'org_0123',
      hash_algorithm: 'sha256',
      network,
    });
    expect(out.canonical_manifest).toBe(canonicalJson(manifest));
    expect(sha256(out.canonical_manifest)).toBe(out.canonical_hash);
  });

  it('keys are sorted at every level and output is compact', () => {
    const out = buildPackageExport(pkg(), 'org_0123', network);
    expect(out.canonical_manifest.startsWith('{"controls":["CTRL-002","CTRL-001"],"counts":{"controls":2,"evidence":2}')).toBe(true);
    expect(out.canonical_manifest).not.toMatch(/\s/);
  });

  it('refuses packages that are not finalized or have no manifest', () => {
    expect(() => buildPackageExport(pkg({ status: 'DRAFT' }), 'org_0123', network)).toThrow(PackageNotExportableError);
    expect(() => buildPackageExport(pkg({ manifest: null }), 'org_0123', network)).toThrow(PackageNotExportableError);
  });

  it('refuses a stored manifest that no longer matches the stored hash', () => {
    expect(() => buildPackageExport(pkg({ canonical_hash: '0'.repeat(64) }), 'org_0123', network)).toThrow(/does not match/);
  });

  it('builds a safe file name', () => {
    expect(exportFileName('pkg-2026-01-01-2026-03-31')).toBe('tugma-pkg-2026-01-01-2026-03-31.json');
    expect(exportFileName('../x y')).toBe('tugma-.._x_y.json');
  });
});
