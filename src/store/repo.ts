import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ExportFile } from '@/domain/importer';
import { planImport } from '@/domain/importer';
import { buildLibrary, canSlice, cannotNest, positionBetween, walk, type Library } from '@/domain/library';
import type { BlockKind, ResolvedLine } from '@/domain/parser';
import type { Collection, Entry, Issue, IssueStatus, Kind, Link, LinkKind, ReadLog, Review, Series, Verdict } from '@/domain/types';
import { COLUMNS, putRow, TABLES, type Table } from './db';

export const newId = () => randomUUID();
/** A local day as "YYYY-MM-DD": today, or n days ago. */
export const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const today = () => daysAgo(0);

const live = <T>(db: SQLiteDatabase, table: Table) =>
  db.getAllAsync<T>(`SELECT ${COLUMNS[table].join(',')} FROM ${table} WHERE deleted_at IS NULL`);

export interface Snapshot {
  lib: Library;
  readLog: ReadLog[];
}

export async function loadSnapshot(db: SQLiteDatabase): Promise<Snapshot> {
  const [series, issues, collections, entries, links, reviews, readLog] = await Promise.all([
    live<Series>(db, 'series'),
    live<Issue & { upcoming?: number | boolean }>(db, 'issues'),
    live<Collection & { on_hold: number | boolean; ongoing: number | boolean; planned?: number | boolean; reading_now?: number | boolean }>(db, 'collections'),
    live<Entry & { optional?: number | boolean }>(db, 'entries'),
    live<Link>(db, 'links'),
    live<Review>(db, 'reviews'),
    // With updated_at: the moment it was ticked, so same-day reads come out newest first.
    db.getAllAsync<ReadLog & { updated_at: string | null }>(`SELECT ${COLUMNS.read_log.join(',')}, updated_at FROM read_log WHERE deleted_at IS NULL`),
  ]);
  return {
    lib: buildLibrary({
      series,
      issues: issues.map((i) => ({ ...i, upcoming: !!i.upcoming })),
      collections: collections.map((c) => ({ ...c, on_hold: !!c.on_hold, ongoing: !!c.ongoing, planned: !!c.planned, reading_now: !!c.reading_now })),
      entries: entries.map((e) => ({ ...e, optional: !!e.optional })),
      links,
      reviews,
    }),
    readLog: readLog
      .sort((a, b) => (b.read_on ?? '').localeCompare(a.read_on ?? '') || (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
      .map(({ updated_at: _ignored, ...l }) => l),
  };
}

async function softDelete(db: SQLiteDatabase, table: Table, id: string) {
  await db.runAsync(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?`, new Date().toISOString(), new Date().toISOString(), id);
}

/**
 * When an issue was read: a day ("2026-11-02"), null for "read, date unknown", or undefined for today.
 * A dated read shows in History on that day; an undated one sits under "Date unknown".
 */
export type ReadDate = string | null | undefined;

/** Sets one issue's status (and read date) without opening a transaction. */
async function applyStatus(db: SQLiteDatabase, issue: Issue, status: IssueStatus, date: ReadDate) {
  const logs = await db.getAllAsync<{ id: string }>('SELECT id FROM read_log WHERE issue_id = ? AND deleted_at IS NULL ORDER BY read_on DESC', issue.id);
  if (status !== 'read') {
    await putRow(db, 'issues', { ...issue, status, completed_at: null, date_precision: 'unknown', upcoming: status === 'reading' ? false : issue.upcoming });
    for (const l of logs) await softDelete(db, 'read_log', l.id);
    return;
  }
  const day = date === undefined ? today() : date;
  await putRow(db, 'issues', { ...issue, status, completed_at: day, date_precision: day ? 'day' : 'unknown', upcoming: false });
  // One history line per issue: move it to the new day, or drop it when the date is unknown.
  const [keep, ...extra] = logs;
  for (const l of extra) await softDelete(db, 'read_log', l.id);
  if (!day) {
    if (keep) await softDelete(db, 'read_log', keep.id);
  } else {
    await putRow(db, 'read_log', { id: keep?.id ?? newId(), issue_id: issue.id, read_on: day, date_precision: 'day', rating: null, note: null });
  }
}

/** The tags most issues of a series carry ("X-Men" for Uncanny X-Men), so a new issue of it gets the same; null for a new series. */
function seriesTags(lib: Library, seriesId: string): string | null {
  const counts = new Map<string, number>();
  for (const i of lib.issues.values()) if (i.series_id === seriesId && i.characters) counts.set(i.characters, (counts.get(i.characters) ?? 0) + 1);
  let best: string | null = null;
  for (const [tags, n] of counts) if (!best || n > counts.get(best)!) best = tags;
  return best;
}

/** Ticks or unticks an issue. Ticking logs today unless a date (or null for "date unknown") is given. */
export async function setIssueStatus(db: SQLiteDatabase, lib: Library, issueId: string, status: IssueStatus, date?: ReadDate) {
  const issue = lib.issues.get(issueId);
  if (!issue || (issue.status === status && date === undefined)) return;
  await db.withTransactionAsync(() => applyStatus(db, issue, status, date));
}

/** Starts (or resumes) a list: switches it to Reading now and takes it off hold. */
export async function startReading(db: SQLiteDatabase, lib: Library, collectionId: string) {
  const c = lib.collections.get(collectionId);
  if (c) await putRow(db, 'collections', { ...c, reading_now: true, on_hold: false });
}

/** Stops reading a list without putting it on hold. */
export async function stopReading(db: SQLiteDatabase, lib: Library, collectionId: string) {
  const c = lib.collections.get(collectionId);
  if (c) await putRow(db, 'collections', { ...c, reading_now: false });
}

/** Changes when a read issue was read (null = date unknown). Marks it read if it wasn't. */
export async function setReadDate(db: SQLiteDatabase, lib: Library, issueId: string, date: string | null) {
  const issue = lib.issues.get(issueId);
  if (issue) await db.withTransactionAsync(() => applyStatus(db, issue, 'read', date));
}

/**
 * Marks every issue in a collection read with one date choice (or unread). Issues already read keep
 * their own dates. Returns how many issues changed.
 */
export async function markCollection(db: SQLiteDatabase, lib: Library, collectionId: string, status: 'read' | 'unread', date?: ReadDate) {
  const ids = [...new Set(walk(lib, collectionId).map((s) => s.issueId))];
  const targets = ids.map((id) => lib.issues.get(id)!).filter((i) => (status === 'read' ? i.status !== 'read' : i.status !== 'unread'));
  await db.withTransactionAsync(async () => {
    for (const issue of targets) await applyStatus(db, issue, status, date);
  });
  return targets.length;
}

/** Puts a collection's lines in the given order (ids of its entries, first to last). */
export async function reorderEntries(db: SQLiteDatabase, lib: Library, parentId: string, orderedIds: string[]) {
  const byId = new Map((lib.children.get(parentId) ?? []).map((e) => [e.id, e]));
  await db.withTransactionAsync(async () => {
    for (let k = 0; k < orderedIds.length; k++) {
      const e = byId.get(orderedIds[k]);
      const position = (k + 1) * 1024;
      if (e && e.position !== position) await putRow(db, 'entries', { ...e, position });
    }
  });
}

/** Removes several lines at once (e.g. a whole slice block) from a collection. */
export async function removeEntries(db: SQLiteDatabase, entryIds: string[]) {
  await db.withTransactionAsync(async () => {
    for (const id of entryIds) await softDelete(db, 'entries', id);
  });
}

export async function updateIssue(db: SQLiteDatabase, lib: Library, issueId: string, patch: Partial<Issue>) {
  const issue = lib.issues.get(issueId);
  if (issue) await putRow(db, 'issues', { ...issue, ...patch });
}

function collectionRow(fields: Pick<Collection, 'kind' | 'title'> & Partial<Collection>): Collection {
  return {
    publisher: null, writer: null, artist: null, characters: null, start_year: null, end_year: null,
    description: null, cover_path: null, on_hold: false, ongoing: false, planned: false, reading_now: false, label: null, rating: null, notes: null, ...fields, id: newId(),
  };
}

export async function createCollection(db: SQLiteDatabase, fields: Pick<Collection, 'kind' | 'title'> & Partial<Collection>, parentId?: string, lib?: Library) {
  const c = collectionRow(fields);
  await putRow(db, 'collections', c);
  if (parentId && lib) await appendEntry(db, lib, parentId, { child_collection_id: c.id });
  return c.id;
}

export async function updateCollection(db: SQLiteDatabase, lib: Library, id: string, patch: Partial<Collection>) {
  const c = lib.collections.get(id);
  if (c) await putRow(db, 'collections', { ...c, ...patch });
}

async function appendEntry(
  db: SQLiteDatabase,
  lib: Library,
  parentId: string,
  child: { child_issue_id?: string; child_collection_id?: string; via_collection_id?: string | null; heading?: string; note?: string | null; optional?: boolean },
) {
  const list = lib.children.get(parentId) ?? [];
  const position = positionBetween(list.length ? list[list.length - 1].position : null, null);
  const entry: Entry = {
    id: newId(), parent_id: parentId, position, child_issue_id: child.child_issue_id ?? null,
    child_collection_id: child.child_collection_id ?? null, via_collection_id: child.via_collection_id ?? null,
    heading: child.heading ?? null, note: child.note ?? null, optional: !!child.optional,
  };
  await putRow(db, 'entries', entry);
  list.push(entry);
  lib.children.set(parentId, list);
}

/** Links an existing run or event into a collection. Returns why not, if the layering rules forbid it. */
export async function linkCollection(db: SQLiteDatabase, lib: Library, parentId: string, childId: string) {
  const reason = cannotNest(lib, parentId, childId);
  if (reason) return reason;
  await appendEntry(db, lib, parentId, { child_collection_id: childId });
  return null;
}

export async function linkIssues(db: SQLiteDatabase, lib: Library, parentId: string, issueIds: string[]) {
  await db.withTransactionAsync(async () => {
    for (const id of issueIds) await appendEntry(db, lib, parentId, { child_issue_id: id });
  });
}

export interface ResolvedBlock {
  kind: BlockKind | null;
  title: string | null;
  lines: ResolvedLine[];
}

/**
 * Adds issues to a collection, block by block. A block named after a run or event ("run: Captain America
 * by Chip Zdarsky") also puts its issues into that run or event, creating it if needed, and links them here
 * as a slice of it, so the crisis keeps your reading order while the run stays whole. Ticked lines ("[x]")
 * are marked read; nothing is ever marked unread.
 */
export async function addIssueBlocks(db: SQLiteDatabase, lib: Library, parentId: string, blocks: ResolvedBlock[], publisher: string | null) {
  const parent = lib.collections.get(parentId);
  await db.withTransactionAsync(async () => {
    const madeSeries = new Map<string, string>();
    const madeIssues = new Map<string, string>();
    for (const block of blocks) {
      if (block.kind === 'heading') {
        if (block.title) await appendEntry(db, lib, parentId, { heading: block.title });
        continue;
      }
      let via: string | null = null;
      if ((block.kind === 'run' || block.kind === 'event') && block.title) {
        const name = block.title.toLowerCase();
        via = [...lib.collections.values()].find((c) => c.kind === block.kind && c.title.toLowerCase() === name)?.id ?? null;
        if (!via) {
          const c = collectionRow({ kind: block.kind, title: block.title, publisher: publisher ?? parent?.publisher ?? null });
          await putRow(db, 'collections', c);
          lib.collections.set(c.id, c);
          via = c.id;
        }
        // e.g. pasting "event:" blocks into an event: the issues just go in directly.
        if (!canSlice(lib, parentId, via)) via = null;
      }
      for (const line of block.lines) {
        const seriesKey = `${line.seriesTitle.toLowerCase()}|${line.volumeYear ?? ''}`;
        let seriesId = line.series?.id ?? madeSeries.get(seriesKey);
        if (!seriesId) {
          seriesId = newId();
          await putRow(db, 'series', { id: seriesId, title: line.seriesTitle, volume_year: line.volumeYear, publisher: publisher ?? parent?.publisher ?? null });
          madeSeries.set(seriesKey, seriesId);
        }
        for (let k = 0; k < line.numbers.length; k++) {
          const issueKey = `${seriesId}#${line.numbers[k]}`;
          let issueId = line.existing[k] ?? madeIssues.get(issueKey) ?? null;
          if (!issueId) {
            issueId = newId();
            const release = releaseFromNote(line.note);
            await putRow(db, 'issues', {
              id: issueId, series_id: seriesId, number: line.numbers[k], label: null, status: line.checked ? 'read' : 'unread',
              completed_at: null, date_precision: 'unknown', rating: null, notes: release ? null : line.note, cover_path: null, pub_year: null,
              upcoming: !!release && !line.checked, release_on: release?.on ?? null,
              characters: seriesTags(lib, seriesId) ?? lib.collections.get(via ?? parentId)?.characters ?? parent?.characters ?? null,
            });
            madeIssues.set(issueKey, issueId);
          } else if (line.checked) {
            const existing = lib.issues.get(issueId);
            if (existing && existing.status !== 'read') await putRow(db, 'issues', { ...existing, status: 'read' });
          }
          if (via && !(lib.children.get(via) ?? []).some((e) => e.child_issue_id === issueId)) {
            await appendEntry(db, lib, via, { child_issue_id: issueId });
          }
          // "Ion #1–12 (optional)" in a pasted list: shown, but not counted.
          await appendEntry(db, lib, parentId, { child_issue_id: issueId, via_collection_id: via, optional: /^optional\b/i.test(line.note ?? '') });
        }
      }
    }
  });
}

