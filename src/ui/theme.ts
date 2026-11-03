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

export const KIND_LABEL = { crisis: 'CRISIS', run: 'RUN', event: 'EVENT' } as const;
export const STATUS_LABEL = { not_started: 'Not started', reading: 'Reading', on_hold: 'On hold', completed: 'Completed' } as const;
