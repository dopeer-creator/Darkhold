import { splitTags } from './characters';
import { splitNames } from './credits';
import { collectionStatus, finishedOn, isNested, reviewDay, todayKey, type Library } from './library';
import type { ReadLog, Review, Verdict } from './types';

export type PeriodKind = 'week' | 'month' | 'year' | 'all';

export interface Period {
  kind: PeriodKind;
  /** First and last day, inclusive ("YYYY-MM-DD"). */
  start: string;
  end: string;
  /** "This week", "November 2026", "2026", "All time". */
  label: string;
  /** Bars for the chart: days of the week or month, months of the year, or years. */
  buckets: { label: string; start: string; end: string }[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (day: string) => new Date(`${day}T12:00:00`);
const plus = (day: string, n: number) => {
  const d = at(day);
  d.setDate(d.getDate() + n);
  return key(d);
};
const short = (day: string) => `${at(day).getDate()} ${MONTHS[at(day).getMonth()].slice(0, 3)}`;

/**
 * A week (Monday to Sunday), month or year, `back` steps before the current one; or all time, from the
 * first dated read. Never runs past today.
 */
export function periodFor(kind: PeriodKind, back: number, readLog: ReadLog[], today = todayKey()): Period {
  if (kind === 'week') {
    const t = at(today);
    const monday = plus(today, -((t.getDay() + 6) % 7) - back * 7);
    const days = Array.from({ length: 7 }, (_, i) => plus(monday, i));
    const label = back === 0 ? 'This week' : back === 1 ? 'Last week' : `Week of ${short(monday)}`;
    return { kind, start: monday, end: days[6], label, buckets: days.map((d, i) => ({ label: 'MTWTFSS'[i], start: d, end: d })) };
  }
  if (kind === 'month') {
    const t = at(today);
    const first = new Date(t.getFullYear(), t.getMonth() - back, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const days = Array.from({ length: last.getDate() }, (_, i) => key(new Date(first.getFullYear(), first.getMonth(), i + 1)));
    return {
      kind, start: key(first), end: key(last), label: `${MONTHS[first.getMonth()]} ${first.getFullYear()}`,
      buckets: days.map((d, i) => ({ label: i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : '', start: d, end: d })),
    };
  }
  if (kind === 'year') {
    const y = Number(today.slice(0, 4)) - back;
    return {
      kind, start: `${y}-01-01`, end: `${y}-12-31`, label: String(y),
      buckets: MONTHS.map((m, i) => ({ label: m[0], start: `${y}-${pad(i + 1)}-01`, end: key(new Date(y, i + 1, 0)) })),
    };
  }
  const years = readLog.map((l) => l.read_on?.slice(0, 4)).filter((y): y is string => !!y).map(Number);
  const from = years.length ? Math.min(...years) : Number(today.slice(0, 4));
  const to = Number(today.slice(0, 4));
  return {
    kind, start: `${from}-01-01`, end: `${to}-12-31`, label: 'All time',
    buckets: Array.from({ length: to - from + 1 }, (_, i) => ({ label: String(from + i).slice(2), start: `${from + i}-01-01`, end: `${from + i}-12-31` })),
  };
}

export interface Recap {
  period: Period;
  /** Every dated read in the period, first reads and rereads together. */
  issuesRead: number;
  firstReads: number;
  rereads: number;
  perBucket: number[];
  listsFinished: { id: string; title: string }[];
  topCharacters: { name: string; count: number }[];
  topWriters: { name: string; count: number }[];
  reviews: Review[];
  verdicts: Record<Verdict, number>;
  best: Review | null;
}

const top = (counts: Map<string, number>, n = 5) =>
  [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([name, count]) => ({ name, count }));

/** What you read in a period: counts, the chart, top characters and writers, finished lists and reviews. */
export function recapFor(lib: Library, readLog: ReadLog[], period: Period): Recap {
  const inside = (day: string | null | undefined) => !!day && day >= period.start && day <= period.end;
  const reads = readLog.filter((l) => inside(l.read_on) && lib.issues.has(l.issue_id));
  const chars = new Map<string, number>();
  const writers = new Map<string, number>();
  for (const l of reads) {
    const issue = lib.issues.get(l.issue_id)!;
    for (const c of splitTags(issue.characters)) chars.set(c, (chars.get(c) ?? 0) + 1);
    for (const w of splitNames(issue.writers)) writers.set(w, (writers.get(w) ?? 0) + 1);
  }
  const reviews = [...lib.reviews.values()].filter(
    (r) => (r.collection_id ? lib.collections.has(r.collection_id) : !!r.issue_id && lib.issues.has(r.issue_id)) && (period.kind === 'all' || inside(reviewDay(lib, r))),
  );
  const verdicts: Record<Verdict, number> = { bad: 0, forgettable: 0, good_enough: 0, generational: 0, peak: 0 };
  for (const r of reviews) verdicts[r.verdict]++;
  const listsFinished = [...lib.collections.values()]
    .filter((c) => !isNested(lib, c.id) && collectionStatus(lib, c.id) === 'completed' && inside(finishedOn(lib, c.id)))
    .map((c) => ({ id: c.id, title: c.title }));
  return {
    period,
    issuesRead: reads.length,
    firstReads: reads.filter((l) => !l.reread).length,
    rereads: reads.filter((l) => l.reread).length,
    perBucket: period.buckets.map((b) => reads.filter((l) => l.read_on! >= b.start && l.read_on! <= b.end).length),
    listsFinished,
    topCharacters: top(chars),
    topWriters: top(writers),
    reviews,
    verdicts,
    best: [...reviews].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0] ?? null,
  };
}