/** Adds a plain list of parsed issues to a collection. */
export function addParsedIssues(db: SQLiteDatabase, lib: Library, parentId: string, lines: ResolvedLine[], publisher: string | null) {
  return addIssueBlocks(db, lib, parentId, [{ kind: null, title: null, lines }], publisher);
}

export async function moveEntry(db: SQLiteDatabase, lib: Library, entryId: string, parentId: string, toIndex: number) {
  const list = (lib.children.get(parentId) ?? []).filter((e) => e.id !== entryId);
  const entry = lib.children.get(parentId)?.find((e) => e.id === entryId);
  if (!entry) return;
  const position = positionBetween(list[toIndex - 1]?.position ?? null, list[toIndex]?.position ?? null);
  await putRow(db, 'entries', { ...entry, position });
}

export async function removeEntry(db: SQLiteDatabase, entryId: string) {
  await softDelete(db, 'entries', entryId);
}

/** Deletes a collection and its links. Issues and inner collections stay unless they are used nowhere else and `withContents` is set. */
export async function deleteCollection(db: SQLiteDatabase, lib: Library, id: string, withContents: boolean) {
  await db.withTransactionAsync(() => removeCollection(db, lib, id, withContents));
}

async function removeCollection(db: SQLiteDatabase, lib: Library, id: string, withContents: boolean) {
  const children = lib.children.get(id) ?? [];
  for (const e of children) await softDelete(db, 'entries', e.id);
  for (const parent of lib.parents.get(id) ?? []) {
    for (const e of lib.children.get(parent) ?? []) if (e.child_collection_id === id) await softDelete(db, 'entries', e.id);
  }
  // Slices of it in a reading order stay as plain issue lines; its connections go with it.
  for (const holder of lib.slicedInto.get(id) ?? []) {
    for (const e of lib.children.get(holder) ?? []) if (e.via_collection_id === id) await putRow(db, 'entries', { ...e, via_collection_id: null });
  }
  for (const l of lib.links) if (l.from_collection_id === id || l.to_collection_id === id) await softDelete(db, 'links', l.id);
  const review = lib.reviews.get(id);
  if (review) await softDelete(db, 'reviews', review.id);
  await softDelete(db, 'collections', id);
  if (!withContents) return;
  for (const e of children) {
    const child = e.child_issue_id ?? e.child_collection_id!;
    if ((lib.parents.get(child) ?? []).length > 1) continue;
    if (e.child_issue_id) {
      await softDelete(db, 'issues', e.child_issue_id);
      const issueReview = lib.reviews.get(e.child_issue_id);
      if (issueReview) await softDelete(db, 'reviews', issueReview.id);
    }
    else await removeCollection(db, lib, child, true);
  }
}

