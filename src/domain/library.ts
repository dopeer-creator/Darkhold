import type { Collection, CollectionStatus, Entry, Issue, Kind, Link, LinkKind, Series } from './types';

/** Types whose lines show which run or event each issue belongs to, worked out automatically. */
export const READING_KINDS: Kind[] = ['crisis', 'era'];
/** When an issue sits in several lists, the one a reading order shows it as part of: the most specific story first. */
const PART_OF_RANK: Kind[] = ['event', 'arc', 'run'];

/** An in-memory snapshot of everything, indexed for the tree walks below. */
export interface Library {
  series: Map<string, Series>;
  issues: Map<string, Issue>;
  collections: Map<string, Collection>;
  /** Children of each collection, sorted by position. */
  children: Map<string, Entry[]>;
  /** Collections each collection or issue sits inside. */
  parents: Map<string, string[]>;
  /** For a run or event: the collections that hold slices of it (a crisis reading order). */
  slicedInto: Map<string, string[]>;
  /** Connections between lists and issues that aren't "inside" (follows, background, tie-in). */
  links: Link[];
}

export function buildLibrary(rows: {
  series: Series[];
  issues: Issue[];
  collections: Collection[];
  entries: Entry[];
  links?: Link[];
}): Library {
  const children = new Map<string, Entry[]>();
  const parents = new Map<string, string[]>();
  const slicedInto = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key) ?? [];
    if (!list.includes(value)) map.set(key, [...list, value]);
  };
  const collections = new Map(rows.collections.map((c) => [c.id, c]));
  const all: Entry[] = [];
  for (const raw of rows.entries) {
    const e: Entry = { ...raw, via_collection_id: raw.via_collection_id ?? null, optional: !!raw.optional };
    all.push(e);
    const list = children.get(e.parent_id) ?? [];
    list.push(e);
    children.set(e.parent_id, list);
    const child = e.child_issue_id ?? e.child_collection_id;
    if (child) add(parents, child, e.parent_id);
  }
  for (const list of children.values()) list.sort((a, b) => a.position - b.position);
  // "Part of": a pinned list wins; in a reading order, otherwise the event or run the issue is in.
  for (const e of all) {
    const pinned = e.via_collection_id && e.via_collection_id !== e.parent_id && collections.has(e.via_collection_id) ? e.via_collection_id : null;
    e.part_of = pinned ?? (e.child_issue_id ? homeFor(collections, parents, e.parent_id, e.child_issue_id) : null);
    if (e.part_of) add(slicedInto, e.part_of, e.parent_id);
  }
  return {
    series: new Map(rows.series.map((s) => [s.id, s])),
    issues: new Map(rows.issues.map((i) => [i.id, i])),
    collections,
    children,
    parents,
    slicedInto,
    links: rows.links ?? [],
  };
}

/** In a reading order: the event (else arc, else run) an issue line belongs to, or null. */
function homeFor(collections: Map<string, Collection>, parents: Map<string, string[]>, parentId: string, issueId: string): string | null {
  const parent = collections.get(parentId);
  if (!parent || !READING_KINDS.includes(parent.kind)) return null;
  const homes = (parents.get(issueId) ?? []).filter((p) => p !== parentId && collections.has(p));
  for (const kind of PART_OF_RANK) {
    const hit = homes.find((p) => collections.get(p)!.kind === kind);
    if (hit) return hit;
  }
  return null;
}

/** True when a collection sits inside another one, whole or as slices. */
export function isNested(lib: Library, id: string): boolean {
  return (lib.parents.get(id) ?? []).length > 0 || (lib.slicedInto.get(id) ?? []).length > 0;
}

/** One issue in reading order, with the collections that lead to it (outermost first). */
export interface Step {
  issueId: string;
  path: string[];
  /** The run or event this issue is a slice of, when it sits in a crisis reading order. */
  via: string | null;
  /** On an optional line (or inside one): shown, but not counted toward progress. */
  optional: boolean;
  /** Not out yet: shown, skipped by Next up, left out of the counts. */
  upcoming: boolean;
}

/** Every issue under a collection in reading order. An issue linked twice appears twice. */
export function walk(lib: Library, rootId: string): Step[] {
  const out: Step[] = [];
  const onPath = new Set<string>();
  const visit = (id: string, path: string[], optional: boolean) => {
    if (onPath.has(id)) return;
    onPath.add(id);
    const here = [...path, id];
    for (const e of lib.children.get(id) ?? []) {
      if (e.child_issue_id) {
        const issue = lib.issues.get(e.child_issue_id);
        if (issue) out.push({ issueId: e.child_issue_id, path: here, via: e.part_of ?? null, optional: optional || !!e.optional, upcoming: notOutYet(issue) });
      } else if (e.child_collection_id && lib.collections.has(e.child_collection_id)) {
        visit(e.child_collection_id, here, optional || !!e.optional);
      }
    }
    onPath.delete(id);
  };
  visit(rootId, [], false);
  return out;
}

