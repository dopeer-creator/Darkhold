import type { Library } from './library';
import type { Collection, Issue, Series } from './types';

/** Sort key for issue numbers: 0, 1, 2 … 1000, then "1/2", "Annual 1" and other non-numbers, then unnumbered. */
export function numberKey(n: string | null): [number, number, string] {
  if (n == null) return [2, 0, ''];
  const v = Number(n);
  return Number.isFinite(v) ? [0, v, ''] : [1, 0, n.toLowerCase()];
}

export function compareNumbers(a: string | null, b: string | null) {
  const ka = numberKey(a);
  const kb = numberKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
}

export interface SeriesRun {
  collection: Collection;
  /** First and last issue numbers of this series it holds, in number order. */
  first: string | null;
  last: string | null;
  count: number;
  read: number;
}

export interface SeriesView {
  series: Series;
  issues: { issue: Issue; home: Collection | null }[];
  /** Runs (and events) holding issues of this series, in the order their issues come. */
  runs: SeriesRun[];
  read: number;
  total: number;
  /** Whole-number stretches between the lowest and highest issue you have that aren't in your library. */
  gaps: [number, number][];
}

/**
 * Everything about one series, built from the issues you already have: the issues in number order,
 * which run each sits in (a run beats an event; issues in no run have no home), the runs in the order
 * their writers took over, and the numbers missing in between.
 */
export function seriesView(lib: Library, seriesId: string): SeriesView | null {
  const series = lib.series.get(seriesId);
  if (!series) return null;
  const issues = [...lib.issues.values()].filter((i) => i.series_id === seriesId).sort((a, b) => compareNumbers(a.number, b.number));

  const holders = new Map<string, Issue[]>();
  const homeOf = (issue: Issue): Collection | null => {
    const parents = (lib.parents.get(issue.id) ?? []).map((p) => lib.collections.get(p)).filter((c): c is Collection => !!c);
    return parents.find((c) => c.kind === 'run') ?? parents.find((c) => c.kind === 'event') ?? null;
  };
  const rows = issues.map((issue) => {
    const home = homeOf(issue);
    if (home) holders.set(home.id, [...(holders.get(home.id) ?? []), issue]);
    return { issue, home };
  });

  const runs: SeriesRun[] = [...holders.entries()]
    .map(([id, list]) => ({
      collection: lib.collections.get(id)!,
      first: list[0].number,
      last: list[list.length - 1].number,
      count: list.length,
      read: list.filter((i) => i.status === 'read').length,
    }))
    .sort((a, b) => compareNumbers(a.first, b.first));

  const whole = issues.map((i) => Number(i.number)).filter((n) => Number.isInteger(n));
  const have = new Set(whole);
  const gaps: [number, number][] = [];
  if (whole.length) {
    const lo = Math.min(...whole);
    const hi = Math.max(...whole);
    for (let n = lo; n <= hi; n++) {
      if (have.has(n)) continue;
      const start = n;
      while (n + 1 <= hi && !have.has(n + 1)) n++;
      gaps.push([start, n]);
    }
  }

  return { series, issues: rows, runs, read: issues.filter((i) => i.status === 'read').length, total: issues.length, gaps };
}

export function seriesLabel(s: Pick<Series, 'title' | 'volume_year'>) {
  return s.volume_year ? `${s.title} (${s.volume_year})` : s.title;
}
