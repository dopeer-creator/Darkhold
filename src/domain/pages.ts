import { finishedOn, shownProgress, type Library } from './library';
import type { PageLog } from './types';

/** "2026-11-20" moved by n days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Days from a to b, counting both ("2026-07-20" to "2026-07-21" is 2). */
export const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000) + 1;

const logOf = (lib: Library, id: string): PageLog[] => lib.pageLog.get(id) ?? [];

/** The page you're on: the last one you logged (all of it once the book is finished). */
export function pageNow(lib: Library, id: string): number {
  const total = lib.collections.get(id)?.pages_total ?? null;
  if (total && finishedOn(lib, id)) return total;
  const log = logOf(lib, id);
  return log.length ? log[log.length - 1].page : 0;
}

export interface BookProgress {
  page: number;
  /** Pages in your copy, or null while you don't know. */
  total: number | null;
  /** 0–100. */
  pct: number;
  left: number | null;
}

export function bookProgress(lib: Library, id: string): BookProgress {
  const total = lib.collections.get(id)?.pages_total ?? null;
  const done = !!finishedOn(lib, id);
  const page = pageNow(lib, id);
  if (!total) return { page, total: null, pct: done ? 100 : 0, left: null };
  const shown = Math.min(page, total);
  return { page: shown, total, pct: done ? 100 : Math.round((shown / total) * 100), left: total - shown };
}

/** One day of reading: from the page you were on to the page you got to. */
export interface Session {
  id: string;
  day: string;
  from: number;
  to: number;
  pages: number;
  /** The page you were already on when you started tracking (counts as no pages read). */
  start: boolean;
}

/** Every day you logged a page, newest first. */
export function sessions(lib: Library, id: string): Session[] {
  let at = 0;
  const out: Session[] = [];
  for (const l of logOf(lib, id)) {
    out.push({ id: l.id, day: l.read_on, from: at, to: l.page, pages: l.start ? 0 : Math.max(0, l.page - at), start: !!l.start });
    at = l.page;
  }
  return out.reverse();
}

export interface PageStats {
  /** Pages in the 7 days up to today. */
  thisWeek: number;
  /** Pages a day, on the days you read. */
  perDay: number;
  /** Days you read any pages. */
  daysReading: number;
  /** Pages each day for the last 14 days, oldest first, today last. */
  last14: number[];
  /** When you'd finish at your pace, or null. */
  eta: string | null;
}

export function pageStats(lib: Library, id: string, today: string): PageStats {
  const list = sessions(lib, id).filter((x) => x.pages > 0);
  const byDay = new Map(list.map((x) => [x.day, x.pages]));
  const last14 = Array.from({ length: 14 }, (_, i) => byDay.get(addDays(today, i - 13)) ?? 0);
  const weekStart = addDays(today, -6);
  const thisWeek = list.filter((x) => x.day >= weekStart && x.day <= today).reduce((n, x) => n + x.pages, 0);
  const sum = list.reduce((n, x) => n + x.pages, 0);
  const perDay = list.length ? Math.round(sum / list.length) : 0;
  const { left } = bookProgress(lib, id);
  const eta = left && perDay && !finishedOn(lib, id) ? addDays(today, Math.ceil(left / perDay)) : null;
  return { thisWeek, perDay, daysReading: list.length, last14, eta };
}

/** For a finished book's review: the day you started (first page logged) and finished, and how many days that took. */
export function readingSpan(lib: Library, id: string): { start: string | null; end: string | null; days: number | null } {
  const end = finishedOn(lib, id);
  const start = logOf(lib, id).find((l) => !l.start)?.read_on ?? null;
  return { start, end, days: start && end && end >= start ? daysBetween(start, end) : null };
}

/** The mood words a book review offers. */
export const MOODS = ['Adventurous', 'Dark', 'Emotional', 'Funny', 'Hopeful', 'Inspiring', 'Lighthearted', 'Mysterious', 'Reflective', 'Romantic', 'Sad', 'Tense', 'Political', 'Spicy'];
export const PACES = [
  { key: 'slow', label: 'Slow pace' },
  { key: 'medium', label: 'Medium pace' },
  { key: 'fast', label: 'Fast pace' },
] as const;
export const splitMoods = (m: string | null | undefined) => (m ? m.split(',').map((x) => x.trim()).filter(Boolean) : []);

/** A book read by page (not a book series, not a comic or manga). */
export const isPageBook = (c: { format?: string | null; kind: string } | undefined | null) => !!c && c.format === 'book' && c.kind !== 'crisis';

/** For shelf cards: a bar's read/total and a short line. Books by page ("p. 245 / 416"), everything else by issue or chapter. */
export function shelfProgress(lib: Library, id: string, issuesWord = 'issues'): { read: number; total: number; label: string } {
  const c = lib.collections.get(id);
  if (isPageBook(c)) {
    const b = bookProgress(lib, id);
    const label = finishedOn(lib, id) ? 'Finished' : !b.page ? (b.total ? `${b.total} pages` : 'Not started') : b.total ? `p. ${b.page} / ${b.total}` : `p. ${b.page}`;
    return { read: b.total ? b.page : 0, total: b.total ?? 0, label };
  }
  const p = shownProgress(lib, id);
  return { read: p.read, total: p.total, label: `${p.read} / ${p.total} ${issuesWord}` };
}

/** Pages read across every book on or after a day (for Home's "Pages this week"). */
export function pagesSince(lib: Library, fromDay: string): number {
  let n = 0;
  for (const id of lib.pageLog.keys()) for (const s of sessions(lib, id)) if (s.day >= fromDay) n += s.pages;
  return n;
}
