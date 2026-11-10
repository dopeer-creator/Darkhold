import type { SQLiteDatabase } from 'expo-sqlite';

import type { Library } from '@/domain/library';
import type { Issue, Series } from '@/domain/types';
import { getMeta, patchRow, setMeta } from '@/store/db';

/**
 * Covers from Comic Vine (comicvine.gamespot.com), using the reader's own free API key.
 * One series costs one volume lookup plus one request per 100 issues, so a whole library
 * stays well under Comic Vine's hourly limit. Only the image link is saved; the picture is
 * downloaded when it is first shown and then cached on the phone.
 */
const BASE = 'https://comicvine.gamespot.com/api';
const KEY = 'comicvine_key';
const PAUSE_MS = 1100;

export const getComicVineKey = (db: SQLiteDatabase) => getMeta(db, KEY);
export const setComicVineKey = (db: SQLiteDatabase, key: string) => setMeta(db, KEY, key.trim());

type CvImage = { medium_url?: string; small_url?: string; super_url?: string; original_url?: string };
export type CvVolume = { id: number; name: string; start_year: string | null; count_of_issues: number; publisher?: { name?: string } | null };
type CvIssue = { id: number; issue_number: string; image?: CvImage | null };

/** Waits before each request while the app isn't in front (set by the store, so this file stays free of React Native). */
let gate: () => Promise<void> = async () => {};
export const setRequestGate = (fn: () => Promise<void>) => {
  gate = fn;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRIES = 4;

/**
 * One Comic Vine request. A dropped connection (common right after the app comes back from the
 * background) or a busy/slow-down answer is tried again a few times, waiting a little longer each time.
 */
async function call<T>(key: string, path: string, params: Record<string, string>): Promise<{ results: T; number_of_total_results: number }> {
  const query = new URLSearchParams({ api_key: key, format: 'json', ...params }).toString();
  for (let attempt = 0; ; attempt++) {
    await gate();
    let res: Response;
    try {
      res = await fetch(`${BASE}/${path}/?${query}`, { headers: { 'User-Agent': 'Darkhold/1.0 (personal comic reading tracker)' } });
    } catch {
      if (attempt < RETRIES) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      throw new Error('Couldn’t reach Comic Vine. Check the connection and run it again.');
    }
    if ((res.status === 420 || res.status === 429 || res.status >= 500) && attempt < RETRIES) {
      await sleep(5000 * 2 ** attempt);
      continue;
    }
    if (res.status === 420 || res.status === 429) throw new Error('Comic Vine’s hourly limit is reached (about 200 lookups an hour)');
    if (!res.ok) throw new Error(`Comic Vine answered ${res.status}`);
    const json = await res.json();
    if (json.status_code !== 1) throw new Error(json.error === 'Invalid API Key' ? 'That Comic Vine key was not accepted' : `Comic Vine: ${json.error}`);
    return json;
  }
}

const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));
const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');
const pickImage = (img?: CvImage | null) => img?.medium_url ?? img?.small_url ?? img?.super_url ?? img?.original_url ?? null;

/** Checks a key with one tiny request. */
export async function testComicVineKey(key: string) {
  await call(key, 'volumes', { limit: '1', field_list: 'id' });
}

/**
 * Picks the right volume among Comic Vine results. Same name is required. With a year (Batman (2016)),
 * only a volume starting that year counts (a year either side as a last resort) — never another
 * volume of the same name, so Batman (2016) can't end up with 1940 covers. Without a year, the same
 * publisher wins, then the longest series.
 */
export function chooseVolume(series: Pick<Series, 'title' | 'volume_year' | 'publisher'>, volumes: CvVolume[]): number | null {
  const same = volumes.filter((v) => norm(v.name) === norm(series.title));
  const samePublisher = (v: CvVolume) => !!series.publisher && !!v.publisher?.name && norm(v.publisher.name).includes(norm(series.publisher));
  const best = (list: CvVolume[]) => [...list].sort((a, b) => Number(samePublisher(b)) - Number(samePublisher(a)) || b.count_of_issues - a.count_of_issues)[0]?.id ?? null;
  if (series.volume_year != null) {
    const exact = same.filter((v) => Number(v.start_year) === series.volume_year);
    if (exact.length) return best(exact);
    return best(same.filter((v) => Math.abs(Number(v.start_year) - series.volume_year!) === 1));
  }
  return best(same);
}

