import { READING_KINDS, walk, type Library } from './library';
import type { Collection, Kind } from './types';

/**
 * A tree is a reading order drawn as a map, worked out from what's already in the library:
 *
 * - Main line: the reading order, then every reading order that follows it ("Spider-Man 1" → "Spider-Man 7").
 *   Each of those is a part. Its stops are the runs and events you pass through, in reading order, each once.
 * - Branch: a stop whose lines are all optional. It hangs off the main line.
 * - Side line: another reading order that shares two or more stops with the tree (The Symbiote Saga in
 *   Spider-Man's). It runs alongside, touches the main line where they share a stop, and shows its own
 *   stops in between.
 * - Door: another reading order that shares just one stop (Secret Wars → X-Men 4), or is linked to a part
 *   as its background, what comes before it, or what comes next. If that reading order is in a tree of its
 *   own, the door opens that tree.
 *
 * Nothing about a tree is stored except its name on the first part, so it grows as the library does.
 */

export interface Door {
  /** The reading order or list on the other side. */
  id: string;
  title: string;
  /** The tree that reading order is part of, if any: the door opens that tree. */
  treeId: string | null;
}

export interface TreeStop {
  id: string;
  kind: Kind;
  title: string;
  year: number | null;
  /** Lines it takes up in the tree's reading orders (issues, or whole lists counted by their issues). */
  issues: number;
  /** Every line of it is optional: drawn as a branch. */
  optional: boolean;
  doors: Door[];
}

export type TreeRow =
  | { type: 'part'; id: string; title: string; number: number }
  | { type: 'stop'; stop: TreeStop; joins: number[] }
  | { type: 'side'; line: number; stop: TreeStop }
  /** A side line's stories before its first or after its last shared one, folded into one row. */
  | { type: 'more'; line: number; count: number; door: Door };

export interface SideLine {
  id: string;
  title: string;
  treeId: string | null;
  /** How many stops it shares with the tree. */
  shared: number;
}

export interface Tree {
  id: string;
  name: string;
  parts: string[];
  rows: TreeRow[];
  sides: SideLine[];
  /** Read before the tree, or as its background. */
  before: Door[];
  /** What follows the last part. */
  after: Door[];
  years: [number, number] | null;
  stops: number;
}

/** At most this many side lines; any more sharing reading orders become doors. */
const MAX_SIDES = 2;
/** A side line shows this many of its own stories before its first and after its last shared one; more fold up. */
const MAX_TAIL = 2;

const isReadingOrder = (c: Collection | undefined): c is Collection => !!c && READING_KINDS.includes(c.kind);

/** The reading orders that follow one another from this one: the parts of its tree. */
export function treeParts(lib: Library, headId: string): string[] {
  const parts = [headId];
  for (;;) {
    const at = parts[parts.length - 1];
    const next = lib.links
      .filter((l) => l.kind === 'follows' && l.to_collection_id === at && l.from_collection_id && !parts.includes(l.from_collection_id))
      .map((l) => lib.collections.get(l.from_collection_id!))
      .filter(isReadingOrder)
      .sort((a, b) => (a.start_year ?? 0) - (b.start_year ?? 0) || a.title.localeCompare(b.title))[0];
    if (!next) return parts;
    parts.push(next.id);
  }
}

