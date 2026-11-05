import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { C } from './theme';

type P = { size?: number; color?: string; width?: number };

const stroke = (color: string, width: number) => ({
  stroke: color,
  strokeWidth: width,
  fill: 'none',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const HomeIcon = ({ size = 22, color = C.dim, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" {...stroke(color, width)} /></Svg>
);
export const LibraryIcon = ({ size = 22, color = C.dim, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="3" y="4" width="4.5" height="16" rx="1" {...stroke(color, width)} />
    <Rect x="9.5" y="4" width="4.5" height="16" rx="1" {...stroke(color, width)} />
    <Path d="m16.5 5.2 3.6-.9 2.4 15.3-3.6.9z" {...stroke(color, width)} />
  </Svg>
);
export const PlusIcon = ({ size = 22, color = C.text, width = 2.2 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" {...stroke(color, width)} /></Svg>
);
export const ClockIcon = ({ size = 22, color = C.dim, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="9" {...stroke(color, width)} /><Path d="M12 7v5l3 2" {...stroke(color, width)} /></Svg>
);
export const SearchIcon = ({ size = 22, color = C.dim, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="11" cy="11" r="7" {...stroke(color, width)} /><Path d="m20 20-3.5-3.5" {...stroke(color, width)} /></Svg>
);
export const BackIcon = ({ size = 22, color = C.muted, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="m15 6-6 6 6 6" {...stroke(color, width)} /></Svg>
);
export const CloseIcon = ({ size = 22, color = C.muted, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6 6 18" {...stroke(color, width)} /></Svg>
);
export const ChevronRight = ({ size = 16, color = C.muted, width = 2 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="m9 6 6 6-6 6" {...stroke(color, width)} /></Svg>
);
export const ChevronDown = ({ size = 16, color = C.muted, width = 2 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="m6 9 6 6 6-6" {...stroke(color, width)} /></Svg>
);
export const CheckIcon = ({ size = 14, color = C.onLight, width = 3 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="m5 12 5 5 9-10" {...stroke(color, width)} /></Svg>
);
export const PlayIcon = ({ size = 14, color = C.onLight }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M8 5v14l11-7z" fill={color} /></Svg>
);
export const MoreIcon = ({ size = 22, color = C.muted }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="5" cy="12" r="1.7" fill={color} /><Circle cx="12" cy="12" r="1.7" fill={color} /><Circle cx="19" cy="12" r="1.7" fill={color} />
  </Svg>
);
export const CrisisIcon = ({ size = 22, color = C.text, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M4 4l8 8M20 4l-8 8M12 4v16" {...stroke(color, width)} /></Svg>
);
export const RunIcon = ({ size = 22, color = C.text, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 3 3 8l9 5 9-5z" {...stroke(color, width)} /><Path d="m3 13 9 5 9-5" {...stroke(color, width)} /></Svg>
);
export const EventIcon = ({ size = 22, color = C.text, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M13 3 5 14h6l-1 7 8-11h-6z" {...stroke(color, width)} /></Svg>
);
export const IssueIcon = ({ size = 22, color = C.text, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Rect x="6" y="3" width="12" height="18" rx="2" {...stroke(color, width)} /><Path d="M9 8h6M9 12h6M9 16h3" {...stroke(color, width)} /></Svg>
);
export const DragIcon = ({ size = 18, color = C.faint }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    {[6, 12, 18].map((y) => [9, 15].map((x) => <Circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill={color} />))}
  </Svg>
);
export const ChevronUp = ({ size = 16, color = C.muted, width = 2 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="m6 15 6-6 6 6" {...stroke(color, width)} /></Svg>
);
/** Six dots: "hold here and drag". */
export const GripIcon = ({ size = 20, color = C.muted }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.7} fill={color} />))}
  </Svg>
);
/** Era: one line running through several books. */
export const EraIcon = ({ size = 22, color = C.text, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M3 12h18" {...stroke(color, width)} />
    <Circle cx="5" cy="12" r="2.2" {...stroke(color, width)} />
    <Circle cx="12" cy="12" r="2.2" {...stroke(color, width)} />
    <Circle cx="19" cy="12" r="2.2" {...stroke(color, width)} />
  </Svg>
);
/** Arc: one curve inside a run. */
export const ArcIcon = ({ size = 22, color = C.text, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M4 18C6 8 18 8 20 18" {...stroke(color, width)} /><Path d="M3 18h18" {...stroke(color, width)} /></Svg>
);
/** Collected edition: a book on the shelf. */
export const EditionIcon = ({ size = 22, color = C.text, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" {...stroke(color, width)} />
    <Path d="M5 17a3 3 0 0 1 3-3h11" {...stroke(color, width)} />
  </Svg>
);
/** Filter: three lines, shortest at the bottom. */
export const FilterIcon = ({ size = 20, color = C.muted, width = 1.8 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M4 6h16M7 12h10M10 18h4" {...stroke(color, width)} /></Svg>
);
