import type { SQLiteDatabase } from 'expo-sqlite';

/** Tables mirrored from Supabase. `dirty` = changed on this phone and not yet uploaded. */
export const TABLES = ['series', 'issues', 'collections', 'entries', 'read_log'] as const;
export type Table = (typeof TABLES)[number];

/** Columns synced for each table (everything except user_id, which Supabase fills in). */
export const COLUMNS: Record<Table, string[]> = {
  series: ['id', 'title', 'volume_year', 'publisher'],
  issues: ['id', 'series_id', 'number', 'label', 'status', 'completed_at', 'date_precision', 'rating', 'notes', 'cover_path', 'pub_year'],
  collections: ['id', 'kind', 'title', 'publisher', 'writer', 'artist', 'characters', 'start_year', 'end_year', 'description', 'cover_path', 'on_hold', 'rating', 'notes'],
  entries: ['id', 'parent_id', 'position', 'child_issue_id', 'child_collection_id', 'via_collection_id', 'note'],
  read_log: ['id', 'issue_id', 'read_on', 'date_precision', 'rating', 'note'],
};

const SCHEMA_VERSION = 2;

export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;
  if (version < 1) await createTables(db);
  // 2: slices — an issue entry can name the run or event it is a piece of.
  if (version < 2) await db.execAsync('ALTER TABLE entries ADD COLUMN via_collection_id TEXT;');
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

async function createTables(db: SQLiteDatabase) {
  const sync = 'updated_at TEXT, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0';
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS series (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, volume_year INTEGER, publisher TEXT, ${sync});
    CREATE TABLE IF NOT EXISTS issues (id TEXT PRIMARY KEY NOT NULL, series_id TEXT NOT NULL, number TEXT, label TEXT,
      status TEXT NOT NULL DEFAULT 'unread', completed_at TEXT, date_precision TEXT NOT NULL DEFAULT 'unknown',
      rating INTEGER, notes TEXT, cover_path TEXT, pub_year INTEGER, ${sync});
    CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, publisher TEXT,
      writer TEXT, artist TEXT, characters TEXT, start_year INTEGER, end_year INTEGER, description TEXT, cover_path TEXT,
      on_hold INTEGER NOT NULL DEFAULT 0, rating INTEGER, notes TEXT, ${sync});
    CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY NOT NULL, parent_id TEXT NOT NULL, position REAL NOT NULL,
      child_issue_id TEXT, child_collection_id TEXT, note TEXT, ${sync});
    CREATE TABLE IF NOT EXISTS read_log (id TEXT PRIMARY KEY NOT NULL, issue_id TEXT NOT NULL, read_on TEXT,
      date_precision TEXT NOT NULL DEFAULT 'day', rating INTEGER, note TEXT, ${sync});
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
    CREATE INDEX IF NOT EXISTS entries_parent ON entries (parent_id, position);
  `);
}

/** Writes one row and marks it for upload. */
export async function putRow(db: SQLiteDatabase, table: Table, data: object, opts: { dirty?: boolean } = {}) {
  const row = data as Record<string, unknown>;
  const cols = [...COLUMNS[table], 'updated_at', 'deleted_at', 'dirty'];
  const values = cols.map((c) => {
    if (c === 'dirty') return opts.dirty === false ? 0 : 1;
    if (c === 'updated_at') return (row.updated_at as string) ?? new Date().toISOString();
    const v = row[c];
    return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null);
  });
  await db.runAsync(
    `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    values as (string | number | null)[],
  );
}

export async function getMeta(db: SQLiteDatabase, key: string) {
  return (await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key))?.value ?? null;
}

export async function setMeta(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
}
