import type { SQLiteDatabase } from 'expo-sqlite';

import { formatOf } from '@/domain/modes';
import type { Library } from '@/domain/library';
import type { Format, Issue, ReleaseEvery, ReleaseStatus, Series } from '@/domain/types';
import { patchRow, putRow } from './db';
import { nextOnOrAfter, stepDay } from '@/domain/chapters';
import { appendEntry, createCollection, insertInOrder, newId, removeEntries, today } from './repo';

export { nextOnOrAfter, parseChapterRange, stepDay } from '@/domain/chapters';

/** One part of a new book or manga: an optional heading ("Vol. 3 · Ch. 18–26", "Book One") and its chapters. */
export interface WorkSection {
  heading: string | null;
  note?: string | null;
  /** Chapter numbers ("1", "19.5"), or labels for unnumbered ones ("Prologue"). */
  chapters: { number: string | null; label?: string | null }[];
}

export interface NewWork {
  format: Exclude<Format, 'comic'>;
  title: string;
  writer: string | null;
  artist: string | null;
  year: number | null;
  publisher: string | null;
  cover: string | null;
  description: string | null;
  anilistId?: number | null;
  olKey?: string | null;
  releaseStatus?: ReleaseStatus | null;
  sections: WorkSection[];
  /** A book series this belongs to ("The Witcher"): found or made, and this book added at its end. */
  seriesName?: string | null;
}

const chapterRow = (seriesId: string, number: string | null, label: string | null): Issue => ({
  id: newId(), series_id: seriesId, number, label, status: 'unread', completed_at: null, date_precision: 'unknown', rating: null, notes: null,
  cover_path: null, pub_year: null, upcoming: false, release_on: null, characters: null,
});

/** Makes a book or manga: its series, its list (a BOOK or MANGA) and every chapter, under its headings. Returns the list. */
export async function createWork(db: SQLiteDatabase, lib: Library, w: NewWork): Promise<string> {
  const seriesId = newId();
  const series: Series = {
    id: seriesId, title: w.title, volume_year: w.year, publisher: w.publisher, format: w.format, anilist_id: w.anilistId ?? null, ol_key: w.olKey ?? null,
    release_status: w.releaseStatus ?? null, release_every: null, release_next: null, release_paused: false,
  };
  let listId = '';
  await db.withTransactionAsync(async () => {
    await putRow(db, 'series', series);
    lib.series.set(seriesId, series);
    listId = await createCollection(db, {
      kind: 'run', title: w.title, format: w.format, writer: w.writer, artist: w.artist, publisher: w.publisher, start_year: w.year,
      cover_path: w.cover, description: w.description, ongoing: w.releaseStatus === 'releasing' || w.releaseStatus === 'hiatus',
    });
    let pos = 0;
    for (const sec of w.sections) {
      if (sec.heading) await appendEntry(db, lib, listId, { heading: sec.heading, note: sec.note ?? null }, (pos += 1024));
      for (const ch of sec.chapters) {
        const issue = chapterRow(seriesId, ch.number, ch.label ?? null);
        await putRow(db, 'issues', issue);
        lib.issues.set(issue.id, issue);
        await appendEntry(db, lib, listId, { child_issue_id: issue.id }, (pos += 1024));
      }
    }
    if (w.seriesName?.trim()) {
      const name = w.seriesName.trim();
      const parent =
        [...lib.collections.values()].find((c) => c.kind === 'crisis' && formatOf(c) === w.format && c.title.toLowerCase() === name.toLowerCase())?.id ??
        (await createCollection(db, { kind: 'crisis', title: name, format: w.format, writer: w.writer }));
      await appendEntry(db, lib, parent, { child_collection_id: listId });
    }
  });
  return listId;
}

