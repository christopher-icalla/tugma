/** Daily schedule times are Manila wall-clock times (UTC+8, no daylight saving). */
const MANILA_OFFSET = 8 * 3_600_000;
const DAY = 86_400_000;

/** The next instant after `now` at `hhmm` Manila time, or null when the schedule is "off". */
export function nextRunAt(now: Date, hhmm: string): Date | null {
  if (hhmm === 'off') return null;
  const [h, m] = hhmm.split(':').map(Number);
  const manilaMidnight = Math.floor((now.getTime() + MANILA_OFFSET) / DAY) * DAY - MANILA_OFFSET;
  let next = manilaMidnight + (h * 60 + m) * 60_000;
  if (next <= now.getTime()) next += DAY;
  return new Date(next);
}
