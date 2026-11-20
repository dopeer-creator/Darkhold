import type { ReleaseEvery } from './types';

/** "1-48", "1–30, 30.5, 31" → the chapter numbers. */
export function parseChapterRange(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (m) {
      const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
      if (b >= a && b - a <= 3000) for (let n = a; n <= b; n++) out.push(String(n));
    } else if (/^\d+(\.\d+)?$/.test(part)) out.push(part);
  }
  return [...new Set(out)];
}

const STEP_DAYS: Record<ReleaseEvery, number> = { weekly: 7, biweekly: 14, monthly: 0 };
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** One step of a schedule after `day`. */
export function stepDay(day: string, every: ReleaseEvery, times = 1): string {
  const d = new Date(`${day}T12:00:00`);
  if (every === 'monthly') d.setMonth(d.getMonth() + times);
  else d.setDate(d.getDate() + STEP_DAYS[every] * times);
  return iso(d);
}
/** The first day of the schedule after today (or today itself when `orToday`). */
export function nextOnOrAfter(anchor: string, every: ReleaseEvery, from: string, orToday = false): string {
  let d = anchor;
  for (let k = 0; k < 600 && (orToday ? d < from : d <= from); k++) d = stepDay(d, every);
  return d;
}

