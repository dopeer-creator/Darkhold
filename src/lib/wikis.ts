/**
 * Covers from the Marvel and DC wikis (Marvel Database and DC Database on Fandom). No key needed.
 * Their files are full size, so they're the place to go when a Comic Vine cover is blurry.
 * Issue pages are named "Daredevil Vol 8 1", and each has a main cover file "Daredevil Vol 8 1.jpg"
 * plus variants ("Daredevil Vol 8 1 Kuder Variant.jpg").
 */

export type Wiki = 'marvel' | 'dc';
export const WIKIS: Record<Wiki, { name: string; host: string }> = {
  marvel: { name: 'Marvel wiki', host: 'marvel.fandom.com' },
  dc: { name: 'DC wiki', host: 'dc.fandom.com' },
};

/** The wiki for a publisher, or null when neither has it. */
export function wikiFor(publisher: string | null | undefined): Wiki | null {
  if (!publisher) return null;
  if (/marvel/i.test(publisher)) return 'marvel';
  if (/^dc\b|dc comics/i.test(publisher)) return 'dc';
  return null;
}

/** One cover to pick: the wiki page it belongs to and the image. */
export interface WikiCover {
  /** "Daredevil Vol 8 1", or a file's name for a variant. */
  title: string;
  /** What to show under it: "Daredevil (2023) #1", "Kuder Variant". */
  label: string;
  image: string;
  year: number | null;
}

type Page = { title: string; missing?: string; original?: { source: string }; categories?: { title: string }[]; imageinfo?: { url: string }[] };

async function ask(wiki: Wiki, params: Record<string, string>): Promise<{ query?: { pages?: Record<string, Page>; search?: { title: string }[] } }> {
  const url = `https://${WIKIS[wiki].host}/api.php?format=json&origin=*&${new URLSearchParams(params).toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${WIKIS[wiki].name} answered ${res.status}`);
  return res.json();
}

const pagesOf = (d: Awaited<ReturnType<typeof ask>>) => Object.values(d.query?.pages ?? {});
const releaseYear = (p: Page) => {
  for (const c of p.categories ?? []) {
    const m = /Released in (\d{4})|^Category:(\d{4}),/.exec(c.title);
    if (m) return Number(m[1] ?? m[2]);
  }
  return null;
};
/** Wiki file names use spaces in titles and underscores nowhere: "Daredevil Vol 8 1" → "File:Daredevil Vol 8 1.jpg". */
const fileFor = (page: string) => `File:${page}.jpg`;

/** The image addresses for some files (missing files are left out). */
async function fileUrls(wiki: Wiki, files: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < files.length; i += 50) {
    const d = await ask(wiki, { action: 'query', prop: 'imageinfo', iiprop: 'url', titles: files.slice(i, i + 50).join('|') });
    for (const p of pagesOf(d)) if (p.imageinfo?.[0]?.url) out.set(p.title, p.imageinfo[0].url);
  }
  return out;
}

/** Search the wiki (a trade, an omnibus, an issue) and get each page's main cover. */
export async function searchWikiCovers(wiki: Wiki, query: string): Promise<WikiCover[]> {
  const d = await ask(wiki, { action: 'query', generator: 'search', gsrsearch: query, gsrnamespace: '0', gsrlimit: '30', prop: 'pageimages|categories', piprop: 'original', cllimit: 'max' });
  // Comics and collected editions are all "… Vol N" pages; characters and creators aren't, and their pictures aren't covers.
  const pages = pagesOf(d).filter((p) => p.original?.source && / Vol \d+/.test(p.title));
  const main = await fileUrls(wiki, pages.map((p) => fileFor(p.title)));
  return pages.map((p) => ({ title: p.title, label: p.title, image: main.get(fileFor(p.title)) ?? p.original!.source, year: releaseYear(p) }));
}

/**
 * Each wiki volume of a series ("Daredevil Vol 1" … "Vol 9") with its first issue's cover and year,
 * the one closest to `year` first, so the right volume can be picked by looking.
 */
export async function seriesVolumes(wiki: Wiki, title: string, year: number | null): Promise<(WikiCover & { volume: string })[]> {
  const names = Array.from({ length: 20 }, (_, i) => `${title} Vol ${i + 1}`);
  const d = await ask(wiki, { action: 'query', prop: 'categories', cllimit: 'max', titles: names.map((n) => `${n} 1`).join('|') });
  const found = pagesOf(d).filter((p) => p.missing === undefined);
  const covers = await fileUrls(wiki, found.map((p) => fileFor(p.title)));
  const out = found
    .map((p) => ({ volume: p.title.replace(/ 1$/, ''), title: p.title, label: p.title.replace(/ 1$/, ''), image: covers.get(fileFor(p.title)) ?? '', year: releaseYear(p) }))
    .filter((v) => v.image);
  return out.sort((a, b) => (year == null ? 0 : Math.abs((a.year ?? 9999) - year) - Math.abs((b.year ?? 9999) - year)) || a.volume.localeCompare(b.volume, undefined, { numeric: true }));
}

/** The main cover for each issue number of one wiki volume ("Daredevil Vol 8"). */
export async function volumeCovers(wiki: Wiki, volume: string, numbers: string[]): Promise<Map<string, string>> {
  const files = await fileUrls(wiki, numbers.map((n) => fileFor(`${volume} ${n}`)));
  const out = new Map<string, string>();
  for (const n of numbers) {
    const url = files.get(fileFor(`${volume} ${n}`));
    if (url) out.set(n, url);
  }
  return out;
}

/** An issue's main cover and every variant the wiki has for it, main first. */
export async function issueCovers(wiki: Wiki, page: string): Promise<WikiCover[]> {
  const d = await ask(wiki, { action: 'query', list: 'search', srnamespace: '6', srsearch: `"${page}"`, srlimit: '50' });
  const names = (d.query?.search ?? []).map((s) => s.title).filter((t) => t === fileFor(page) || t.startsWith(`File:${page} `));
  // "Daredevil Vol 8 1" also matches "Daredevil Vol 8 10": keep only this issue's own files.
  const own = names.filter((t) => t === fileFor(page) || !/^\d/.test(t.slice(`File:${page} `.length)));
  const urls = await fileUrls(wiki, [fileFor(page), ...own]);
  const list = [...new Set([fileFor(page), ...own])].filter((t) => urls.has(t));
  return list.map((t) => ({ title: t, label: t === fileFor(page) ? 'Main cover' : t.slice(`File:${page} `.length).replace(/\.\w+$/, ''), image: urls.get(t)!, year: null }));
}

/** The wiki page for an issue of a series: its volume (found by year), then the issue. */
export async function issuePage(wiki: Wiki, title: string, year: number | null, number: string, volume?: string | null): Promise<string | null> {
  const vol = volume ?? (await seriesVolumes(wiki, title, year))[0]?.volume;
  return vol ? `${vol} ${number}` : null;
}
