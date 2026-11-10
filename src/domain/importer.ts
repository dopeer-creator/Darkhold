import type { Library } from './library';
import type { Collection, Entry, Issue, Link, ReadLog, Review, Series } from './types';

/** The JSON file format Darkhold exports and imports. Ids inside it are only used to connect rows. */
export interface ExportFile {
  format: 'darkhold-export';
  version: 1;
  series: Series[];
  issues: Issue[];
  collections: Collection[];
  entries: Entry[];
  read_log: ReadLog[];
  /** Connections between lists and issues (files from before connections existed have none). */
  links?: Link[];
  /** Your reviews (older files have none). */
  reviews?: Review[];
  /** When the backup was made. */
  exported_at?: string;
}

export interface ImportPlan {
  series: Series[];
  issues: Issue[];
  /** Issues already in the library that the file says are read. */
  markRead: Issue[];
  collections: Collection[];
  entries: Entry[];
  read_log: ReadLog[];
  links: Link[];
  reviews: Review[];
  reused: { series: number; issues: number; collections: number };
}

/**
 * Merges a file into the library without creating duplicates: series match on title + volume,
 * issues on series + number, collections on kind + title, and links that already exist are skipped.
 * Importing the same file twice changes nothing the second time.
 */
export function planImport(lib: Library, file: ExportFile, newId: () => string): ImportPlan {
  const plan: ImportPlan = { series: [], issues: [], markRead: [], collections: [], entries: [], read_log: [], links: [], reviews: [], reused: { series: 0, issues: 0, collections: 0 } };
  const seriesKey = (s: Pick<Series, 'title' | 'volume_year'>) => `${s.title.trim().toLowerCase()}|${s.volume_year ?? ''}`;

  const seriesByKey = new Map([...lib.series.values()].map((s) => [seriesKey(s), s.id]));
  const seriesMap = new Map<string, string>();
  for (const s of file.series) {
    const found = seriesByKey.get(seriesKey(s));
    if (found) {
      plan.reused.series++;
      seriesMap.set(s.id, found);
    } else {
      const id = newId();
      seriesByKey.set(seriesKey(s), id);
      seriesMap.set(s.id, id);
      plan.series.push({ ...s, id });
    }
  }

  const issueByKey = new Map<string, Issue>();
  for (const i of lib.issues.values()) if (i.number != null) issueByKey.set(`${i.series_id}#${i.number}`, i);
  const unnumbered = new Map<string, Issue>();
  for (const i of lib.issues.values()) if (i.number == null && i.label) unnumbered.set(`${i.series_id}|${i.label}`, i);
  const issueMap = new Map<string, string>();
  for (const i of file.issues) {
    const series_id = seriesMap.get(i.series_id)!;
    const found = i.number != null ? issueByKey.get(`${series_id}#${i.number}`) : unnumbered.get(`${series_id}|${i.label}`);
    if (found) {
      plan.reused.issues++;
      issueMap.set(i.id, found.id);
      if (i.status === 'read' && found.status !== 'read') {
        plan.markRead.push({ ...found, status: 'read', completed_at: i.completed_at, date_precision: i.date_precision });
      }
    } else {
      const id = newId();
      issueMap.set(i.id, id);
      const issue = { ...i, id, series_id };
      plan.issues.push(issue);
      if (issue.number != null) issueByKey.set(`${series_id}#${issue.number}`, issue);
    }
  }

  const collByKey = new Map([...lib.collections.values()].map((c) => [`${c.kind}|${c.title.toLowerCase()}`, c.id]));
  const collMap = new Map<string, string>();
  for (const c of file.collections) {
    const found = collByKey.get(`${c.kind}|${c.title.toLowerCase()}`);
    if (found) {
      plan.reused.collections++;
      collMap.set(c.id, found);
    } else {
      const id = newId();
      collMap.set(c.id, id);
      plan.collections.push({ ...c, id });
    }
  }

  const linked = new Set<string>();
  for (const list of lib.children.values()) for (const e of list) linked.add(`${e.parent_id}>${e.child_issue_id ?? e.child_collection_id}`);
  const lastPos = new Map<string, number>();
  for (const [parent, list] of lib.children) lastPos.set(parent, list.length ? list[list.length - 1].position : 0);
  for (const e of [...file.entries].sort((a, b) => a.position - b.position)) {
    const parent_id = collMap.get(e.parent_id);
    const child_issue_id = e.child_issue_id ? issueMap.get(e.child_issue_id) : null;
    const child_collection_id = e.child_collection_id ? collMap.get(e.child_collection_id) : null;
    const heading = e.heading ?? null;
    if (!parent_id || (!child_issue_id && !child_collection_id && !heading)) continue;
    const key = heading ? `${parent_id}>heading:${heading}` : `${parent_id}>${child_issue_id ?? child_collection_id}`;
    if (linked.has(key)) continue;
    linked.add(key);
    const position = (lastPos.get(parent_id) ?? 0) + 1024;
    lastPos.set(parent_id, position);
    const via_collection_id = e.via_collection_id ? (collMap.get(e.via_collection_id) ?? null) : null;
    plan.entries.push({ ...e, id: newId(), parent_id, position, child_issue_id: child_issue_id ?? null, child_collection_id: child_collection_id ?? null, via_collection_id });
  }

  // Connections, skipping any that already exist.
  const linkKey = (l: Link) => `${l.kind}|${l.from_collection_id ?? l.from_issue_id}|${l.to_collection_id ?? l.to_issue_id}`;
  const haveLinks = new Set(lib.links.map(linkKey));
  for (const l of file.links ?? []) {
    const mapped: Link = {
      ...l,
      id: newId(),
      from_collection_id: l.from_collection_id ? (collMap.get(l.from_collection_id) ?? null) : null,
      from_issue_id: l.from_issue_id ? (issueMap.get(l.from_issue_id) ?? null) : null,
      to_collection_id: l.to_collection_id ? (collMap.get(l.to_collection_id) ?? null) : null,
      to_issue_id: l.to_issue_id ? (issueMap.get(l.to_issue_id) ?? null) : null,
    };
    if (!(mapped.from_collection_id || mapped.from_issue_id) || !(mapped.to_collection_id || mapped.to_issue_id)) continue;
    if (haveLinks.has(linkKey(mapped))) continue;
    haveLinks.add(linkKey(mapped));
    plan.links.push(mapped);
  }

  // Reviews, for lists and issues that don't have one here yet.
  const reviewed = new Set(lib.reviews.keys());
  for (const r of file.reviews ?? []) {
    const collection_id = r.collection_id ? (collMap.get(r.collection_id) ?? null) : null;
    const issue_id = !collection_id && r.issue_id ? (issueMap.get(r.issue_id) ?? null) : null;
    const key = collection_id ?? issue_id;
    if (!key || reviewed.has(key)) continue;
    reviewed.add(key);
    plan.reviews.push({ ...r, id: newId(), collection_id, issue_id });
  }

  // History rows only for issues this import adds or newly marks read, so a re-import adds none.
  const freshlyRead = new Set([...plan.issues, ...plan.markRead].map((i) => i.id));
  for (const l of file.read_log) {
    const issue_id = issueMap.get(l.issue_id);
    if (issue_id && freshlyRead.has(issue_id)) plan.read_log.push({ ...l, id: newId(), issue_id });
  }
  return plan;
}
