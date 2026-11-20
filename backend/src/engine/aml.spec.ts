import { COVERED_AMOUNTS, generateTransactions, STRUCTURING_GROUPS } from '../seed/dataset';
import { php } from '../common/util';
import { amlScreen, manilaDate } from './aml';

const tx = (id: string, merchant: string, amount: number, iso: string) => ({ transaction_id: id, merchant_id: merchant, amount, timestamp: new Date(iso) });

describe('CTRL-003 AML screen', () => {
  it('flags amounts above PHP 500,000 as covered, and not the threshold itself', () => {
    const r = amlScreen([tx('A', 'M1', 500_000.01, '2026-02-01T01:00:00Z'), tx('B', 'M1', 500_000, '2026-02-02T01:00:00Z')]);
    expect(r.get('A')).toMatchObject({ defect: 'covered_transaction' });
    expect(r.has('B')).toBe(false);
  });

  it('flags same-day, same-merchant splits just below the threshold', () => {
    const r = amlScreen([
      tx('S1', 'M1', 480_000, '2026-02-01T01:00:00Z'),
      tx('S2', 'M1', 490_000, '2026-02-01T09:00:00Z'),
      tx('X1', 'M2', 480_000, '2026-02-01T01:00:00Z'),
      tx('D1', 'M3', 480_000, '2026-02-01T15:30:00Z'), // 23:30 Manila, Feb 1
      tx('D2', 'M3', 480_000, '2026-02-01T16:30:00Z'), // 00:30 Manila, Feb 2
      tx('L1', 'M4', 300_000, '2026-02-01T01:00:00Z'),
      tx('L2', 'M4', 300_000, '2026-02-01T02:00:00Z'),
    ]);
    expect([...r.keys()].sort()).toEqual(['S1', 'S2']);
    expect(r.get('S1')).toMatchObject({ defect: 'possible_structuring', total: 970_000, count: 2, with: ['S2'], date: '2026-02-01' });
    expect(manilaDate(new Date('2026-02-01T16:30:00Z'))).toBe('2026-02-02');
  });

  it('finds exactly the injected patterns in the 10k dataset', () => {
    const r = amlScreen(generateTransactions().map((t) => ({
      transaction_id: t.transaction_id, merchant_id: t.merchant_id, amount: t.transaction_amount, timestamp: t.transaction_timestamp,
    })));
    const by = (d: string) => [...r.values()].filter((f) => f.defect === d);
    expect(by('covered_transaction')).toHaveLength(COVERED_AMOUNTS.length);
    const split = by('possible_structuring');
    expect(split).toHaveLength(STRUCTURING_GROUPS.flat().length);
    const totals = new Set(split.map((f) => (f.defect === 'possible_structuring' ? php(f.total) : '')));
    expect([...totals].sort()).toEqual(STRUCTURING_GROUPS.map((g) => php(g.reduce((a, b) => a + b, 0))).sort());
  });
});
