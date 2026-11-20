import { buildReport } from './package-report';

const d = new Date('2026-11-01T00:00:00Z');
const exc = (code: string, severity: string, status = 'OPEN') => ({
  exception_code: code, control_code: 'CTRL-005', severity, status, title: code, transaction_id: null, due_date: d, verified_at: null,
});

describe('package report', () => {
  it('keeps only what the manifest lists and orders exceptions by severity', () => {
    const r = buildReport(
      { exceptions: ['E2', 'E1', 'E3'], controls: ['CTRL-005'], evidence: [] },
      [exc('E1', 'MEDIUM'), exc('E2', 'HIGH', 'VERIFIED'), exc('E3', 'HIGH'), exc('E9', 'HIGH')],
      [],
      [
        { control_code: 'CTRL-005', name: 'Settlement', requirement_code: 'BSP-PS-04', regulator: 'BSP', run: null },
        { control_code: 'CTRL-009', name: 'Other', requirement_code: null, regulator: null, run: null },
      ],
    );
    expect(r.exceptions.map((e) => e.exception_code)).toEqual(['E2', 'E3', 'E1']);
    expect(r.exceptions_by_severity).toEqual({ HIGH: 2, MEDIUM: 1 });
    expect(r.exceptions_by_status).toEqual({ VERIFIED: 1, OPEN: 2 });
    expect(r.controls.map((c) => c.control_code)).toEqual(['CTRL-005']);
  });

  it('indexes evidence and flags records whose content changed since the package', () => {
    const ev = (id: string, hash: string) => ({ id, name: `doc ${id}`, evidence_type: 'PDF', captured_at: d, captured_by: 'ana', content_hash: hash, exception_id: null });
    const r = buildReport(
      { evidence: [`ev1:${'a'.repeat(64)}`, `ev2:${'b'.repeat(64)}`, `ev3:${'c'.repeat(64)}`] },
      [], [ev('ev1', 'a'.repeat(64)), ev('ev2', 'f'.repeat(64))], [],
    );
    expect(r.evidence.map((e) => [e.id, e.unchanged])).toEqual([['ev1', true], ['ev2', false], ['ev3', false]]);
    expect(r.evidence[2].name).toBeNull();
    expect(r.evidence_changed).toBe(2);
  });
});
