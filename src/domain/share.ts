import type { ExportFile } from './importer';
import type { Library } from './library';
import type { Collection, Entry, Issue, Link, Series } from './types';

/**
 * One list to hand to someone else: the list, every list inside it, every run or event its lines are
 * "part of", and their issues, chapters and connections. Your own reading is left out: issues come
 * through unread with no dates, ratings or notes, lists land on their Plan to read shelf, and no
 * reviews or history are included.
 */
export function exportList(lib: Library, rootId: string): ExportFile | null {
  const root = lib.collections.get(rootId);
  if (!root) return null;

  // The list, what's inside it, and the runs/events its lines are pinned to, all the way down.
  const ids = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.pop()!;
    if (ids.has(id) || !lib.collections.has(id)) continue;
    ids.add(id);
    for (const e of lib.children.get(id) ?? []) {
      if (e.child_collection_id) queue.push(e.child_collection_id);
      if (e.via_collection_id) queue.push(e.via_collection_id);
    }
  }

  const collections: Collection[] = [...ids].map((id) => {
    const c = lib.collections.get(id)!;
    return { ...c, on_hold: false, reading_now: false, planned: id === rootId, rating: null, notes: null };
  });
  const entries: Entry[] = [...ids].flatMap((id) => (lib.children.get(id) ?? []).map(({ part_of: _derived, ...e }) => e));

  const issueIds = new Set(entries.map((e) => e.child_issue_id).filter((x): x is string => !!x));
  const issues: Issue[] = [...issueIds]
    .map((id) => lib.issues.get(id))
    .filter((i): i is Issue => !!i)
    .map((i) => ({ ...i, status: 'unread', completed_at: null, date_precision: 'unknown', rating: null, notes: null }));
  const series: Series[] = [...new Set(issues.map((i) => i.series_id))].map((id) => lib.series.get(id)).filter((s): s is Series => !!s);

  const inside = (cid: string | null, iid: string | null) => (cid ? ids.has(cid) : !!iid && issueIds.has(iid));
  const links: Link[] = lib.links.filter((l) => inside(l.from_collection_id, l.from_issue_id) && inside(l.to_collection_id, l.to_issue_id));

  return {
    format: 'darkhold-export',
    version: 1,
    shared: { id: root.id, title: root.title, kind: root.kind },
    series,
    issues,
    collections,
    entries,
    read_log: [],
    links,
    reviews: [],
    exported_at: new Date().toISOString(),
  };
}

/** "Batman by Tom King" → "batman-by-tom-king.darkhold.json" */
export const shareFileName = (title: string) =>
  `${title.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60) || 'reading-order'}.darkhold.json`;
