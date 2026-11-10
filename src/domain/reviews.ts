import type { Library } from './library';
import type { Review, Verdict } from './types';

/** The five verdicts, worst to best. */
export const VERDICTS: { key: Verdict; label: string }[] = [
  { key: 'bad', label: 'Bad' },
  { key: 'forgettable', label: 'Forgettable' },
  { key: 'good_enough', label: 'Good enough' },
  { key: 'generational', label: 'Generational' },
  { key: 'peak', label: 'Peak' },
];

export const verdictLabel = (v: Verdict) => VERDICTS.find((x) => x.key === v)?.label ?? v;

/** The verdict a score suggests until you pick your own: under 4 Bad, 4–6 Forgettable, 6–8 Good enough, 8–9.25 Generational, 9.25+ Peak. */
export function suggestedVerdict(score: number): Verdict {
  if (score < 4) return 'bad';
  if (score < 6) return 'forgettable';
  if (score < 8) return 'good_enough';
  if (score < 9.25) return 'generational';
  return 'peak';
}

/** A score kept to 0–10 with at most two decimals. */
export const clampScore = (n: number) => Math.round(Math.min(10, Math.max(0, n)) * 100) / 100;

/** "8.75" — always two decimals, so scores line up. */
export const formatScore = (n: number | null | undefined) => (n == null ? '' : n.toFixed(2));

/** Reads a typed score: "8", "8.5", "8.75" (0–10, up to two decimals); null when it isn't one. */
export function parseScore(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d{0,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= 10 ? n : null;
}

/** "Generational 8.75", for a one-line mention. */
export const reviewLine = (r: Pick<Review, 'verdict' | 'score'>) => `${verdictLabel(r.verdict)}${r.score != null ? ` ${formatScore(r.score)}` : ''}`;

export const reviewFor = (lib: Library, id: string): Review | undefined => lib.reviews.get(id);

/** True for the verdicts that make a list one of your peaks. */
export const isPeak = (v: Verdict) => v === 'generational' || v === 'peak';