/** Every tree in the library, by its first part, with the name you gave it. */
export function trees(lib: Library): { id: string; name: string }[] {
  return [...lib.collections.values()]
    .filter((c) => c.tree_name?.trim() && lib.collections.has(c.id))
    .map((c) => ({ id: c.id, name: c.tree_name!.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** For each reading order that's a part of some tree: that tree's id. */
export function treeIndex(lib: Library): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of trees(lib)) for (const p of treeParts(lib, t.id)) if (!out.has(p)) out.set(p, t.id);
  return out;
}

interface Hit {
  id: string;
  first: number;
  lines: number;
  optional: number;
}

/** The runs and events a reading order passes through, in order, each once, with how much of it is there. */
export function partStops(lib: Library, partId: string, start = 0): Hit[] {
  const hits = new Map<string, Hit>();
  let i = start;
  for (const e of lib.children.get(partId) ?? []) {
    if (e.heading) continue;
    const id = e.child_collection_id ?? e.part_of ?? null;
    i++;
    if (!id || !lib.collections.has(id)) continue;
    const lines = e.child_collection_id ? Math.max(1, walk(lib, id).length) : 1;
    const hit = hits.get(id) ?? { id, first: i, lines: 0, optional: 0 };
    hit.lines += lines;
    if (e.optional) hit.optional += lines;
    hits.set(id, hit);
  }
  return [...hits.values()].sort((a, b) => a.first - b.first);
}

/** Reading orders (outside these) that hold this list, whole or as slices. */
function holders(lib: Library, id: string, except: Set<string>): string[] {
  const ids = new Set([...(lib.slicedInto.get(id) ?? []), ...(lib.parents.get(id) ?? [])]);
  return [...ids].filter((h) => !except.has(h) && isReadingOrder(lib.collections.get(h)));
}

const stopOf = (lib: Library, hit: Hit, doors: Door[] = []): TreeStop => {
  const c = lib.collections.get(hit.id)!;
  return { id: c.id, kind: c.kind, title: c.title, year: c.start_year, issues: hit.lines, optional: hit.lines > 0 && hit.optional === hit.lines, doors };
};

export function buildTree(lib: Library, headId: string): Tree | null {
  const head = lib.collections.get(headId);
  if (!head) return null;
  const parts = treeParts(lib, headId);
  const inTree = new Set(parts);
  const index = treeIndex(lib);
  const door = (id: string): Door => {
    const treeId = index.get(id) ?? null;
    const t = treeId ? lib.collections.get(treeId) : null;
    return { id, title: t?.tree_name?.trim() || lib.collections.get(id)!.title, treeId };
  };

  // The main line: each part's stops, a stop shown once where it first comes up.
  const spine: { part: number; hit: Hit }[] = [];
  const seen = new Set<string>();
  parts.forEach((p, n) => {
    for (const hit of partStops(lib, p)) {
      if (seen.has(hit.id) || inTree.has(hit.id)) continue;
      seen.add(hit.id);
      spine.push({ part: n, hit });
    }
  });

  // Who else holds each stop: two or more shared makes a side line, one makes a door.
  const shared = new Map<string, string[]>();
  for (const { hit } of spine) for (const h of holders(lib, hit.id, inTree)) shared.set(h, [...(shared.get(h) ?? []), hit.id]);
  const sideIds = [...shared]
    .filter(([, stops]) => stops.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || lib.collections.get(a[0])!.title.localeCompare(lib.collections.get(b[0])!.title))
    .slice(0, MAX_SIDES)
    .map(([id]) => id);
  const sides: SideLine[] = sideIds.map((id) => {
    const d = door(id);
    return { id, title: d.title, treeId: d.treeId, shared: shared.get(id)!.length };
  });
  const sideSet = new Set(sideIds);
  const doorsAt = new Map<string, Door[]>();
  for (const [h, stops] of shared) {
    if (sideSet.has(h)) continue;
    const d = door(h);
    // A door to this tree itself (a reading order of ours sitting in another tree) isn't a way out.
    if (d.treeId === headId) continue;
    for (const s of stops) {
      const list = doorsAt.get(s) ?? [];
      if (!list.some((x) => (x.treeId ?? x.id) === (d.treeId ?? d.id))) doorsAt.set(s, [...list, d]);
    }
  }

  // A side line's own stops go between the shared stops around them (in its order), and within that
  // stretch where their year fits: Venom by Rick Remender (2011) lands near 2011, not right after 1993.
  // Keyed by the main-line stop they go before; spine.length means after the last one.
  const before = new Map<number, TreeRow[]>();
  const at = new Map(spine.map((s, i) => [s.hit.id, i]));
  const yearAt = (i: number) => lib.collections.get(spine[i].hit.id)!.start_year;
  sideIds.forEach((sid, line) => {
    const all = partStops(lib, sid).filter((h) => !inTree.has(h.id));
    const sharedAt = all.map((h, k) => (at.has(h.id) ? k : -1)).filter((k) => k >= 0);
    const first = sharedAt[0];
    const last = sharedAt[sharedAt.length - 1];
    const put = (slot: number, row: TreeRow) => before.set(slot, [...(before.get(slot) ?? []), row]);
    const fold = (count: number, slot: number) => put(slot, { type: 'more', line, count, door: door(sid) });
    // Long lead-ins and tails fold into one row each, so a side line doesn't run on past the tree.
    let own = all;
    if (last < all.length - 1 - MAX_TAIL) own = own.slice(0, last + 1);
    if (first > MAX_TAIL) own = own.slice(first);
    if (first > MAX_TAIL) fold(first, at.get(all[first].id)!);
    let lo = 0;
    own.forEach((hit, k) => {
      const here = at.get(hit.id);
      if (here !== undefined) {
        lo = Math.max(lo, here + 1);
        return;
      }
      const next = own.slice(k + 1).find((h) => at.has(h.id));
      const hi = next ? Math.max(lo, at.get(next.id)!) : spine.length;
      const year = lib.collections.get(hit.id)!.start_year;
      let slot = hi;
      if (year) for (let i = lo; i < hi; i++) if ((yearAt(i) ?? 0) > year) { slot = i; break; }
      put(slot, { type: 'side', line, stop: stopOf(lib, hit) });
      lo = slot;
    });
    if (last < all.length - 1 - MAX_TAIL) fold(all.length - 1 - last, at.get(all[last].id)! + 1);
  });

  const rows: TreeRow[] = [];
  let lastPart = -1;
  spine.forEach(({ part, hit }, i) => {
    if (part !== lastPart) {
      lastPart = part;
      if (parts.length > 1) rows.push({ type: 'part', id: parts[part], title: lib.collections.get(parts[part])!.title, number: part + 1 });
    }
    rows.push(...(before.get(i) ?? []));
    const joins = sideIds.map((sid, line) => (shared.get(sid)!.includes(hit.id) ? line : -1)).filter((l) => l >= 0);
    rows.push({ type: 'stop', stop: stopOf(lib, hit, doorsAt.get(hit.id) ?? []), joins });
  });
  rows.push(...(before.get(spine.length) ?? []));

  // Before the tree: what its first part follows, and every part's background. After: what follows the last part.
  const pre: Door[] = [];
  const post: Door[] = [];
  const add = (list: Door[], id: string | null) => {
    // Side lines are drawn already; a collected edition is a copy of something, not a story to go to.
    const c = id ? lib.collections.get(id) : undefined;
    if (!c || inTree.has(c.id) || sideSet.has(c.id) || c.kind === 'edition') return;
    const d = door(c.id);
    if (d.treeId === headId) return;
    if (!list.some((x) => (x.treeId ?? x.id) === (d.treeId ?? d.id))) list.push(d);
  };
  for (const l of lib.links) {
    if (l.kind === 'follows' && l.from_collection_id === headId) add(pre, l.to_collection_id);
    if (l.kind === 'background' && l.from_collection_id && inTree.has(l.from_collection_id)) add(pre, l.to_collection_id);
    if (l.kind === 'follows' && l.to_collection_id === parts[parts.length - 1]) add(post, l.from_collection_id);
  }

  const years = spine.map((s) => lib.collections.get(s.hit.id)!.start_year).filter((y): y is number => !!y);
  return {
    id: headId,
    name: head.tree_name?.trim() || head.title,
    parts,
    rows,
    sides,
    before: pre,
    after: post,
    years: years.length ? [Math.min(...years), Math.max(...years)] : null,
    stops: spine.length,
  };
}
