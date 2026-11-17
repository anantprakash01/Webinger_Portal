/**
 * Business-hours arithmetic in India Standard Time (UTC+05:30, no daylight saving).
 * BACKEND: the same rules decide response deadlines; use java.time with ZoneId "Asia/Kolkata".
 */
import type { PortalSettings } from '@/types';

const IST = 330 * 60_000;
const DAY = 86_400_000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Hours = PortalSettings['businessHours'];

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
/** Start of the IST calendar day containing `ms`, as an epoch time. */
const istMidnight = (ms: number) => Math.floor((ms + IST) / DAY) * DAY - IST;
const istDay = (ms: number) => new Date(ms + IST).getUTCDay();

export function isOpenAt(ms: number, h: Hours): boolean {
  if (!h.days.includes(istDay(ms))) return false;
  const m = (ms - istMidnight(ms)) / 60_000;
  return m >= minutes(h.open) && m < minutes(h.close);
}

/** The next moment the team is working (now, if open). */
export function nextOpen(ms: number, h: Hours): number {
  if (isOpenAt(ms, h)) return ms;
  for (let k = 0; k < 8; k++) {
    const mid = istMidnight(ms) + k * DAY;
    const open = mid + minutes(h.open) * 60_000;
    if (h.days.includes(istDay(mid + 1)) && open > ms) return open;
  }
  return ms;
}

/** `start` plus `hours` of working time. Time outside business hours does not count. */
export function addBusinessHours(start: number, hours: number, h: Hours): number {
  let left = hours * 3_600_000;
  let cursor = nextOpen(start, h);
  for (let guard = 0; guard < 400; guard++) {
    const close = istMidnight(cursor) + minutes(h.close) * 60_000;
    const available = close - cursor;
    if (left <= available) return cursor + left;
    left -= available;
    cursor = nextOpen(close, h);
  }
  return cursor;
}

/** "Mon–Sat, 10:00–19:00 IST" */
export function hoursText(h: Hours): string {
  const days = [...h.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first
  const runs: number[][] = [];
  for (const d of days) {
    const last = runs[runs.length - 1];
    if (last && (last[last.length - 1] + 1) % 7 === d) last.push(d);
    else runs.push([d]);
  }
  const dayText = runs.map((r) => (r.length > 2 ? `${DAY_NAMES[r[0]]}–${DAY_NAMES[r[r.length - 1]]}` : r.map((d) => DAY_NAMES[d]).join(', '))).join(', ');
  return `${dayText}, ${h.open}–${h.close} IST`;
}
