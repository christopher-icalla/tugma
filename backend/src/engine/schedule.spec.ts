import { nextRunAt } from './schedule';

describe('nextRunAt', () => {
  it('is later today in Manila when the time has not passed', () => {
    // 2026-11-20 01:00 Manila = 2026-11-19 17:00 UTC
    expect(nextRunAt(new Date('2026-11-19T17:00:00Z'), '02:00')?.toISOString()).toBe('2026-11-19T18:00:00.000Z');
  });

  it('is tomorrow when the time has passed or is exactly now', () => {
    expect(nextRunAt(new Date('2026-11-19T18:00:00Z'), '02:00')?.toISOString()).toBe('2026-11-20T18:00:00.000Z');
    expect(nextRunAt(new Date('2026-11-20T06:00:00Z'), '02:00')?.toISOString()).toBe('2026-11-20T18:00:00.000Z');
  });

  it('handles times near midnight in Manila and "off"', () => {
    expect(nextRunAt(new Date('2026-11-20T15:30:00Z'), '23:45')?.toISOString()).toBe('2026-11-20T15:45:00.000Z');
    expect(nextRunAt(new Date('2026-11-20T15:30:00Z'), '00:10')?.toISOString()).toBe('2026-11-20T16:10:00.000Z');
    expect(nextRunAt(new Date(), 'off')).toBeNull();
  });
});