export interface Progress {
  read: number;
  total: number;
  left: number;
  /** Issues in the list that aren't out yet; not in total or left. */
  upcoming: number;
}

/** Today as "YYYY-MM-DD", local time. */
export function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * True while an announced issue can't be read yet. It stops being "not out yet" by itself once its
 * release day (or the first of its release month) has come, or once it's read or being read.
 */
export function notOutYet(issue: Issue, today = todayKey()): boolean {
  if (!issue.upcoming || issue.status !== 'unread') return false;
  if (!issue.release_on) return true;
  const day = issue.release_on.length === 7 ? `${issue.release_on}-01` : issue.release_on;
  return day > today;
}

/** Counts each issue once, however many times it is linked inside the collection. Optional lines don't count. */
export function progress(lib: Library, rootId: string): Progress {
  const seen = new Set<string>();
  const later = new Set<string>();
  let read = 0;
  for (const s of walk(lib, rootId)) {
    if (s.optional || seen.has(s.issueId) || later.has(s.issueId)) continue;
    if (s.upcoming) {
      later.add(s.issueId);
      continue;
    }
    seen.add(s.issueId);
    if (lib.issues.get(s.issueId)!.status === 'read') read++;
  }
  return { read, total: seen.size, left: seen.size - read, upcoming: later.size };
}

/** Where to pick up: an issue marked "currently reading" wins, else the first unread one in order. Optional lines are skipped. */
export function nextUp(lib: Library, rootId: string): Step | null {
  const steps = walk(lib, rootId).filter((s) => !s.optional && !s.upcoming);
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
  if (p.total > 0 && p.read === p.total && p.upcoming === 0 && !hasEmptyPart(lib, id)) return 'completed';
  if (c?.on_hold) return 'on_hold';
  // Only lists you switched to "Reading now" are active. Issues read elsewhere (in an event, say) still
  // tick off here, but they don't start the list.
  if (c?.reading_now) return 'reading';
  // You choose Reading and On hold yourself. Everything else waits on Plan to read, even if a few of its
  // issues are read already because they were part of something else.
  return 'planned';
}


/** Why a list can't go inside another, or null if it can: any list can hold any other, but never itself. Mirrors the database trigger. */
export function cannotNest(lib: Library, parentId: string, childId: string): string | null {
  const parent = lib.collections.get(parentId);
  const child = lib.collections.get(childId);
  if (!parent || !child) return 'Not found';
  const stack = [childId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === parentId) return 'That would put a list inside itself';
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of lib.children.get(id) ?? []) if (e.child_collection_id) stack.push(e.child_collection_id);
  }
  return null;
}

/** Whether lines of one list can be shown as part of another: any two different lists. */
export function canSlice(lib: Library, parentId: string, viaId: string): boolean {
  return lib.collections.has(parentId) && lib.collections.has(viaId) && parentId !== viaId;
}

/** Collections being read that aren't already inside (or sliced into) another collection being read. */
export function activeRoots(lib: Library): string[] {
  return rootsWithStatus(lib, 'reading');
}

