import type { SQLiteDatabase } from 'expo-sqlite';

import type { ReleaseStatus } from '@/domain/types';
import { getMeta, setMeta } from '@/store/db';

/**
 * Where books and manga get their covers and details. None needs a key:
 * AniList (manga details and status), MangaDex (which chapters are in which volume),
 * Apple Books (book covers, sharp ones), Open Library (page counts and details) and
 * Google Books (off unless you switch it on; an optional key gives it more requests).
 */

export type SourceKey = 'anilist' | 'mangadex' | 'hiatus' | 'googlebooks' | 'apple';
/** Each source is on until you switch it off in Profile, except Google Books: off until you switch it on. */
export const sourceOn = async (db: SQLiteDatabase, key: SourceKey) => {
  const v = await getMeta(db, `src:${key}`);
  return key === 'googlebooks' ? v === 'on' : v !== 'off';
};
export const setSourceOn = (db: SQLiteDatabase, key: SourceKey, on: boolean) => setMeta(db, `src:${key}`, on ? 'on' : 'off');
export const getGoogleBooksKey = (db: SQLiteDatabase) => getMeta(db, 'gb:key');
export const setGoogleBooksKey = (db: SQLiteDatabase, key: string) => setMeta(db, 'gb:key', key.trim());

/** One search result, the same shape for every source. */
export interface Found {
  source: 'anilist' | 'openlibrary' | 'googlebooks' | 'apple';
  id: string;
  title: string;
  /** Author, or the mangaka's story credit. */
  writer: string | null;
  /** Manga only: the art credit, when it's someone else. */
  artist: string | null;
  year: number | null;
  cover: string | null;
  publisher: string | null;
  description: string | null;
  /** Manga: chapters and volumes once it has finished (AniList leaves them empty while it runs). */
  chapters: number | null;
  volumes: number | null;
  status: ReleaseStatus | null;
  pages: number | null;
}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

const clean = (html: string | null | undefined) =>
  html ? html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\(Source:[^)]*\)/gi, '').replace(/\n{3,}/g, '\n\n').trim() || null : null;

// ---- AniList ---------------------------------------------------------------------------------------------

const ANILIST = 'https://graphql.anilist.co';
const anilist = (query: string, variables: Record<string, unknown>) =>
  getJson(ANILIST, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) });

const STATUS: Record<string, ReleaseStatus> = { RELEASING: 'releasing', NOT_YET_RELEASED: 'releasing', HIATUS: 'hiatus', FINISHED: 'finished', CANCELLED: 'finished' };

type AniMedia = {
  id: number;
  title: { english: string | null; romaji: string | null };
  coverImage: { extraLarge: string | null; large: string | null };
  staff: { edges: { role: string; node: { name: { full: string } } }[] };
  status: string | null;
  chapters: number | null;
  volumes: number | null;
  startDate: { year: number | null };
  description: string | null;
};

function fromAniList(m: AniMedia): Found {
  const names = (test: (role: string) => boolean) => [...new Set(m.staff.edges.filter((e) => test(e.role)).map((e) => e.node.name.full))].join(', ') || null;
  const writer = names((r) => /story/i.test(r));
  const art = names((r) => /\bart\b/i.test(r) && !/story/i.test(r));
  return {
    source: 'anilist', id: String(m.id), title: m.title.english ?? m.title.romaji ?? 'Untitled', writer: writer ?? art, artist: art && art !== writer ? art : null,
    year: m.startDate?.year ?? null, cover: m.coverImage.extraLarge ?? m.coverImage.large, publisher: null, description: clean(m.description),
    chapters: m.chapters, volumes: m.volumes, status: m.status ? (STATUS[m.status] ?? null) : null, pages: null,
  };
}

const FIELDS = 'id title { english romaji } coverImage { extraLarge large } staff(perPage: 8, sort: RELEVANCE) { edges { role node { name { full } } } } status chapters volumes startDate { year } description(asHtml: false)';

export async function searchManga(q: string): Promise<Found[]> {
  const d = await anilist(`query ($q: String) { Page(perPage: 12) { media(search: $q, type: MANGA, sort: SEARCH_MATCH, isAdult: false) { ${FIELDS} } } }`, { q });
  return (d.data?.Page?.media ?? []).map(fromAniList);
}

export async function mangaById(id: number): Promise<Found | null> {
  const d = await anilist(`query ($id: Int) { Media(id: $id, type: MANGA) { ${FIELDS} } }`, { id });
  return d.data?.Media ? fromAniList(d.data.Media) : null;
}

