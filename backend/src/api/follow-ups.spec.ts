import { bucketOf, followUps, planReminders } from './follow-ups';

const NOW = new Date('2026-11-20T00:00:00Z');
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const exc = (code: string, dueDaysAgo: number, over: object = {}) => ({
  exception_code: code, title: `t ${code}`, severity: 'MEDIUM', status: 'OPEN', due_date: days(dueDaysAgo),
  owner_id: 'u-ops', owner_name: 'Ops', owner_role: 'PAYMENT_OPS', ...over,
});

describe('follow-ups', () => {
  it('buckets by days overdue', () => {
    expect([-3, 0, 1, 7, 8, 30, 31].map(bucketOf)).toEqual([
      'not_due', 'not_due', 'overdue_1_7', 'overdue_1_7', 'overdue_8_30', 'overdue_8_30', 'overdue_30_plus',
    ]);
  });

  it('counts only open exceptions and sorts the latest first', () => {
    const f = followUps(NOW, [
      exc('A', -2), exc('B', 3), exc('C', 45), exc('D', 10, { severity: 'HIGH' }), exc('E', 10),
      exc('F', 90, { status: 'RESOLVED' }), exc('G', 90, { status: 'VERIFIED' }),
    ], []);
    expect(f.ageing).toEqual({ not_due: 1, overdue_1_7: 1, overdue_8_30: 2, overdue_30_plus: 1 });
    expect(f.overdue.map((e) => e.exception_code)).toEqual(['C', 'D', 'E', 'B']);
    expect(f.overdue[0]).toMatchObject({ days_overdue: 45, bucket: 'overdue_30_plus' });
  });

  it('lists attestations without a countersignature', () => {
    const f = followUps(NOW, [], [
      { evidence_package_id: 'pkg-a', version: 1, attester_name: 'Ana', attester_user_id: 'u-ana', submitted_at: days(2), verifier_address: null },
      { evidence_package_id: 'pkg-b', version: 1, attester_name: 'Ana', attester_user_id: 'u-ana', submitted_at: days(9), verifier_address: null },
      { evidence_package_id: 'pkg-c', version: 1, attester_name: 'Ana', attester_user_id: 'u-ana', submitted_at: days(5), verifier_address: 'GV' },
    ]);
    expect(f.awaiting_countersign.map((a) => [a.evidence_package_id, a.days_waiting])).toEqual([['pkg-b', 9], ['pkg-a', 2]]);
  });

  it('plans one reminder per person and never asks the attester to countersign', () => {
    const f = followUps(NOW, [exc('B', 3), exc('C', 45, { owner_id: null })], [
      { evidence_package_id: 'pkg-a', version: 2, attester_name: 'Ana', attester_user_id: 'u-ana', submitted_at: days(2), verifier_address: null },
    ]);
    const plan = planReminders(f, [{ id: 'u-ana' }, { id: 'u-risk' }, { id: 'u-ops' }]);
    const by = Object.fromEntries(plan.map((r) => [r.user_id, r]));
    expect(by['u-ana']).toBeUndefined();
    expect(by['u-risk'].countersign).toEqual(['pkg-a v2, attested by Ana 2 day(s) ago']);
    expect(by['u-ops'].overdue).toEqual(['B (MEDIUM, 3 day(s) overdue): t B']);
    expect(by['u-ops'].countersign).toHaveLength(1);
  });
});
