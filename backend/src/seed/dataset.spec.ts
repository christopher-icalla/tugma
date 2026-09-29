import { DEFECT_SPEC, generateTransactions, HERO_TX, N_PENDING, TOTAL } from './dataset';
import { canonicalJson } from '../common/util';

describe('synthetic dataset', () => {
  const txns = generateTransactions();

  it('is exactly 10,000 unique transactions with the hero transaction first', () => {
    expect(txns).toHaveLength(TOTAL);
    expect(new Set(txns.map((t) => t.transaction_id)).size).toBe(TOTAL);
    expect(txns[0]).toMatchObject({ transaction_id: HERO_TX, processor_amount: 10000, actual_settlement: 9500, actual_payout: 9500 });
  });

  it('is deterministic', () => {
    expect(canonicalJson(generateTransactions())).toBe(canonicalJson(txns));
  });

  it('injects the exact defect counts', () => {
    expect(txns.filter((t) => t.approval_status === 'MISSING')).toHaveLength(DEFECT_SPEC.missing_approval);
    expect(txns.filter((t) => t.initiated_by === t.approved_by)).toHaveLength(DEFECT_SPEC.segregation_of_duty);
    expect(txns.filter((t) => !t.has_evidence)).toHaveLength(DEFECT_SPEC.missing_evidence);
    expect(txns.filter((t) => t.duplicate_of)).toHaveLength(DEFECT_SPEC.duplicate_transaction);
    expect(txns.filter((t) => t.payment_status === 'PENDING')).toHaveLength(N_PENDING);
  });
});

describe('canonicalJson', () => {
  it('sorts keys recursively like Python json.dumps(sort_keys=True)', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  });
});