/** The Comic Vine volume for a series. Looks through up to 5 pages when it needs a particular year. */
export async function findVolume(key: string, series: Series): Promise<number | null> {
  const seen: CvVolume[] = [];
  for (let page = 0; page < 5; page++) {
    const { results, number_of_total_results } = await call<CvVolume[]>(key, 'volumes', {
      filter: `name:${series.title}`,
      field_list: 'id,name,start_year,count_of_issues,publisher',
      sort: 'count_of_issues:desc',
      limit: '100',
      offset: String(page * 100),
    });
    seen.push(...results);
    const found = chooseVolume(series, seen);
    // Without a year the first page already holds the longest series; with one, stop once it is found.
    if (found != null && (series.volume_year == null || seen.some((v) => v.id === found && Number(v.start_year) === series.volume_year))) return found;
    if ((page + 1) * 100 >= number_of_total_results || !results.length) return found;
    await pause();
  }
  return chooseVolume(series, seen);
}

/** Forgets a series' Comic Vine match and the covers it brought, then looks again (after fixing a name or year). */
export async function rematchSeries(db: SQLiteDatabase, lib: Library, key: string, seriesId: string): Promise<CoverRun> {
  await rememberVolume(db, lib, seriesId, null);
  for (const issue of lib.issues.values()) {
    if (issue.series_id === seriesId && issue.cover_path?.includes('comicvine')) {
      issue.cover_path = null;
      await patchRow(db, 'issues', issue.id, { cover_path: null });
    }
  }
  return fetchMissingCovers(db, lib, key, undefined, new Set([seriesId]));
}

/** Every issue in one volume, by issue number: its Comic Vine id and cover. */
export async function volumeIndex(key: string, volumeId: number): Promise<Map<string, { id: number; image: string | null }>> {
  const index = new Map<string, { id: number; image: string | null }>();
  for (let offset = 0; ; offset += 100) {
    const page = await call<CvIssue[]>(key, 'issues', { filter: `volume:${volumeId}`, field_list: 'id,issue_number,image', limit: '100', offset: String(offset) });
    for (const i of page.results) {
      if (i.issue_number != null) index.set(String(i.issue_number).trim(), { id: i.id, image: pickImage(i.image) });
    }
    if (offset + 100 >= page.number_of_total_results || !page.results.length) break;
    await pause();
  }
  return index;
}

/** Every cover in one volume, by issue number. */
export async function volumeCovers(key: string, volumeId: number): Promise<Map<string, string>> {
  const covers = new Map<string, string>();
  for (const [n, v] of await volumeIndex(key, volumeId)) if (v.image) covers.set(n, v.image);
  return covers;
}

export interface CoverRun {
  found: number;
  missing: number;
  seriesNotFound: string[];
  /** Set when the run ended before the last series: "Stopped" or what went wrong. */
  stoppedEarly?: string | null;
}

/** Fills in covers for issues that have none. Issues with a cover (found or pasted) are left alone. */
export async function fetchMissingCovers(
  db: SQLiteDatabase,
  lib: Library,
  key: string,
  onProgress?: (done: number, total: number, title: string) => void,
  onlySeries?: Set<string>,
  shouldStop?: () => boolean,
): Promise<CoverRun> {
  const bySeries = new Map<string, Issue[]>();
  for (const i of lib.issues.values()) {
    if (i.cover_path || i.number == null || (onlySeries && !onlySeries.has(i.series_id))) continue;
    bySeries.set(i.series_id, [...(bySeries.get(i.series_id) ?? []), i]);
  }
  const run: CoverRun = { found: 0, missing: 0, seriesNotFound: [], stoppedEarly: null };
  let done = 0;
  for (const [seriesId, issues] of bySeries) {
    if (shouldStop?.()) {
      run.stoppedEarly = 'Stopped';
      break;
    }
    const series = lib.series.get(seriesId);
    done++;
    if (!series) continue;
    onProgress?.(done, bySeries.size, series.title);
    try {
      let volumeId = await rememberedVolume(db, lib, seriesId);
      if (!volumeId) {
        volumeId = await findVolume(key, series);
        await pause();
        if (volumeId) await rememberVolume(db, lib, seriesId, volumeId);
      }
      if (!volumeId) {
        run.seriesNotFound.push(series.volume_year ? `${series.title} (${series.volume_year})` : series.title);
        run.missing += issues.length;
        continue;
      }
      const covers = await volumeCovers(key, volumeId);
      await pause();
      for (const issue of issues) {
        const url = covers.get(issue.number!);
        if (url) {
          await patchRow(db, 'issues', issue.id, { cover_path: url, upcoming: false });
          run.found++;
        } else {
          run.missing++;
        }
      }
    } catch (e) {
      run.stoppedEarly = e instanceof Error ? e.message : String(e);
      break;
    }
  }
  return run;
}