export async function importFile(db: SQLiteDatabase, lib: Library, file: ExportFile) {
  const plan = planImport(lib, file, newId);
  await db.withTransactionAsync(async () => {
    for (const s of plan.series) await putRow(db, 'series', s);
    for (const i of [...plan.issues, ...plan.markRead]) await putRow(db, 'issues', i);
    for (const c of plan.collections) await putRow(db, 'collections', c);
    for (const e of plan.entries) await putRow(db, 'entries', e);
    for (const l of plan.read_log) await putRow(db, 'read_log', l);
    for (const l of plan.links) await putRow(db, 'links', l);
    for (const r of plan.reviews) await putRow(db, 'reviews', r);
  });
  return plan;
}

export async function exportFile(db: SQLiteDatabase): Promise<ExportFile> {
  const { lib, readLog } = await loadSnapshot(db);
  return {
    format: 'darkhold-export', version: 1,
    series: [...lib.series.values()], issues: [...lib.issues.values()], collections: [...lib.collections.values()],
    entries: [...lib.children.values()].flat(), read_log: readLog, links: lib.links, reviews: [...lib.reviews.values()], exported_at: new Date().toISOString(),
  };
}

export async function isEmpty(db: SQLiteDatabase) {
  const counts = await Promise.all(TABLES.map((t) => db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)));
  return counts.every((c) => (c?.n ?? 0) === 0);
}

