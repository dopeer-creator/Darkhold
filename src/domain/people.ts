import { creditsSummary, splitNames } from './credits';
import { collectionStatus, walk, type Library } from './library';
import { isPeak } from './reviews';
import type { Collection, Issue, Review } from './types';

export type Role = 'writer' | 'artist';

const issueNames = (i: Issue, role: Role) => splitNames(role === 'writer' ? i.writers : i.artists);
const listNames = (c: Collection, role: Role) => splitNames(role === 'writer' ? c.writer : c.artist);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Everyone credited as a writer (or artist), most read first, with how many of their issues you have and have read. */
export function peopleIndex(lib: Library, role: Role): { name: string; issues: number; read: number; lists: number }[] {
  const m = new Map<string, { name: string; issues: number; read: number; lists: number }>();
  const row = (name: string) => {
    const key = name.toLowerCase();
    const r = m.get(key) ?? { name, issues: 0, read: 0, lists: 0 };
    m.set(key, r);
    return r;
  };
  for (const i of lib.issues.values()) {
    for (const n of issueNames(i, role)) {
      const r = row(n);
      r.issues++;
      if (i.status === 'read') r.read++;
    }
  }
  for (const c of lib.collections.values()) for (const n of listNames(c, role)) row(n).lists++;
  return [...m.values()].sort((a, b) => b.read - a.read || b.issues - a.issues || a.name.localeCompare(b.name));
}

/**
 * The lists that are this person's: their name is on the list itself, or (for runs, events and editions)
 * they write or draw most of its issues.
 */
export function personLists(lib: Library, name: string, role: Role): Collection[] {
  return [...lib.collections.values()].filter((c) => {
    if (listNames(c, role).some((n) => same(n, name))) return true;
    if (c.kind === 'crisis' || c.kind === 'era') return false;
    const sum = creditsSummary(lib, c.id);
    return (role === 'writer' ? sum.mainWriters : sum.mainArtists).some((n) => same(n, name));
  });
}

export interface PersonStats {
  lists: Collection[];
  completedLists: number;
  issuesRead: number;
  issuesInApp: number;
  peaks: { collection: Collection; review: Review }[];
  /** Their issues that sit outside their own lists, as short labels ("Batman/Flash #21–22"). */
  alsoIn: string[];
}

export function personStats(lib: Library, name: string, role: Role): PersonStats {
  const lists = personLists(lib, name, role);
  const issues = [...lib.issues.values()].filter((i) => issueNames(i, role).some((n) => same(n, name)));
  const inLists = new Set(lists.flatMap((c) => walk(lib, c.id).map((s) => s.issueId)));
  const outside = issues.filter((i) => !inLists.has(i.id));
  // Group the outside issues by series: "Heroes in Crisis #1–9".
  const bySeries = new Map<string, string[]>();
  for (const i of outside) {
    const list = bySeries.get(i.series_id) ?? [];
    list.push(i.number ?? i.label ?? '?');
    bySeries.set(i.series_id, list);
  }
  const alsoIn = [...bySeries.entries()].map(([sid, nums]) => {
    const s = lib.series.get(sid);
    const sorted = nums.sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    const span = sorted.length > 2 ? `#${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.map((n) => `#${n}`).join(', ');
    return `${s?.title ?? 'Unknown'} ${span}`;
  });
  return {
    lists,
    completedLists: lists.filter((c) => collectionStatus(lib, c.id) === 'completed').length,
    issuesRead: issues.filter((i) => i.status === 'read').length,
    issuesInApp: issues.length,
    peaks: lists
      .map((collection) => ({ collection, review: lib.reviews.get(collection.id) }))
      .filter((x): x is { collection: Collection; review: Review } => !!x.review && isPeak(x.review.verdict))
      .sort((a, b) => (b.review.score ?? 0) - (a.review.score ?? 0)),
    alsoIn,
  };
}
