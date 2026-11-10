import type { SQLiteDatabase } from 'expo-sqlite';

/** Tables mirrored from Supabase. `dirty` = changed on this phone and not yet uploaded. */
export const TABLES = ['series', 'issues', 'collections', 'entries', 'read_log', 'links', 'reviews'] as const;
export type Table = (typeof TABLES)[number];

/** Columns synced for each table (everything except user_id, which Supabase fills in). */
export const COLUMNS: Record<Table, string[]> = {
  series: ['id', 'title', 'volume_year', 'publisher', 'cv_volume_id'],
  issues: ['id', 'series_id', 'number', 'label', 'status', 'completed_at', 'date_precision', 'rating', 'notes', 'cover_path', 'pub_year', 'story_title', 'writers', 'artists', 'cover_date', 'cv_issue_id', 'upcoming', 'release_on', 'characters'],
  collections: ['id', 'kind', 'title', 'publisher', 'writer', 'artist', 'characters', 'start_year', 'end_year', 'description', 'cover_path', 'on_hold', 'ongoing', 'rating', 'notes', 'label', 'planned', 'reading_now', 'reread_since'],
  entries: ['id', 'parent_id', 'position', 'child_issue_id', 'child_collection_id', 'via_collection_id', 'heading', 'note', 'optional'],
  read_log: ['id', 'issue_id', 'read_on', 'date_precision', 'rating', 'note', 'reread'],
  links: ['id', 'kind', 'from_collection_id', 'from_issue_id', 'to_collection_id', 'to_issue_id', 'note'],
  reviews: ['id', 'collection_id', 'issue_id', 'verdict', 'score', 'body', 'reviewed_on'],
};

/** Yes/no columns: stored as 0/1 here, true/false in Supabase. */
export const BOOLEAN_COLUMNS = new Set(['on_hold', 'ongoing', 'planned', 'reading_now', 'optional', 'upcoming', 'reread']);

const SCHEMA_VERSION = 10;

/** Columns added after the first version, by schema version. */
const ADDED: Record<number, [Table, string, string][]> = {
  // 2: slices — an issue entry can name the run or event it is a piece of.
  2: [['entries', 'via_collection_id', 'TEXT']],
  // 3: ongoing runs.
  3: [['collections', 'ongoing', 'INTEGER NOT NULL DEFAULT 0']],
  // 4: credits per issue.
  4: [
    ['issues', 'story_title', 'TEXT'],
    ['issues', 'writers', 'TEXT'],
    ['issues', 'artists', 'TEXT'],
    ['issues', 'cover_date', 'TEXT'],
    ['issues', 'cv_issue_id', 'INTEGER'],
  ],
  // 5: chapter headings.
  5: [['entries', 'heading', 'TEXT']],
  // 6: labels, plan to read, optional lines, Comic Vine match per series (links table below).
  6: [
    ['collections', 'label', 'TEXT'],
    ['collections', 'planned', 'INTEGER NOT NULL DEFAULT 0'],
    ['entries', 'optional', 'INTEGER NOT NULL DEFAULT 0'],
    ['series', 'cv_volume_id', 'INTEGER'],
  ],
  // 7: "not out yet" issues and their release date.
  7: [
    ['issues', 'upcoming', 'INTEGER NOT NULL DEFAULT 0'],
    ['issues', 'release_on', 'TEXT'],
  ],
  // 8: the Reading now switch on a list.
  8: [['collections', 'reading_now', 'INTEGER NOT NULL DEFAULT 0']],
  // 9: character tags on issues (the reviews table is below).
  9: [['issues', 'characters', 'TEXT']],
  // 10: rereads (a history line that's a reread, and a finished list being read again).
  10: [
    ['read_log', 'reread', 'INTEGER NOT NULL DEFAULT 0'],
    ['collections', 'reread_since', 'TEXT'],
  ],
};

/** Extra one-off work for a version, run inside the same transaction. */
const AFTER: Record<number, string[]> = {
  // Lines downloaded before the heading column existed here lost their heading text: fetch them again.
  5: ["DELETE FROM meta WHERE key = 'pulled:entries'"],
  6: [
    `CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, from_collection_id TEXT, from_issue_id TEXT,
      to_collection_id TEXT, to_issue_id TEXT, note TEXT, updated_at TEXT, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0)`,
  ],
  // Lists downloaded before the Reading now column existed here lost that switch: fetch them again.
  8: ["DELETE FROM meta WHERE key = 'pulled:collections'"],
  // Reviews, and issues fetched again so their character tags arrive.
  9: [
    `CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY NOT NULL, collection_id TEXT, issue_id TEXT, verdict TEXT NOT NULL, score REAL,
      body TEXT, reviewed_on TEXT, updated_at TEXT, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0)`,
    "DELETE FROM meta WHERE key = 'pulled:issues'",
  ],
};

/**
 * Brings the phone's database up to date. Each step only adds columns that are missing and records
 * its version in the same transaction, so an app closed halfway through simply carries on next time.
 */
export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;
  if (version < 1) {
    await createTables(db);
    await db.execAsync('PRAGMA user_version = 1');
    version = 1;
  }
  for (let v = version + 1; v <= SCHEMA_VERSION; v++) {
    await db.withTransactionAsync(async () => {
      for (const [table, column, type] of ADDED[v] ?? []) {
        const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
        if (!cols.some((c) => c.name === column)) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
      }
      for (const sql of AFTER[v] ?? []) await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${v}`);
    });
  }
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
    if (v == null && BOOLEAN_COLUMNS.has(c)) return 0;
    return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null);
  });
  await db.runAsync(
    `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    values as (string | number | null)[],
  );
}

/**
 * Changes some columns of one row, starting from what is saved now. Long jobs (covers, details) use
 * this so they never undo a change made meanwhile, like an issue ticked read while covers download.
 */
export async function patchRow(db: SQLiteDatabase, table: Table, id: string, patch: Record<string, unknown>) {
  const current = await db.getFirstAsync<Record<string, unknown>>(`SELECT ${[...COLUMNS[table], 'deleted_at'].join(',')} FROM ${table} WHERE id = ?`, id);
  if (!current || current.deleted_at) return;
  await putRow(db, table, { ...current, ...patch });
}

export async function getMeta(db: SQLiteDatabase, key: string) {
  return (await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key))?.value ?? null;
}

export async function setMeta(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
}