/**
 * Changes a list's type. Types are labels, so anything can become anything; in a reading order the
 * app works out which run or event each issue belongs to by itself.
 */
export async function changeKind(db: SQLiteDatabase, lib: Library, id: string, kind: Kind) {
  const c = lib.collections.get(id);
  if (c && c.kind !== kind) await putRow(db, 'collections', { ...c, kind });
  return null;
}

/**
 * Marks lines of a crisis or run as a part of one run or event ("Part of…"), adding the issues to
 * that run or event if they aren't in it yet. viaId null makes them plain lines again.
 */
export async function setPartOf(db: SQLiteDatabase, lib: Library, parentId: string, entryIds: string[], viaId: string | null) {
  if (viaId && !canSlice(lib, parentId, viaId)) return 'That kind of collection can’t be a part of this one';
  const byId = new Map((lib.children.get(parentId) ?? []).map((e) => [e.id, e]));
  await db.withTransactionAsync(async () => {
    for (const id of entryIds) {
      const e = byId.get(id);
      if (!e?.child_issue_id) continue;
      await putRow(db, 'entries', { ...e, via_collection_id: viaId });
      if (viaId && !(lib.children.get(viaId) ?? []).some((x) => x.child_issue_id === e.child_issue_id)) {
        await appendEntry(db, lib, viaId, { child_issue_id: e.child_issue_id });
      }
    }
  });
  return null;
}