/** A Comic Vine volume as shown in the cover picker. */
export interface VolumeChoice {
  id: number;
  name: string;
  startYear: number | null;
  publisher: string | null;
  issues: number;
  image: string | null;
}

type CvVolumeWithImage = CvVolume & { image?: CvImage | null };
const toChoice = (v: CvVolumeWithImage): VolumeChoice => ({
  id: v.id,
  name: v.name,
  startYear: v.start_year ? Number(v.start_year) : null,
  publisher: v.publisher?.name ?? null,
  issues: v.count_of_issues,
  image: pickImage(v.image),
});

/**
 * Free-text volume search with covers, for picking a run or event cover — trade paperbacks and
 * omnibuses are volumes on Comic Vine too ("Batman by Grant Morrison Omnibus").
 */
export async function searchVolumes(key: string, query: string): Promise<VolumeChoice[]> {
  const { results } = await call<CvVolumeWithImage[]>(key, 'search', {
    query,
    resources: 'volume',
    field_list: 'id,name,start_year,count_of_issues,publisher,image',
    limit: '40',
  });
  return results.map(toChoice);
}

/** Every Comic Vine volume with a series' exact name, newest first, so the right one can be picked by hand. */
export async function volumesNamed(key: string, title: string): Promise<VolumeChoice[]> {
  const { results } = await call<CvVolumeWithImage[]>(key, 'volumes', {
    filter: `name:${title}`,
    field_list: 'id,name,start_year,count_of_issues,publisher,image',
    sort: 'count_of_issues:desc',
    limit: '100',
  });
  return results
    .filter((v) => norm(v.name) === norm(title))
    .map(toChoice)
    .sort((a, b) => (b.startYear ?? 0) - (a.startYear ?? 0));
}

/**
 * Uses one Comic Vine volume for a series from now on and pulls its covers. Comic Vine covers from
 * an earlier match are replaced; links you pasted yourself are kept.
 */
export async function applyVolumeToSeries(db: SQLiteDatabase, lib: Library, key: string, seriesId: string, volumeId: number) {
  await rememberVolume(db, lib, seriesId, volumeId);
  const covers = await volumeCovers(key, volumeId);
  let found = 0;
  for (const issue of lib.issues.values()) {
    if (issue.series_id !== seriesId || issue.number == null) continue;
    if (issue.cover_path && !issue.cover_path.includes('comicvine')) continue;
    const url = covers.get(issue.number) ?? null;
    if (url) found++;
    if (url !== issue.cover_path || (url && issue.upcoming)) await patchRow(db, 'issues', issue.id, { cover_path: url, upcoming: url ? false : !!issue.upcoming });
  }
  return found;
}


type CvCredit = { name: string; role?: string | null };
type CvIssueDetail = { name?: string | null; cover_date?: string | null; person_credits?: CvCredit[] | null };

/** Comic Vine roles → our two lists. "penciler, inker" counts as art; covers and letters don't. */
export function splitCredits(credits: CvCredit[]): { writers: string[]; artists: string[] } {
  const writers: string[] = [];
  const artists: string[] = [];
  for (const c of credits) {
    const roles = (c.role ?? '').toLowerCase().split(',').map((r) => r.trim());
    if (roles.includes('writer') || roles.includes('plotter') || roles.includes('script')) writers.push(c.name);
    if (roles.some((r) => r === 'artist' || r === 'penciler' || r === 'penciller')) artists.push(c.name);
  }
  return { writers: [...new Set(writers)], artists: [...new Set(artists)] };
}

