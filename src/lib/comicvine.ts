import type { SQLiteDatabase } from 'expo-sqlite';

import type { Library } from '@/domain/library';
import type { Issue, Series } from '@/domain/types';
import { getMeta, putRow, setMeta } from '@/store/db';

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
type CvVolume = { id: number; name: string; start_year: string | null; count_of_issues: number; publisher?: { name?: string } | null };
type CvIssue = { issue_number: string; image?: CvImage | null };

async function call<T>(key: string, path: string, params: Record<string, string>): Promise<{ results: T; number_of_total_results: number }> {
  const query = new URLSearchParams({ api_key: key, format: 'json', ...params }).toString();
  const res = await fetch(`${BASE}/${path}/?${query}`, { headers: { 'User-Agent': 'Darkhold/1.0 (personal comic reading tracker)' } });
  if (!res.ok) throw new Error(`Comic Vine answered ${res.status}`);
  const json = await res.json();
  if (json.status_code !== 1) throw new Error(json.error === 'Invalid API Key' ? 'That Comic Vine key was not accepted' : `Comic Vine: ${json.error}`);
  return json;
}

const pause = () => new Promise((r) => setTimeout(r, PAUSE_MS));
const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');
const pickImage = (img?: CvImage | null) => img?.medium_url ?? img?.small_url ?? img?.super_url ?? img?.original_url ?? null;

/** Checks a key with one tiny request. */
export async function testComicVineKey(key: string) {
  await call(key, 'volumes', { limit: '1', field_list: 'id' });
}

/** The Comic Vine volume for a series: same name, then same start year, then same publisher, then the longest. */
export async function findVolume(key: string, series: Series): Promise<number | null> {
  const { results } = await call<CvVolume[]>(key, 'volumes', {
    filter: `name:${series.title}`,
    field_list: 'id,name,start_year,count_of_issues,publisher',
    sort: 'count_of_issues:desc',
    limit: '100',
  });
  const same = results.filter((v) => norm(v.name) === norm(series.title));
  if (!same.length) return null;
  const score = (v: CvVolume) =>
    (series.volume_year != null && Number(v.start_year) === series.volume_year ? 4 : 0) +
    (series.publisher && v.publisher?.name && norm(v.publisher.name).includes(norm(series.publisher)) ? 2 : 0);
  return [...same].sort((a, b) => score(b) - score(a) || b.count_of_issues - a.count_of_issues)[0].id;
}

/** Every cover in one volume, by issue number. */
export async function volumeCovers(key: string, volumeId: number): Promise<Map<string, string>> {
  const covers = new Map<string, string>();
  for (let offset = 0; ; offset += 100) {
    const page = await call<CvIssue[]>(key, 'issues', { filter: `volume:${volumeId}`, field_list: 'issue_number,image', limit: '100', offset: String(offset) });
    for (const i of page.results) {
      const url = pickImage(i.image);
      if (url && i.issue_number != null) covers.set(String(i.issue_number).trim(), url);
    }
    if (offset + 100 >= page.number_of_total_results || !page.results.length) break;
    await pause();
  }
  return covers;
}

export interface CoverRun {
  found: number;
  missing: number;
  seriesNotFound: string[];
}

/** Fills in covers for issues that have none. Issues with a cover (found or pasted) are left alone. */
export async function fetchMissingCovers(db: SQLiteDatabase, lib: Library, key: string, onProgress?: (done: number, total: number, title: string) => void): Promise<CoverRun> {
  const bySeries = new Map<string, Issue[]>();
  for (const i of lib.issues.values()) {
    if (i.cover_path || i.number == null) continue;
    bySeries.set(i.series_id, [...(bySeries.get(i.series_id) ?? []), i]);
  }
  const run: CoverRun = { found: 0, missing: 0, seriesNotFound: [] };
  let done = 0;
  for (const [seriesId, issues] of bySeries) {
    const series = lib.series.get(seriesId);
    done++;
    if (!series) continue;
    onProgress?.(done, bySeries.size, series.title);
    const cacheKey = `cv:volume:${seriesId}`;
    let volumeId = Number(await getMeta(db, cacheKey)) || null;
    if (!volumeId) {
      volumeId = await findVolume(key, series);
      await pause();
      if (volumeId) await setMeta(db, cacheKey, String(volumeId));
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
        await putRow(db, 'issues', { ...issue, cover_path: url });
        run.found++;
      } else {
        run.missing++;
      }
    }
  }
  return run;
}
