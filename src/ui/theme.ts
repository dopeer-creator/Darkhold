import type { Collection, Kind } from '@/domain/types';

export const C = {
  bg: '#111113',
  bar: '#141416',
  surface: '#19191C',
  surface2: '#222226',
  sunken: '#0D0D0F',
  border: '#2B2B30',
  borderStrong: '#3A3A40',
  divider: '#222226',
  text: '#ECEAE5',
  muted: '#A6A3AD',
  dim: '#8E8B95',
  faint: '#55535B',
  onLight: '#111113',
  dc: '#5B8DEF',
  marvel: '#E25C5C',
  indie: '#D9A441',
  danger: '#E5484D',
} as const;

export const F = {
  cond: 'BarlowCondensed_600SemiBold',
  condBold: 'BarlowCondensed_700Bold',
  sans: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;

export function publisherColor(publisher: string | null | undefined): string {
  if (!publisher) return C.dim;
  if (/^dc\b|dc comics/i.test(publisher)) return C.dc;
  if (/marvel/i.test(publisher)) return C.marvel;
  return C.indie;
}

const TINTS = [
  { bg: '#163322', fg: '#9EDDB0' },
  { bg: '#35240E', fg: '#E8C48A' },
  { bg: '#3A1418', fg: '#F0B4B4' },
  { bg: '#1B2130', fg: '#B7C4E0' },
  { bg: '#26202F', fg: '#CDBFE0' },
  { bg: '#12302F', fg: '#9ED9D3' },
  { bg: '#2E2A14', fg: '#E3D99A' },
];

/** A steady colour pair per title, so a cover without art always looks the same. */
export function tintFor(title: string) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

export const KIND_LABEL = {
  crisis: 'READING ORDER', run: 'RUN', event: 'EVENT', era: 'ERA', arc: 'ARC', edition: 'COLLECTED EDITION', issue: 'ISSUE', heading: 'CHAPTER',
} as const;
/** Label colour by type, so a reading order reads at a glance: events red, runs blue. */
export const KIND_COLOR = {
  crisis: '#D9A441', run: '#6F9BF2', event: '#E5626A', era: '#5FC0B4', arc: '#A98BE0', edition: '#C9B27A', issue: '#A6A3AD', heading: '#ECEAE5',
} as const;
/** The type in a sentence: "New reading order", "Delete run only". */
export const KIND_NAME: Record<Kind, string> = { crisis: 'reading order', run: 'run', event: 'event', era: 'era', arc: 'arc', edition: 'collected edition' };
/** What each type is for, shown when you pick one. */
export const KIND_HINT: Record<Kind, string> = {
  crisis: 'You jump between books: a crossover with its tie-ins, or the road into a big event',
  run: 'One writer on one book. A relaunch or another book is a new run',
  event: 'One story or miniseries, like Blood Hunt or Green Lantern: Rebirth',
  era: 'A writer’s story across several books and runs, like Grant Morrison’s Batman or Geoff Johns’ Green Lantern',
  arc: 'One story inside a run, like Court of Owls',
  edition: 'A trade, omnibus or other collected book',
};
export const KINDS: Kind[] = ['run', 'event', 'crisis', 'era', 'arc', 'edition'];
/** A list's label: your own word if you gave one, else its type. */
export const kindLabel = (c: Pick<Collection, 'kind' | 'label'>) => (c.label?.trim() ? c.label.trim().toUpperCase() : KIND_LABEL[c.kind]);
export const STATUS_LABEL = { not_started: 'Not started', planned: 'Plan to read', reading: 'Reading', on_hold: 'On hold', completed: 'Completed' } as const;
