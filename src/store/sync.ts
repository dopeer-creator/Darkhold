import type { SQLiteDatabase } from 'expo-sqlite';

import { supabase } from '@/lib/supabase';
import { BOOLEAN_COLUMNS, COLUMNS, getMeta, putRow, setMeta, TABLES, type Table } from './db';

// Parents before children, so foreign keys exist when rows arrive.
const ORDER: Table[] = ['series', 'collections', 'issues', 'entries', 'read_log', 'links', 'reviews'];

/**
 * Two-way sync with Supabase. Phone changes upload first (Supabase stamps the time),
 * then anything newer than the last pull comes down. A row changed on the phone and not
 * yet uploaded is never overwritten by a download.
 */
export async function syncNow(db: SQLiteDatabase): Promise<{ pushed: number; pulled: number }> {
  let pushed = 0;
  let pulled = 0;
  for (const table of ORDER) {
    const dirty = await db.getAllAsync<Record<string, unknown>>(
      `SELECT ${[...COLUMNS[table], 'updated_at', 'deleted_at'].join(',')} FROM ${table} WHERE dirty = 1`,
    );
    if (!dirty.length) continue;
    const rows = dirty.map((r) => {
      const out: Record<string, unknown> = {};
      for (const c of COLUMNS[table]) out[c] = BOOLEAN_COLUMNS.has(c) ? !!r[c] : r[c];
      out.deleted_at = r.deleted_at;
      return out;
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500));
      if (error) throw new Error(`Upload ${table}: ${error.message}`);
    }
    for (const r of dirty) {
      await db.runAsync(`UPDATE ${table} SET dirty = 0 WHERE id = ? AND updated_at IS ?`, r.id as string, r.updated_at as string);
    }
    pushed += dirty.length;
  }

  for (const table of ORDER) {
    const cursorKey = `pulled:${table}`;
    let cursor = (await getMeta(db, cursorKey)) ?? '1970-01-01T00:00:00Z';
    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select([...COLUMNS[table], 'updated_at', 'deleted_at'].join(','))
        .gt('updated_at', cursor)
        .order('updated_at')
        .limit(1000);
      if (error) throw new Error(`Download ${table}: ${error.message}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      for (const row of rows) {
        const local = await db.getFirstAsync<{ dirty: number }>(`SELECT dirty FROM ${table} WHERE id = ?`, row.id as string);
        if (!local?.dirty) await putRow(db, table, row, { dirty: false });
        cursor = row.updated_at as string;
      }
      pulled += rows.length;
      await setMeta(db, cursorKey, cursor);
      if (rows.length < 1000) break;
    }
  }
  return { pushed, pulled };
}

export async function hasPendingUploads(db: SQLiteDatabase) {
  for (const t of TABLES) {
    if (await db.getFirstAsync(`SELECT 1 FROM ${t} WHERE dirty = 1 LIMIT 1`)) return true;
  }
  return false;
}