/** Renames a series or fixes its year, for every issue in it. Forgets its Comic Vine match. */
export async function updateSeries(db: SQLiteDatabase, lib: Library, seriesId: string, patch: Pick<Series, 'title' | 'volume_year'>) {
  const s = lib.series.get(seriesId);
  if (!s) return;
  await putRow(db, 'series', { ...s, ...patch, cv_volume_id: null });
  await db.runAsync('DELETE FROM meta WHERE key = ?', `cv:volume:${seriesId}`);
}

/**
 * Moves one issue to another series (found by title and year, or made), optionally with a new
 * number. Refuses when that series already has that number — the issue exists there already.
 * A Comic Vine cover from the old series is dropped so the right one can be found.
 */
export async function moveIssue(db: SQLiteDatabase, lib: Library, issueId: string, to: { title: string; volume_year: number | null; number: string }) {
  const issue = lib.issues.get(issueId);
  if (!issue) return 'Issue not found';
  const title = to.title.trim();
  const number = to.number.trim();
  if (!title || !number) return 'Give it a series name and a number';
  const old = lib.series.get(issue.series_id);
  let target = [...lib.series.values()].find((s) => s.title.toLowerCase() === title.toLowerCase() && (s.volume_year ?? null) === to.volume_year);
  const clash = target && [...lib.issues.values()].find((i) => i.series_id === target!.id && i.number === number && i.id !== issueId);
  if (clash) return `${title}${to.volume_year ? ` (${to.volume_year})` : ''} #${number} is already in your library`;
  await db.withTransactionAsync(async () => {
    if (!target) {
      target = { id: newId(), title, volume_year: to.volume_year, publisher: old?.publisher ?? null };
      await putRow(db, 'series', target);
    }
    const moved = target.id !== issue.series_id || number !== issue.number;
    await putRow(db, 'issues', { ...issue, series_id: target.id, number, cover_path: moved && issue.cover_path?.includes('comicvine') ? null : issue.cover_path });
  });
  return null;
}

