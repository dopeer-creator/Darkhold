import { collectionStatus, walk, type Library } from './library';
import { isPeak } from './reviews';
import type { Collection, Issue, Review } from './types';

/** Splits "Batman, Robin" into tags, dropping blanks and repeats (case doesn't matter). */
export function splitTags(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of (text ?? '').split(',')) {
    const t = raw.trim();
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

export const joinTags = (tags: string[]) => (tags.length ? splitTags(tags.join(',')).join(', ') : null);

const has = (text: string | null | undefined, name: string) => splitTags(text).some((t) => t.toLowerCase() === name.toLowerCase());

/** Every character or team you've tagged, most used first, with how many lists and issues carry it. */
export function allCharacters(lib: Library): { name: string; lists: number; issues: number }[] {
  const m = new Map<string, { name: string; lists: number; issues: number }>();
  const bump = (text: string | null | undefined, field: 'lists' | 'issues') => {
    for (const t of splitTags(text)) {
      const key = t.toLowerCase();
      const row = m.get(key) ?? { name: t, lists: 0, issues: 0 };
      row[field]++;
      m.set(key, row);
    }
  };
  for (const c of lib.collections.values()) bump(c.characters, 'lists');
  for (const i of lib.issues.values()) bump(i.characters, 'issues');
  return [...m.values()].sort((a, b) => b.lists + b.issues - (a.lists + a.issues) || a.name.localeCompare(b.name));
}

export const listsWith = (lib: Library, name: string): Collection[] => [...lib.collections.values()].filter((c) => has(c.characters, name));
/**
 * Issues tagged with the character, plus untagged issues inside a list tagged with it (issues added
 * later have no tags of their own; issues that do have tags are trusted as they are).
 */
export function issuesWith(lib: Library, name: string): Issue[] {
  const ids = new Set([...lib.issues.values()].filter((i) => has(i.characters, name)).map((i) => i.id));
  for (const c of listsWith(lib, name)) {
    for (const st of walk(lib, c.id)) if (!splitTags(lib.issues.get(st.issueId)?.characters).length) ids.add(st.issueId);
  }
  return [...ids].map((id) => lib.issues.get(id)).filter((i): i is Issue => !!i);
}

export interface CharacterStats {
  lists: number;
  completedLists: number;
  issuesRead: number;
  issuesInApp: number;
  /** Lists you rated Generational or Peak, best first. */
  peaks: { collection: Collection; review: Review }[];
}

/** Counts for a character page. No average score: one great run says more than a mean. */
export function characterStats(lib: Library, name: string): CharacterStats {
  const lists = listsWith(lib, name);
  const issues = issuesWith(lib, name);
  const peaks = lists
    .map((collection) => ({ collection, review: lib.reviews.get(collection.id) }))
    .filter((x): x is { collection: Collection; review: Review } => !!x.review && isPeak(x.review.verdict))
    .sort((a, b) => (b.review.score ?? 0) - (a.review.score ?? 0));
  return {
    lists: lists.length,
    completedLists: lists.filter((c) => collectionStatus(lib, c.id) === 'completed').length,
    issuesRead: issues.filter((i) => i.status === 'read').length,
    issuesInApp: issues.length,
    peaks,
  };
}