/** Lists with a status that aren't already inside (or sliced into) another list with that status: the ones to show on Home. */
export function rootsWithStatus(lib: Library, status: CollectionStatus): string[] {
  const reading = new Set([...lib.collections.keys()].filter((id) => collectionStatus(lib, id) === status));
  const covered = new Set<string>();
  for (const id of reading) {
    for (const s of walk(lib, id)) {
      s.path.slice(1).forEach((p) => covered.add(p));
      if (s.via) covered.add(s.via);
    }
  }
  // A list that only has its status because of what's in it (no switch, hold or Plan to read of its own)
  // isn't shown on its own when it sits inside another list, like a run inside a reading order.
  const own = (id: string) => {
    const c = lib.collections.get(id)!;
    return status === 'reading' ? !!c.reading_now : status === 'on_hold' ? !!c.on_hold : status === 'planned' ? !!c.planned : true;
  };
  return [...reading].filter((id) => !covered.has(id) && (own(id) || !isNested(lib, id)));
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
    for (const s of walk(lib, id)) if (!s.optional && !s.upcoming && lib.issues.get(s.issueId)!.status !== 'read') left.add(s.issueId);
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

/** One movable piece of a collection's list: an inner run/event, one issue, or a slice block of a run/event. */
export interface Unit {
  key: string;
  entryIds: string[];
  kind: 'collection' | 'issue' | 'slice' | 'heading';
  /** The inner collection, or the run/event a slice belongs to. */
  collectionId: string | null;
}

/** Splits a collection's lines into the pieces "Edit order" moves around. Consecutive slices of one run stay together. */
export function entryUnits(lib: Library, parentId: string): Unit[] {
  const entries = lib.children.get(parentId) ?? [];
  const units: Unit[] = [];
  for (const e of entries) {
    if (e.heading) {
      units.push({ key: e.id, entryIds: [e.id], kind: 'heading', collectionId: null });
      continue;
    }
    const via = e.part_of ?? null;
    const last = units[units.length - 1];
    if (via && last?.kind === 'slice' && last.collectionId === via) {
      last.entryIds.push(e.id);
    } else if (via) {
      units.push({ key: e.id, entryIds: [e.id], kind: 'slice', collectionId: via });
    } else if (e.child_collection_id) {
      units.push({ key: e.id, entryIds: [e.id], kind: 'collection', collectionId: e.child_collection_id });
    } else {
      units.push({ key: e.id, entryIds: [e.id], kind: 'issue', collectionId: null });
    }
  }
  return units;
}

/** The entry ids in order after moving one unit to a new index. */
export function moveUnit(units: Unit[], from: number, to: number): string[] {
  const next = [...units];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next.flatMap((u) => u.entryIds);
}

/** A collection's cover: its own, else the first issue in reading order that has one. */
export function coverFor(lib: Library, collectionId: string): string | null {
  const c = lib.collections.get(collectionId);
  if (c?.cover_path) return c.cover_path;
  // A reading order builds to its finale, so it wears its last event's cover (Secret Wars, Armageddon…).
  if (c && READING_KINDS.includes(c.kind)) {
    const entries = lib.children.get(collectionId) ?? [];
    for (let k = entries.length - 1; k >= 0; k--) {
      const target = lib.collections.get(entries[k].child_collection_id ?? entries[k].part_of ?? '');
      if (target?.kind !== 'event') continue;
      const cover = coverFor(lib, target.id);
      if (cover) return cover;
      break;
    }
  }
  for (const s of walk(lib, collectionId)) {
    const cover = lib.issues.get(s.issueId)?.cover_path;
    if (cover) return cover;
  }
  return null;
}

/** Progress of each chapter heading's section: the lines after it, up to the next heading. */
export function headingSections(lib: Library, parentId: string): Map<string, { read: number; total: number; issueIds: Set<string> }> {
  const out = new Map<string, { read: number; total: number; issueIds: Set<string> }>();
  let current: { read: number; total: number; issueIds: Set<string> } | null = null;
  for (const e of lib.children.get(parentId) ?? []) {
    if (e.heading) {
      current = { read: 0, total: 0, issueIds: new Set() };
      out.set(e.id, current);
      continue;
    }
    if (!current || e.optional) continue;
    const ids = e.child_issue_id ? [e.child_issue_id] : e.child_collection_id ? walk(lib, e.child_collection_id).map((s) => s.issueId) : [];
    for (const id of ids) {
      if (current.issueIds.has(id) || !lib.issues.has(id) || notOutYet(lib.issues.get(id)!)) continue;
      current.issueIds.add(id);
      current.total++;
      if (lib.issues.get(id)!.status === 'read') current.read++;
    }
  }
  return out;
}

export interface Connection {
  link: Link;
  /** The other end, as a list or an issue. */
  collectionId: string | null;
  issueId: string | null;
}

/** What a connection reads as, seen from this side. */
export type ConnectionGroup = 'before' | 'next' | 'background' | 'background_for' | 'tie_in_of' | 'tie_ins';

export const CONNECTION_TITLE: Record<ConnectionGroup, string> = {
  before: 'Before this',
  next: 'What’s next',
  background: 'Background',
  background_for: 'Background for',
  tie_in_of: 'Tie-in of',
  tie_ins: 'Tie-ins',
};

const GROUP_OF: Record<LinkKind, [ConnectionGroup, ConnectionGroup]> = {
  follows: ['before', 'next'],
  background: ['background', 'background_for'],
  tie_in: ['tie_in_of', 'tie_ins'],
};

/** A list's or issue's connections, grouped as they read from its side ("Before this: Armageddon"). */
export function connections(lib: Library, end: { collectionId?: string; issueId?: string }): Map<ConnectionGroup, Connection[]> {
  const out = new Map<ConnectionGroup, Connection[]>();
  const push = (g: ConnectionGroup, c: Connection) => out.set(g, [...(out.get(g) ?? []), c]);
  const exists = (collectionId: string | null, issueId: string | null) => (collectionId ? lib.collections.has(collectionId) : !!issueId && lib.issues.has(issueId));
  for (const link of lib.links) {
    const [mine, theirs] = GROUP_OF[link.kind];
    const isFrom = end.collectionId ? link.from_collection_id === end.collectionId : !!end.issueId && link.from_issue_id === end.issueId;
    const isTo = end.collectionId ? link.to_collection_id === end.collectionId : !!end.issueId && link.to_issue_id === end.issueId;
    if (isFrom && exists(link.to_collection_id, link.to_issue_id)) push(mine, { link, collectionId: link.to_collection_id, issueId: link.to_issue_id });
    if (isTo && exists(link.from_collection_id, link.from_issue_id)) push(theirs, { link, collectionId: link.from_collection_id, issueId: link.from_issue_id });
  }
  return out;
}
