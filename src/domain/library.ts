import type { Collection, CollectionStatus, Entry, Issue, Kind, Series } from './types';

/** An in-memory snapshot of everything, indexed for the tree walks below. */
export interface Library {
  series: Map<string, Series>;
  issues: Map<string, Issue>;
  collections: Map<string, Collection>;
  /** Children of each collection, sorted by position. */
  children: Map<string, Entry[]>;
  /** Collections each collection or issue sits inside. */
  parents: Map<string, string[]>;
}

export function buildLibrary(rows: {
  series: Series[];
  issues: Issue[];
  collections: Collection[];
  entries: Entry[];
}): Library {
  const children = new Map<string, Entry[]>();
  const parents = new Map<string, string[]>();
  for (const e of rows.entries) {
    const list = children.get(e.parent_id) ?? [];
    list.push(e);
    children.set(e.parent_id, list);
    const child = e.child_issue_id ?? e.child_collection_id!;
    parents.set(child, [...(parents.get(child) ?? []), e.parent_id]);
  }
  for (const list of children.values()) list.sort((a, b) => a.position - b.position);
  return {
    series: new Map(rows.series.map((s) => [s.id, s])),
    issues: new Map(rows.issues.map((i) => [i.id, i])),
    collections: new Map(rows.collections.map((c) => [c.id, c])),
    children,
    parents,
  };
}

/** One issue in reading order, with the collections that lead to it (outermost first). */
export interface Step {
  issueId: string;
  path: string[];
}

/** Every issue under a collection in reading order. An issue linked twice appears twice. */
export function walk(lib: Library, rootId: string): Step[] {
  const out: Step[] = [];
  const onPath = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (onPath.has(id)) return;
    onPath.add(id);
    const here = [...path, id];
    for (const e of lib.children.get(id) ?? []) {
      if (e.child_issue_id) {
        if (lib.issues.has(e.child_issue_id)) out.push({ issueId: e.child_issue_id, path: here });
      } else if (e.child_collection_id && lib.collections.has(e.child_collection_id)) {
        visit(e.child_collection_id, here);
      }
    }
    onPath.delete(id);
  };
  visit(rootId, []);
  return out;
}

export interface Progress {
  read: number;
  total: number;
  left: number;
}

/** Counts each issue once, however many times it is linked inside the collection. */
export function progress(lib: Library, rootId: string): Progress {
  const seen = new Set<string>();
  let read = 0;
  for (const s of walk(lib, rootId)) {
    if (seen.has(s.issueId)) continue;
    seen.add(s.issueId);
    if (lib.issues.get(s.issueId)!.status === 'read') read++;
  }
  return { read, total: seen.size, left: seen.size - read };
}

/** Where to pick up: an issue marked "currently reading" wins, else the first unread one in order. */
export function nextUp(lib: Library, rootId: string): Step | null {
  const steps = walk(lib, rootId);
  return (
    steps.find((s) => lib.issues.get(s.issueId)!.status === 'reading') ??
    steps.find((s) => lib.issues.get(s.issueId)!.status === 'unread') ??
    null
  );
}

/** The most recently dated read issue; without dates, the last read one in order. */
export function lastRead(lib: Library, rootId: string): Step | null {
  let best: Step | null = null;
  let bestDate = '';
  for (const s of walk(lib, rootId)) {
    const issue = lib.issues.get(s.issueId)!;
    if (issue.status !== 'read') continue;
    const date = issue.completed_at ?? '';
    if (date >= bestDate) {
      best = s;
      bestDate = date;
    }
  }
  return best;
}

/** True when some collection inside this one has no issues yet, e.g. a crisis part still to be filled in. */
export function hasEmptyPart(lib: Library, id: string): boolean {
  return (lib.children.get(id) ?? []).some(
    (e) => e.child_collection_id != null && (progress(lib, e.child_collection_id).total === 0 || hasEmptyPart(lib, e.child_collection_id)),
  );
}

export function collectionStatus(lib: Library, id: string): CollectionStatus {
  const c = lib.collections.get(id);
  const p = progress(lib, id);
  if (p.total > 0 && p.read === p.total && !hasEmptyPart(lib, id)) return 'completed';
  if (c?.on_hold) return 'on_hold';
  if (p.read > 0 || walk(lib, id).some((s) => lib.issues.get(s.issueId)!.status === 'reading')) return 'reading';
  return 'not_started';
}

const ALLOWED: Record<Kind, Kind[]> = { crisis: ['run', 'event'], run: ['event'], event: [] };

/** Why a collection can't go inside another, or null if it can. Mirrors the database trigger. */
export function cannotNest(lib: Library, parentId: string, childId: string): string | null {
  const parent = lib.collections.get(parentId);
  const child = lib.collections.get(childId);
  if (!parent || !child) return 'Not found';
  if (parent.kind === 'event') return 'An event can only hold issues';
  if (!ALLOWED[parent.kind].includes(child.kind)) {
    return child.kind === 'crisis' ? 'A crisis cannot go inside another collection' : 'A run can hold events and issues only';
  }
  const stack = [childId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === parentId) return 'That would put a collection inside itself';
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of lib.children.get(id) ?? []) if (e.child_collection_id) stack.push(e.child_collection_id);
  }
  return null;
}

/** Collections being read that aren't already inside another collection being read. */
export function activeRoots(lib: Library): string[] {
  const reading = new Set([...lib.collections.keys()].filter((id) => collectionStatus(lib, id) === 'reading'));
  const covered = new Set<string>();
  for (const id of reading) for (const s of walk(lib, id)) s.path.slice(1).forEach((p) => covered.add(p));
  return [...reading].filter((id) => !covered.has(id));
}

export interface Stats {
  issuesRead: number;
  issuesLeft: number;
  reading: number;
  completed: number;
}

/** Home screen totals. Every number counts an issue once, wherever it is linked. */
export function stats(lib: Library): Stats {
  const roots = activeRoots(lib);
  const left = new Set<string>();
  for (const id of roots) {
    for (const s of walk(lib, id)) if (lib.issues.get(s.issueId)!.status !== 'read') left.add(s.issueId);
  }
  let completed = 0;
  for (const id of lib.collections.keys()) if (collectionStatus(lib, id) === 'completed') completed++;
  return {
    issuesRead: [...lib.issues.values()].filter((i) => i.status === 'read').length,
    issuesLeft: left.size,
    reading: roots.length,
    completed,
  };
}

export function issueTitle(lib: Library, issueId: string): string {
  const issue = lib.issues.get(issueId);
  if (!issue) return '';
  const series = lib.series.get(issue.series_id);
  const name = series ? series.title : 'Unknown series';
  if (issue.number == null) return issue.label ?? name;
  return `${name} #${issue.number}`;
}

/** A position that sorts between two neighbours, so reordering touches one row. */
export function positionBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return 1024;
  if (before == null) return after! - 1024;
  if (after == null) return before + 1024;
  return (before + after) / 2;
}
