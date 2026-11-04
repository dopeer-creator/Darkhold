import { walk, type Library } from './library';

export const splitNames = (s: string | null | undefined) =>
  (s ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

export interface CreditsSummary {
  /** The writers who carry the run: anyone on at least 40% of its credited issues. */
  mainWriters: string[];
  mainArtists: string[];
  /** Issues written by none of the main writers — fill-ins, annuals, guest writers. */
  fillIns: { issueId: string; writers: string[] }[];
  /** How many issues have credits filled in, out of all. */
  credited: number;
  total: number;
}

function regulars(lists: string[][]): string[] {
  const counts = new Map<string, number>();
  for (const names of lists) for (const n of new Set(names)) counts.set(n, (counts.get(n) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.filter(([, c]) => c >= lists.length * 0.4).map(([n]) => n);
  return top.length ? top : ranked.slice(0, 1).map(([n]) => n);
}

/** Who writes and draws a run (or event or crisis), worked out from its issues' credits. */
export function creditsSummary(lib: Library, collectionId: string): CreditsSummary {
  const ids = [...new Set(walk(lib, collectionId).map((s) => s.issueId))];
  const credited = ids.map((id) => lib.issues.get(id)!).filter((i) => i.writers);
  const mainWriters = credited.length ? regulars(credited.map((i) => splitNames(i.writers))) : [];
  const withArt = credited.filter((i) => i.artists);
  const mainArtists = withArt.length ? regulars(withArt.map((i) => splitNames(i.artists))) : [];
  const fillIns = credited
    .map((i) => ({ issueId: i.id, writers: splitNames(i.writers) }))
    .filter((f) => !f.writers.some((w) => mainWriters.includes(w)));
  return { mainWriters, mainArtists, fillIns, credited: credited.length, total: ids.length };
}
