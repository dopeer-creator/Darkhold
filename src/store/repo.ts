import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ExportFile } from '@/domain/importer';
import { planImport } from '@/domain/importer';
import { buildLibrary, cannotNest, positionBetween, type Library } from '@/domain/library';
import type { ResolvedLine } from '@/domain/parser';
import type { Collection, Entry, Issue, IssueStatus, ReadLog, Series } from '@/domain/types';
import { COLUMNS, putRow, TABLES, type Table } from './db';

export const newId = () => randomUUID();
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const live = <T>(db: SQLiteDatabase, table: Table) =>
  db.getAllAsync<T>(`SELECT ${COLUMNS[table].join(',')} FROM ${table} WHERE deleted_at IS NULL`);

export interface Snapshot {
  lib: Library;
  readLog: ReadLog[];
}

export async function loadSnapshot(db: SQLiteDatabase): Promise<Snapshot> {
  const [series, issues, collections, entries, readLog] = await Promise.all([
    live<Series>(db, 'series'),
    live<Issue>(db, 'issues'),
    live<Collection & { on_hold: number | boolean }>(db, 'collections'),
    live<Entry>(db, 'entries'),
    live<ReadLog>(db, 'read_log'),
  ]);
  return {
    lib: buildLibrary({ series, issues, collections: collections.map((c) => ({ ...c, on_hold: !!c.on_hold })), entries }),
    readLog: readLog.sort((a, b) => (b.read_on ?? '').localeCompare(a.read_on ?? '')),
  };
}

async function softDelete(db: SQLiteDatabase, table: Table, id: string) {
  await db.runAsync(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?`, new Date().toISOString(), new Date().toISOString(), id);
}

/** Ticks or unticks an issue. Reading logs today's date; unticking removes today's log for it. */
export async function setIssueStatus(db: SQLiteDatabase, lib: Library, issueId: string, status: IssueStatus) {
  const issue = lib.issues.get(issueId);
  if (!issue || issue.status === status) return;
  const wasRead = issue.status === 'read';
  await db.withTransactionAsync(async () => {
    if (status === 'read') {
      await putRow(db, 'issues', { ...issue, status, completed_at: today(), date_precision: 'day' });
      await putRow(db, 'read_log', { id: newId(), issue_id: issueId, read_on: today(), date_precision: 'day', rating: null, note: null });
    } else {
      await putRow(db, 'issues', { ...issue, status, completed_at: null, date_precision: 'unknown' });
      if (wasRead) {
        const logs = await db.getAllAsync<{ id: string }>('SELECT id FROM read_log WHERE issue_id = ? AND read_on = ? AND deleted_at IS NULL', issueId, today());
        for (const l of logs) await softDelete(db, 'read_log', l.id);
      }
    }
  });
}

export async function updateIssue(db: SQLiteDatabase, lib: Library, issueId: string, patch: Partial<Issue>) {
  const issue = lib.issues.get(issueId);
  if (issue) await putRow(db, 'issues', { ...issue, ...patch });
}

export async function createCollection(db: SQLiteDatabase, fields: Pick<Collection, 'kind' | 'title'> & Partial<Collection>, parentId?: string, lib?: Library) {
  const c: Collection = {
    publisher: null, writer: null, artist: null, characters: null, start_year: null, end_year: null,
    description: null, cover_path: null, on_hold: false, rating: null, notes: null, ...fields, id: newId(),
  };
  await putRow(db, 'collections', c);
  if (parentId && lib) await appendEntry(db, lib, parentId, { child_collection_id: c.id });
  return c.id;
}

export async function updateCollection(db: SQLiteDatabase, lib: Library, id: string, patch: Partial<Collection>) {
  const c = lib.collections.get(id);
  if (c) await putRow(db, 'collections', { ...c, ...patch });
}

async function appendEntry(db: SQLiteDatabase, lib: Library, parentId: string, child: { child_issue_id?: string; child_collection_id?: string }) {
  const list = lib.children.get(parentId) ?? [];
  const position = positionBetween(list.length ? list[list.length - 1].position : null, null);
  const entry: Entry = { id: newId(), parent_id: parentId, position, child_issue_id: child.child_issue_id ?? null, child_collection_id: child.child_collection_id ?? null, note: null };
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

/**
 * Adds parsed issues to a collection. `reuse[i][n]` false means "make a new copy" instead of reusing.
 * New series are created when a line matched none.
 */
export async function addParsedIssues(
  db: SQLiteDatabase,
  lib: Library,
  parentId: string,
  lines: ResolvedLine[],
  publisher: string | null,
) {
  await db.withTransactionAsync(async () => {
    for (const line of lines) {
      let seriesId = line.series?.id;
      if (!seriesId) {
        seriesId = newId();
        await putRow(db, 'series', { id: seriesId, title: line.seriesTitle, volume_year: line.volumeYear, publisher });
      }
      for (let k = 0; k < line.numbers.length; k++) {
        let issueId = line.existing[k];
        if (!issueId) {
          issueId = newId();
          await putRow(db, 'issues', {
            id: issueId, series_id: seriesId, number: line.numbers[k], label: null, status: 'unread', completed_at: null,
            date_precision: 'unknown', rating: null, notes: null, cover_path: null, pub_year: null,
          });
        }
        await appendEntry(db, lib, parentId, { child_issue_id: issueId });
      }
    }
  });
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
  await db.withTransactionAsync(async () => {
    const children = lib.children.get(id) ?? [];
    for (const e of children) await softDelete(db, 'entries', e.id);
    for (const parent of lib.parents.get(id) ?? []) {
      for (const e of lib.children.get(parent) ?? []) if (e.child_collection_id === id) await softDelete(db, 'entries', e.id);
    }
    await softDelete(db, 'collections', id);
    if (!withContents) return;
    for (const e of children) {
      const child = e.child_issue_id ?? e.child_collection_id!;
      if ((lib.parents.get(child) ?? []).length > 1) continue;
      if (e.child_issue_id) await softDelete(db, 'issues', e.child_issue_id);
      else await deleteCollection(db, lib, child, true);
    }
  });
}

export async function importFile(db: SQLiteDatabase, lib: Library, file: ExportFile) {
  const plan = planImport(lib, file, newId);
  await db.withTransactionAsync(async () => {
    for (const s of plan.series) await putRow(db, 'series', s);
    for (const i of [...plan.issues, ...plan.markRead]) await putRow(db, 'issues', i);
    for (const c of plan.collections) await putRow(db, 'collections', c);
    for (const e of plan.entries) await putRow(db, 'entries', e);
    for (const l of plan.read_log) await putRow(db, 'read_log', l);
  });
  return plan;
}

export async function exportFile(db: SQLiteDatabase): Promise<ExportFile> {
  const { lib, readLog } = await loadSnapshot(db);
  return {
    format: 'darkhold-export', version: 1,
    series: [...lib.series.values()], issues: [...lib.issues.values()], collections: [...lib.collections.values()],
    entries: [...lib.children.values()].flat(), read_log: readLog,
  };
}

export async function isEmpty(db: SQLiteDatabase) {
  const counts = await Promise.all(TABLES.map((t) => db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)));
  return counts.every((c) => (c?.n ?? 0) === 0);
}