/** One issue's story title, cover date and credits. */
export async function issueCredits(key: string, cvIssueId: number) {
  const { results } = await call<CvIssueDetail>(key, `issue/4000-${cvIssueId}`, { field_list: 'name,cover_date,person_credits' });
  const { writers, artists } = splitCredits(results.person_credits ?? []);
  return {
    story_title: results.name?.trim() || null,
    cover_date: results.cover_date && /^\d{4}-\d{2}-\d{2}$/.test(results.cover_date) ? results.cover_date : null,
    writers: writers.join(', ') || null,
    artists: artists.join(', ') || null,
  };
}

export interface DetailsRun {
  filled: number;
  skipped: number;
  notFound: number;
  stoppedEarly: string | null;
}

/**
 * Fills writer, artist, story title and cover date for the given issues. Issues that already have
 * a writer are skipped, so it can be run again after a stop. One request per issue, about one a
 * second — Comic Vine allows roughly 200 an hour, so it stops politely when told to slow down.
 */
export async function fillDetails(
  db: SQLiteDatabase,
  lib: Library,
  key: string,
  issueIds: string[],
  onProgress?: (done: number, total: number, label: string) => void,
  shouldStop?: () => boolean,
  force = false,
): Promise<DetailsRun> {
  // Issues you've read first, so writer pages fill in for what you know before the rest.
  const todo = issueIds
    .map((id) => lib.issues.get(id))
    .filter((i): i is Issue => !!i && i.number != null && (force || !i.writers))
    .sort((a, b) => Number(b.status === 'read') - Number(a.status === 'read'));
  const run: DetailsRun = { filled: 0, skipped: issueIds.length - todo.length, notFound: 0, stoppedEarly: null };
  const indexes = new Map<string, Map<string, { id: number; image: string | null }> | null>();
  let done = 0;
  for (const issue of todo) {
    if (shouldStop?.()) {
      run.stoppedEarly = 'Stopped';
      break;
    }
    const series = lib.series.get(issue.series_id);
    onProgress?.(done, todo.length, series ? `${series.title} #${issue.number}` : '');
    try {
      let cvId = issue.cv_issue_id ?? null;
      if (!cvId && series) {
        if (!indexes.has(series.id)) {
          const cached = await rememberedVolume(db, lib, series.id);
          const volumeId = cached ?? (await findVolume(key, series));
          if (volumeId && !cached) await rememberVolume(db, lib, series.id, volumeId);
          indexes.set(series.id, volumeId ? await volumeIndex(key, volumeId) : null);
          await pause();
        }
        const entry = indexes.get(series.id)?.get(issue.number!);
        cvId = entry?.id ?? null;
        if (entry?.image && !issue.cover_path) issue.cover_path = entry.image;
      }
      if (!cvId) {
        run.notFound++;
      } else {
        const details = await issueCredits(key, cvId);
        await patchRow(db, 'issues', issue.id, { ...details, cv_issue_id: cvId, writers: details.writers ?? issue.writers ?? null, cover_path: issue.cover_path ?? null, upcoming: false });
        run.filled++;
        await pause();
      }
    } catch (e) {
      run.stoppedEarly = e instanceof Error ? e.message : String(e);
      break;
    }
    done++;
  }
  return run;
}

/** The Comic Vine volume a series was matched to: saved on the series (synced), or from older local notes. */
async function rememberedVolume(db: SQLiteDatabase, lib: Library, seriesId: string): Promise<number | null> {
  return lib.series.get(seriesId)?.cv_volume_id ?? (Number(await getMeta(db, `cv:volume:${seriesId}`)) || null);
}

/** Saves (or forgets, with null) which Comic Vine volume a series is, so the same comic always matches the same way. */
async function rememberVolume(db: SQLiteDatabase, lib: Library, seriesId: string, volumeId: number | null) {
  await setMeta(db, `cv:volume:${seriesId}`, volumeId ? String(volumeId) : '');
  const series = lib.series.get(seriesId);
  if (series && (series.cv_volume_id ?? null) !== volumeId) {
    series.cv_volume_id = volumeId;
    await patchRow(db, 'series', series.id, { cv_volume_id: volumeId });
  }
}