/** Adds a chapter heading ("Phase 2 · The Incursions") to a list, at the end or just before a given line. */
export async function addHeading(db: SQLiteDatabase, lib: Library, parentId: string, heading: string, note: string | null, beforeEntryId?: string) {
  const list = lib.children.get(parentId) ?? [];
  const at = beforeEntryId ? list.findIndex((e) => e.id === beforeEntryId) : -1;
  if (at < 0) return appendEntry(db, lib, parentId, { heading, note });
  const position = positionBetween(list[at - 1]?.position ?? null, list[at].position);
  await putRow(db, 'entries', { id: newId(), parent_id: parentId, position, child_issue_id: null, child_collection_id: null, via_collection_id: null, heading, note });
}

/** Renames a chapter heading or changes its description. */
export async function updateHeading(db: SQLiteDatabase, lib: Library, parentId: string, entryId: string, heading: string, note: string | null) {
  const e = (lib.children.get(parentId) ?? []).find((x) => x.id === entryId);
  if (e) await putRow(db, 'entries', { ...e, heading, note });
}

/** Marks lines of a list optional (shown, not counted) or counted again. */
export async function setOptional(db: SQLiteDatabase, lib: Library, parentId: string, entryIds: string[], optional: boolean) {
  const byId = new Map((lib.children.get(parentId) ?? []).map((e) => [e.id, e]));
  await db.withTransactionAsync(async () => {
    for (const id of entryIds) {
      const e = byId.get(id);
      if (e && !!e.optional !== optional) await putRow(db, 'entries', { ...e, optional });
    }
  });
}

/** One end of a connection: a list or a single issue. */
export type LinkEnd = { collectionId: string } | { issueId: string };
const endCols = (side: 'from' | 'to', end: LinkEnd) =>
  'collectionId' in end ? { [`${side}_collection_id`]: end.collectionId, [`${side}_issue_id`]: null } : { [`${side}_collection_id`]: null, [`${side}_issue_id`]: end.issueId };

/** Connects two lists or issues: from follows to, from has to as background, or from is a tie-in of to. */
export async function addLink(db: SQLiteDatabase, kind: LinkKind, from: LinkEnd, to: LinkEnd, note: string | null) {
  const row = { id: newId(), kind, ...endCols('from', from), ...endCols('to', to), note } as Link;
  if ((row.from_collection_id && row.from_collection_id === row.to_collection_id) || (row.from_issue_id && row.from_issue_id === row.to_issue_id)) {
    return 'It can’t be connected to itself';
  }
  await putRow(db, 'links', row);
  return null;
}

export async function removeLink(db: SQLiteDatabase, linkId: string) {
  await softDelete(db, 'links', linkId);
}

/**
 * Merges one series into another: every issue moves over, and where both have the same number the two
 * become one issue (read if either was read), with every list, history line and connection pointing at it.
 */
