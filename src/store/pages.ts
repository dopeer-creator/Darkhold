import type { SQLiteDatabase } from 'expo-sqlite';

import { walk, type Library } from '@/domain/library';
import type { PageNote } from '@/domain/types';
import { putRow } from './db';
import { newId, setIssueStatus, today } from './repo';

const softDelete = async (db: SQLiteDatabase, table: 'page_log' | 'page_notes', id: string) => {
  const now = new Date().toISOString();
  await db.runAsync(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?`, now, now, id);
};

/**
 * You got to this page on this day (today by default). One line per book per day: a second update the
 * same day moves that line. The book goes to Reading, and reaching the last page finishes it.
 */
export async function logPage(db: SQLiteDatabase, lib: Library, id: string, page: number, day: string = today(), opts: { start?: boolean } = {}) {
  const c = lib.collections.get(id);
  if (!c) return;
  // The starting point stays its own line, so pages read later that same day still count.
  const same = (lib.pageLog.get(id) ?? []).find((l) => l.read_on === day && !!l.start === !!opts.start);
  await putRow(db, 'page_log', { id: same?.id ?? newId(), collection_id: id, read_on: day, page: Math.max(0, Math.round(page)), start: !!opts.start });
  const finished = !!c.pages_total && page >= c.pages_total;
  if (!finished && (!c.reading_now || c.on_hold)) await putRow(db, 'collections', { ...c, reading_now: true, on_hold: false });
  if (finished) await finishBook(db, lib, id, day);
}

/** Finished on a day: the book counts as read then (and its last page is logged when you know the page count). */
export async function finishBook(db: SQLiteDatabase, lib: Library, id: string, day: string = today()) {
  const c = lib.collections.get(id);
  if (!c) return;
  for (const step of walk(lib, id)) await setIssueStatus(db, lib, step.issueId, 'read', day);
  const log = lib.pageLog.get(id) ?? [];
  if (c.pages_total && !log.some((l) => l.page >= c.pages_total!)) {
    const same = log.find((l) => l.read_on === day && !l.start);
    await putRow(db, 'page_log', { id: same?.id ?? newId(), collection_id: id, read_on: day, page: c.pages_total });
  }
  if (c.reading_now || c.on_hold) await putRow(db, 'collections', { ...c, reading_now: false, on_hold: false });
}

export const deletePageLog = (db: SQLiteDatabase, id: string) => softDelete(db, 'page_log', id);

export async function savePageNote(db: SQLiteDatabase, note: Omit<PageNote, 'id'> & { id?: string }) {
  await putRow(db, 'page_notes', { ...note, id: note.id ?? newId(), body: note.body.trim(), starred: !!note.starred });
}

export const deletePageNote = (db: SQLiteDatabase, id: string) => softDelete(db, 'page_notes', id);
