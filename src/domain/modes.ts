import type { Library } from './library';
import type { Collection, Entry, Format, ReadLog, Series } from './types';

/** A series' or list's mode. Anything from before books and manga is a comic. */
export const formatOf = (x: Pick<Series, 'format'> | Pick<Collection, 'format'> | undefined | null): Format => x?.format ?? 'comic';

/**
 * The part of the library one mode shows: its series and their issues, its lists, and the lines, links,
 * reviews and rereads between them. Every screen works on this, so Books Darkhold never shows a comic.
 */
export function scopeLibrary(lib: Library, mode: Format): Library {
  const series = new Map([...lib.series].filter(([, s]) => formatOf(s) === mode));
  const issues = new Map([...lib.issues].filter(([, i]) => series.has(i.series_id)));
  const collections = new Map([...lib.collections].filter(([, c]) => formatOf(c) === mode));
  const inScope = (id: string | null | undefined) => !!id && (issues.has(id) || collections.has(id));
  const children = new Map<string, Entry[]>();
  for (const [parent, list] of lib.children) {
    if (!collections.has(parent)) continue;
    children.set(
      parent,
      list
        .filter((e) => e.heading != null || inScope(e.child_issue_id ?? e.child_collection_id))
        .map((e) => (e.part_of && !collections.has(e.part_of) ? { ...e, part_of: null } : e)),
    );
  }
  const keep = (map: Map<string, string[]>) => {
    const out = new Map<string, string[]>();
    for (const [k, v] of map) if (inScope(k)) out.set(k, v.filter((p) => collections.has(p)));
    return out;
  };
  const end = (c: string | null, i: string | null) => inScope(c ?? i);
  return {
    series,
    issues,
    collections,
    children,
    parents: keep(lib.parents),
    slicedInto: keep(lib.slicedInto),
    links: lib.links.filter((l) => end(l.from_collection_id, l.from_issue_id) && end(l.to_collection_id, l.to_issue_id)),
    reviews: new Map([...lib.reviews].filter(([k]) => inScope(k))),
    rereads: new Map([...lib.rereads].filter(([k]) => issues.has(k))),
    pageLog: new Map([...lib.pageLog].filter(([k]) => collections.has(k))),
    pageNotes: new Map([...lib.pageNotes].filter(([k]) => collections.has(k))),
  };
}

export const scopeReadLog = (lib: Library, log: ReadLog[]) => log.filter((l) => lib.issues.has(l.issue_id));

/** The words each mode uses where they differ. */
export interface Words {
  /** The app name's suffix in the top bar: "" for comics. */
  brand: string;
  issue: string;
  issues: string;
  Issue: string;
  Issues: string;
  /** Before a number: "#12", "Ch. 12". */
  short: (n: string) => string;
  /** The main credit: Writer / Author / Mangaka. */
  writer: string;
  /** Where covers and details come from. */
  source: string;
  accent: string;
  name: string;
}

export const WORDS: Record<Format, Words> = {
  comic: { brand: '', issue: 'issue', issues: 'issues', Issue: 'Issue', Issues: 'Issues', short: (n) => `#${n}`, writer: 'Writer', source: 'Comic Vine', accent: '#E0564F', name: 'Comics' },
  manga: { brand: 'Manga', issue: 'chapter', issues: 'chapters', Issue: 'Chapter', Issues: 'Chapters', short: (n) => `Ch. ${n}`, writer: 'Mangaka', source: 'AniList', accent: '#E07BB0', name: 'Manga' },
  book: { brand: 'Books', issue: 'chapter', issues: 'chapters', Issue: 'Chapter', Issues: 'Chapters', short: (n) => `Chapter ${n}`, writer: 'Author', source: 'Open Library', accent: '#4FB3A5', name: 'Books' },
};

/** An issue's name in its own mode's words: "Batman #12", "Chainsaw Man Ch. 18", "Dune · Chapter 13". */
export function titleFor(seriesTitle: string, format: Format, number: string): string {
  if (format === 'manga') return `${seriesTitle} Ch. ${number}`;
  if (format === 'book') return `${seriesTitle} · Chapter ${number}`;
  return `${seriesTitle} #${number}`;
}