/** Releasing, on hiatus or finished, for many manga at once. */
export async function mangaStatuses(ids: number[]): Promise<Map<number, ReleaseStatus>> {
  const out = new Map<number, ReleaseStatus>();
  for (let i = 0; i < ids.length; i += 50) {
    const d = await anilist('query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: MANGA) { id status } } }', { ids: ids.slice(i, i + 50) });
    for (const m of d.data?.Page?.media ?? []) if (m.status && STATUS[m.status]) out.set(m.id, STATUS[m.status]);
  }
  return out;
}

// ---- MangaDex --------------------------------------------------------------------------------------------

const MANGADEX = 'https://api.mangadex.org';


/** A MangaDex entry to pick from, like picking a series on Comic Vine. */
export interface DexChoice {
  id: string;
  title: string;
  year: number | null;
  /** Linked to the AniList manga you picked: almost always the right one. */
  linked: boolean;
  lastVolume: string | null;
  lastChapter: string | null;
  status: string | null;
}

/** MangaDex entries matching a title: the one linked to AniList first; doujinshi and adult entries left out. */
export async function searchMangaDex(title: string, anilistId: number | null): Promise<DexChoice[]> {
  const d = await getJson(`${MANGADEX}/manga?limit=30&order[relevance]=desc&contentRating[]=safe&contentRating[]=suggestive&title=${encodeURIComponent(title)}`);
  const extra = anilistId ? await getJson(`${MANGADEX}/manga?limit=30&order[relevance]=desc&title=${encodeURIComponent(title)}`).catch(() => ({ data: [] })) : { data: [] };
  type Raw = { id: string; attributes: { title: Record<string, string>; links?: Record<string, string> | null; year?: number | null; lastVolume?: string | null; lastChapter?: string | null; status?: string | null; contentRating?: string; tags?: { attributes: { name: Record<string, string> } }[] } };
  const seen = new Set<string>();
  const out: DexChoice[] = [];
  for (const m of [...(d.data ?? []), ...(extra.data ?? [])] as Raw[]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const a = m.attributes;
    if (a.contentRating === 'erotica' || a.contentRating === 'pornographic') continue;
    if ((a.tags ?? []).some((t) => /doujinshi/i.test(t.attributes.name.en ?? ''))) continue;
    out.push({
      id: m.id, title: a.title.en ?? Object.values(a.title)[0] ?? 'Untitled', year: a.year ?? null, linked: !!anilistId && a.links?.al === String(anilistId),
      lastVolume: a.lastVolume || null, lastChapter: a.lastChapter || null, status: a.status ?? null,
    });
  }
  return out.sort((x, y) => Number(y.linked) - Number(x.linked));
}

/** Volumes and their chapters, in order. Chapters not in a volume yet come last, under volume null. */
export async function mangaVolumes(mangaDex: string): Promise<{ volume: string | null; chapters: string[] }[]> {
  // Every language: licensed series often have few English chapters left there, but the volume layout is the same.
  const vols: Record<string, { volume: string; chapters: Record<string, { chapter: string }> }> = (await getJson(`${MANGADEX}/manga/${mangaDex}/aggregate`)).volumes ?? {};
  const num = (x: string) => (Number.isNaN(parseFloat(x)) ? Infinity : parseFloat(x));
  const out = Object.values(vols).map((v) => ({
    volume: v.volume === 'none' ? null : v.volume,
    chapters: [...new Set(Object.values(v.chapters).map((c) => c.chapter).filter((c) => c && c !== 'none'))].sort((a, b) => num(a) - num(b)),
  }));
  return out.filter((v) => v.chapters.length).sort((a, b) => (a.volume == null ? 1 : b.volume == null ? -1 : num(a.volume) - num(b.volume)));
}

/** A source's name as the app shows it. */
export const sourceName = (s: Found['source']) => ({ anilist: 'AniList', openlibrary: 'Open Library', googlebooks: 'Google Books', apple: 'Apple Books' })[s];

// ---- Apple Books -----------------------------------------------------------------------------------------

/**
 * Apple Books' public search (no key, about 20 searches a minute): the sharpest free covers, about 1400 px tall.
 * It only knows books sold as e-books, and has no page counts (those come from Open Library).
 */