export async function mergeSeries(db: SQLiteDatabase, lib: Library, fromId: string, intoId: string) {
  const from = lib.series.get(fromId);
  const into = lib.series.get(intoId);
  if (!from || !into || fromId === intoId) return 'Pick another series';
  const byNumber = new Map([...lib.issues.values()].filter((i) => i.series_id === intoId && i.number != null).map((i) => [i.number!, i]));
  let combined = 0;
  await db.withTransactionAsync(async () => {
    for (const issue of [...lib.issues.values()].filter((i) => i.series_id === fromId)) {
      const keep = issue.number != null ? byNumber.get(issue.number) : undefined;
      if (!keep) {
        await putRow(db, 'issues', { ...issue, series_id: intoId });
        continue;
      }
      combined++;
      const read = keep.status === 'read' || issue.status === 'read';
      await putRow(db, 'issues', {
        ...keep,
        status: read ? 'read' : keep.status === 'reading' || issue.status === 'reading' ? 'reading' : 'unread',
        completed_at: keep.completed_at ?? issue.completed_at,
        date_precision: keep.completed_at ? keep.date_precision : issue.date_precision,
        rating: keep.rating ?? issue.rating, notes: keep.notes ?? issue.notes, cover_path: keep.cover_path ?? issue.cover_path,
        story_title: keep.story_title ?? issue.story_title, writers: keep.writers ?? issue.writers, artists: keep.artists ?? issue.artists,
        cover_date: keep.cover_date ?? issue.cover_date, cv_issue_id: keep.cv_issue_id ?? issue.cv_issue_id,
        characters: keep.characters ?? issue.characters,
      });
      // A review of the duplicate moves over, unless the kept issue has its own.
      const dupReview = lib.reviews.get(issue.id);
      if (dupReview && !lib.reviews.has(keep.id)) await putRow(db, 'reviews', { ...dupReview, issue_id: keep.id });
      // Lines that held the duplicate now hold the kept issue; a list that had both keeps one line.
      for (const parentId of lib.parents.get(issue.id) ?? []) {
        const list = lib.children.get(parentId) ?? [];
        const hasKeep = list.some((e) => e.child_issue_id === keep.id);
        for (const e of list.filter((x) => x.child_issue_id === issue.id)) {
          if (hasKeep) await softDelete(db, 'entries', e.id);
          else await putRow(db, 'entries', { ...e, child_issue_id: keep.id });
        }
      }
      await db.runAsync('UPDATE read_log SET issue_id = ?, updated_at = ?, dirty = 1 WHERE issue_id = ? AND deleted_at IS NULL', keep.id, new Date().toISOString(), issue.id);
      for (const l of lib.links) {
        if (l.from_issue_id === issue.id) await putRow(db, 'links', { ...l, from_issue_id: keep.id });
        if (l.to_issue_id === issue.id) await putRow(db, 'links', { ...l, to_issue_id: keep.id });
      }
      await softDelete(db, 'issues', issue.id);
    }
    await putRow(db, 'series', { ...into, volume_year: into.volume_year ?? from.volume_year, publisher: into.publisher ?? from.publisher, cv_volume_id: into.cv_volume_id ?? from.cv_volume_id ?? null });
    await softDelete(db, 'series', fromId);
  });
  return { combined };
}

/** "not out yet", "coming 2027-02", "out 2027-02-10" in a pasted line's brackets → not out yet, with the date if there is one. */
export function releaseFromNote(note: string | null): { on: string | null } | null {
  if (!note || !/^(not out yet|coming|out|upcoming|unreleased)\b/i.test(note.trim())) return null;
  const date = note.match(/\b(\d{4}-\d{2}(?:-\d{2})?)\b/);
  return { on: date ? date[1] : null };
}

/** Marks an issue as not out yet (with an optional day or month), or as out. */
export async function setRelease(db: SQLiteDatabase, lib: Library, issueId: string, upcoming: boolean, releaseOn: string | null) {
  const issue = lib.issues.get(issueId);
  if (issue) await putRow(db, 'issues', { ...issue, upcoming, release_on: upcoming ? releaseOn : null });
}

/** Saves your review of a list or an issue: replaces the one you had, keeping the day you first wrote it. */
export async function saveReview(
  db: SQLiteDatabase,
  lib: Library,
  target: { collection_id?: string | null; issue_id?: string | null },
  fields: { verdict: Verdict; score: number | null; body: string | null },
) {
  const key = target.collection_id ?? target.issue_id;
  if (!key) return;
  const had = lib.reviews.get(key);
  await putRow(db, 'reviews', {
    id: had?.id ?? newId(),
    collection_id: target.collection_id ?? null,
    issue_id: target.collection_id ? null : (target.issue_id ?? null),
    verdict: fields.verdict,
    score: fields.score,
    body: fields.body?.trim() || null,
    reviewed_on: had?.reviewed_on ?? today(),
  });
}

export async function deleteReview(db: SQLiteDatabase, lib: Library, key: string) {
  const had = lib.reviews.get(key);
  if (had) await softDelete(db, 'reviews', had.id);
}