/** Adds chapters to a book or manga: new numbers only, at the end (or under a new heading). */
export async function addChapters(db: SQLiteDatabase, lib: Library, listId: string, seriesId: string, numbers: string[], heading: string | null) {
  const have = new Set([...lib.issues.values()].filter((i) => i.series_id === seriesId && i.number != null).map((i) => i.number));
  const fresh = numbers.filter((n) => !have.has(n));
  if (!fresh.length) return 0;
  await db.withTransactionAsync(async () => {
    // A book added as one "Whole book" line gets its chapters now: that line goes (unless it was ticked).
    const whole = (lib.children.get(listId) ?? []).filter((e) => {
      const i = e.child_issue_id ? lib.issues.get(e.child_issue_id) : undefined;
      return i && i.number == null && i.label === 'Whole book' && i.status !== 'read';
    });
    if (whole.length) {
      await removeEntries(db, whole.map((e) => e.id));
      lib.children.set(listId, (lib.children.get(listId) ?? []).filter((e) => !whole.includes(e)));
    }
    if (heading) await appendEntry(db, lib, listId, { heading });
    for (const n of fresh) {
      const issue = chapterRow(seriesId, n, null);
      await putRow(db, 'issues', issue);
      lib.issues.set(issue.id, issue);
      await appendEntry(db, lib, listId, { child_issue_id: issue.id });
    }
  });
  return fresh.length;
}

// ---- Manga release schedules --------------------------------------------------------------------------------

/** A schedule is running when it has a day and isn't paused, on hiatus or finished. */
export const scheduleRuns = (s: Series) => !!s.release_every && !!s.release_next && !s.release_paused && s.release_status !== 'hiatus' && s.release_status !== 'finished';

export async function setSchedule(db: SQLiteDatabase, seriesId: string, every: ReleaseEvery | null, next: string | null) {
  await patchRow(db, 'series', seriesId, { release_every: every, release_next: every ? next : null, release_paused: false });
}
export async function setPaused(db: SQLiteDatabase, seriesId: string, paused: boolean) {
  await patchRow(db, 'series', seriesId, { release_paused: paused });
}
export async function setReleaseStatus(db: SQLiteDatabase, seriesId: string, status: ReleaseStatus | null) {
  await patchRow(db, 'series', seriesId, { release_status: status });
}

/** The chapter waiting on Release radar for a series (not out yet, not read), if any. */
export const pendingChapter = (lib: Library, seriesId: string) =>
  [...lib.issues.values()].filter((i) => i.series_id === seriesId && i.upcoming && i.status !== 'read' && i.release_on && i.release_on > today()).sort((a, b) => (a.release_on! < b.release_on! ? -1 : 1))[0];

/** No chapter this week: the waiting chapter, and the schedule, move one step later. */
export async function skipRelease(db: SQLiteDatabase, lib: Library, seriesId: string) {
  const s = lib.series.get(seriesId);
  if (!s?.release_every || !s.release_next) return;
  const waiting = pendingChapter(lib, seriesId);
  if (waiting?.release_on) await patchRow(db, 'issues', waiting.id, { release_on: stepDay(waiting.release_on, s.release_every) });
  await patchRow(db, 'series', seriesId, { release_next: stepDay(s.release_next, s.release_every) });
}

const numeric = (i: Issue) => (i.number != null && !Number.isNaN(parseFloat(i.number)) ? parseFloat(i.number) : -Infinity);

/**
 * Keeps one chapter coming for each running schedule: when the last scheduled chapter is out, the next one
 * (last number + 1) goes in on the next release day, in every list that holds the series' latest chapter.
 * Returns true when it changed anything.
 */
export async function advanceSchedule(db: SQLiteDatabase, lib: Library, s: Series): Promise<boolean> {
  if (!scheduleRuns(s) || formatOf(s) !== 'manga') return false;
  const day = today();
  const mine = [...lib.issues.values()].filter((i) => i.series_id === s.id);
  if (mine.some((i) => i.upcoming && i.status !== 'read' && i.release_on && i.release_on > day)) return false;
  const latest = mine.filter((i) => numeric(i) > -Infinity).sort((a, b) => numeric(b) - numeric(a))[0];
  const next = nextOnOrAfter(s.release_next!, s.release_every!, day);
  const number = latest ? String(Math.floor(numeric(latest)) + 1) : '1';
  const issue: Issue = { ...chapterRow(s.id, number, null), upcoming: true, release_on: next };
  await putRow(db, 'issues', issue);
  lib.issues.set(issue.id, issue);
  const homes = latest ? (lib.parents.get(latest.id) ?? []).filter((p) => lib.collections.has(p)) : [];
  for (const listId of homes) await insertInOrder(db, lib, listId, issue.id, s.id, number);
  await patchRow(db, 'series', s.id, { release_next: next });
  return true;
}