export async function searchAppleBooks(q: string): Promise<Found[]> {
  const d = await getJson(`https://itunes.apple.com/search?media=ebook&entity=ebook&limit=12&term=${encodeURIComponent(q)}`);
  type Raw = { trackId: number; trackName: string; artistName?: string; releaseDate?: string; artworkUrl100?: string; description?: string };
  return ((d.results ?? []) as Raw[]).map((b) => ({
    source: 'apple', id: String(b.trackId), title: b.trackName, writer: b.artistName ?? null, artist: null,
    year: b.releaseDate ? parseInt(b.releaseDate, 10) || null : null,
    cover: b.artworkUrl100 ? b.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/1400x1400bb.jpg') : null,
    publisher: null, description: clean(b.description), chapters: null, volumes: null, status: null, pages: null,
  }));
}

// ---- Open Library and Google Books -----------------------------------------------------------------------

export async function searchOpenLibrary(q: string): Promise<Found[]> {
  const fields = 'key,title,author_name,first_publish_year,cover_i,publisher,number_of_pages_median';
  const d = await getJson(`https://openlibrary.org/search.json?limit=12&fields=${fields}&q=${encodeURIComponent(q)}`);
  return (d.docs ?? []).map((b: { key: string; title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number; publisher?: string[]; number_of_pages_median?: number }) => ({
    source: 'openlibrary', id: b.key, title: b.title, writer: b.author_name?.slice(0, 2).join(', ') ?? null, artist: null, year: b.first_publish_year ?? null,
    cover: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg` : null, publisher: b.publisher?.[0] ?? null, description: null,
    chapters: null, volumes: null, status: null, pages: b.number_of_pages_median ?? null,
  }));
}

/** The Open Library work for a title and author: its key, first year and usual page count (for a book found elsewhere). */
export async function openLibraryMatch(title: string, author: string | null): Promise<{ key: string; year: number | null; pages: number | null } | null> {
  try {
    const found = await searchOpenLibrary(`${title} ${author ?? ''}`.trim());
    const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '');
    const words = norm(title.replace(/\(.*?\)|:.*$/g, '')).split(' ').filter((w) => w.length > 2);
    const hit = found.find((f) => words.every((w) => norm(f.title).includes(w))) ?? null;
    return hit ? { key: hit.id, year: hit.year, pages: hit.pages && hit.pages > 1 ? hit.pages : null } : null;
  } catch {
    return null;
  }
}

/** A book's blurb from Open Library, when it has one. */
export async function openLibraryDescription(workKey: string): Promise<string | null> {
  try {
    const d = await getJson(`https://openlibrary.org${workKey}.json`);
    const text = typeof d.description === 'string' ? d.description : d.description?.value;
    return clean(text);
  } catch {
    return null;
  }
}

export async function searchGoogleBooks(q: string, key: string | null): Promise<Found[]> {
  const d = await getJson(`https://www.googleapis.com/books/v1/volumes?maxResults=12&printType=books&q=${encodeURIComponent(q)}${key ? `&key=${encodeURIComponent(key)}` : ''}`);
  return (d.items ?? []).map((v: { id: string; volumeInfo: { title: string; authors?: string[]; publishedDate?: string; imageLinks?: { thumbnail?: string }; publisher?: string; description?: string; pageCount?: number } }) => ({
    source: 'googlebooks', id: v.id, title: v.volumeInfo.title, writer: v.volumeInfo.authors?.slice(0, 2).join(', ') ?? null, artist: null,
    year: v.volumeInfo.publishedDate ? parseInt(v.volumeInfo.publishedDate, 10) || null : null,
    cover: v.volumeInfo.imageLinks?.thumbnail?.replace(/^http:/, 'https:').replace('&edge=curl', '') ?? null,
    publisher: v.volumeInfo.publisher ?? null, description: clean(v.volumeInfo.description), chapters: null, volumes: null, status: null, pages: v.volumeInfo.pageCount ?? null,
  }));
}

/** Books from Apple Books (best covers), then Open Library, then Google Books when it's on. One source failing still shows the others. */
export async function searchBooks(db: SQLiteDatabase, q: string): Promise<{ found: Found[]; errors: string[] }> {
  const errors: string[] = [];
  const found: Found[] = [];
  if (await sourceOn(db, 'apple')) {
    try {
      found.push(...(await searchAppleBooks(q)));
    } catch (e) {
      errors.push(`Apple Books: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  try {
    found.push(...(await searchOpenLibrary(q)));
  } catch (e) {
    errors.push(`Open Library: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (await sourceOn(db, 'googlebooks')) {
    try {
      found.push(...(await searchGoogleBooks(q, await getGoogleBooksKey(db))));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(/429/.test(msg) ? 'Google Books is busy right now (add a free key in Profile for more searches).' : `Google Books: ${msg}`);
    }
  }
  return { found, errors };
}
