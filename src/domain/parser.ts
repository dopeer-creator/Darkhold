import type { Library } from './library';
import type { Series } from './types';

export interface ParsedLine {
  line: number;
  raw: string;
  seriesTitle: string;
  volumeYear: number | null;
  numbers: string[];
  /** True when the line had no issue number, so it was taken as a one-shot #1. */
  assumedOneShot: boolean;
  /** "[x]" → true, "[ ]" → false, no checkbox → null. */
  checked: boolean | null;
  /** A trailing remark such as "(Comics Giveaway Day Special)". */
  note: string | null;
}

export interface ParseError {
  line: number;
  raw: string;
  message: string;
}

const DASHES = /[‐-―−]/g;
const MAX_RANGE = 500;
const LEAD = /^\s*(?:[-*•·]|\d+[.)])?\s*(?:\[([ xX✓✔]?)\])?\s*/;

/** Reads one issue line. Returns null for a blank line. */
function parseLine(raw: string, line: number): ParsedLine | ParseError | null {
  const lead = raw.replace(DASHES, '-').match(LEAD)!;
  const checked = lead[1] === undefined ? null : lead[1].trim() !== '';
  let clean = raw.replace(DASHES, '-').slice(lead[0].length).trim();
  if (!clean) return null;

  let note: string | null = null;
  const remark = clean.match(/^(.*#.*?)\s*\(([^()]*)\)\s*$/);
  if (remark && !/^\d{4}$/.test(remark[2])) {
    clean = remark[1].trim();
    note = remark[2].trim();
  }

  const hash = clean.indexOf('#');
  let title = (hash === -1 ? clean : clean.slice(0, hash)).trim();
  let volumeYear: number | null = null;
  const vol = title.match(/^(.*?)\s*\((\d{4})\)$/);
  if (vol) {
    title = vol[1].trim();
    volumeYear = Number(vol[2]);
  }
  if (!title) return { line, raw, message: 'No series name before the #' };
  if (hash === -1) return { line, raw, seriesTitle: title, volumeYear, numbers: ['1'], assumedOneShot: true, checked, note };

  const numbers: string[] = [];
  for (const part of clean.slice(hash).split(/,|&|\band\b/i)) {
    const token = part.replace(/#/g, '').trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (Math.abs(b - a) >= MAX_RANGE) return { line, raw, message: `Range ${token} is too long` };
      const step = a <= b ? 1 : -1;
      for (let n = a; n !== b + step; n += step) numbers.push(String(n));
    } else if (/^[\w./]+$/.test(token)) {
      numbers.push(token);
    } else {
      return { line, raw, message: `Can't read "${token}" as an issue number` };
    }
  }
  if (!numbers.length) return { line, raw, message: 'No issue numbers after the #' };
  return { line, raw, seriesTitle: title, volumeYear, numbers: [...new Set(numbers)], assumedOneShot: false, checked, note };
}

const isError = (x: ParsedLine | ParseError): x is ParseError => 'message' in x;

/**
 * Reads a pasted reading list, one series per line:
 *   Green Lantern #63–67
 *   Green Lantern (2005) #1, 3, 5-7
 *   Green Lantern Corps #22 and #48–60
 *   Zero Hour #4-0            (counts down)
 *   Blackest Night: Batman    (no number → one-shot #1)
 *   • [x] Blood Hunt #1       (bullets and checkboxes are fine)
 */
export function parseReadingList(text: string): { items: ParsedLine[]; errors: ParseError[] } {
  const items: ParsedLine[] = [];
  const errors: ParseError[] = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    const r = parseLine(raw, idx + 1);
    if (r) (isError(r) ? errors : items).push(r as never);
  });
  return { items, errors };
}

export type BlockKind = 'run' | 'event' | 'issue';

/** One labelled part of a structured list: "run: Captain America by Chip Zdarsky (continued)". */
export interface ListBlock {
  kind: BlockKind | null;
  /** The run or event name; null for loose issues. */
  title: string | null;
  continued: boolean;
  items: ParsedLine[];
}

export interface StructuredList {
  /** From a "crisis: Armageddon" line, if there is one. */
  crisisTitle: string | null;
  blocks: ListBlock[];
  errors: ParseError[];
  /** False when the text had no headers at all (a plain list). */
  hasHeaders: boolean;
}

const HEADER = /^\s*(?:[-*•·]\s*)?(crisis(?:\s+reading\s+list)?|run|event|issues?|one-?shots?)\s*:\s*(.*?)\s*$/i;
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'vs.']);

/** "captain america by chip zdarsky" → "Captain America by Chip Zdarsky"; words already capitalised stay. */
export function titleCase(text: string): string {
  return text
    .split(/(\s+)/)
    .map((w, i) => (/^\s+$/.test(w) || i === 0 || !SMALL_WORDS.has(w.toLowerCase()) ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase()))
    .join('');
}

/**
 * Reads a reading order split into labelled parts, for example a crisis:
 *   event: Blood Hunt
 *   • [ ] Blood Hunt #1
 *   run: captain america by chip zdarsky:
 *   • [ ] Captain America (2025) #1
 *   issue:
 *   • [ ] The Will of Doom #1
 *   run: captain america by chip zdarsky (continued):
 *   • [ ] Captain America (2025) #6
 * Notes in brackets after a name, like "(red label)", are dropped.
 */
export function parseStructuredList(text: string): StructuredList {
  const out: StructuredList = { crisisTitle: null, blocks: [], errors: [], hasHeaders: false };
  let current: ListBlock | null = null;
  text.split(/\r?\n/).forEach((raw, idx) => {
    const header = raw.includes('#') ? null : raw.match(HEADER);
    if (header) {
      out.hasHeaders = true;
      const word = header[1].toLowerCase();
      let name = header[2].replace(/:\s*$/, '').trim();
      const continued = /\(\s*cont(?:inued|'?d)?\.?\s*\)/i.test(name);
      name = name.replace(/\([^()]*\)/g, '').replace(/\s+/g, ' ').replace(/:\s*$/, '').trim();
      if (word.startsWith('crisis')) {
        out.crisisTitle = name ? titleCase(name) : null;
        current = null;
        return;
      }
      const kind: BlockKind = word.startsWith('run') ? 'run' : word.startsWith('event') ? 'event' : 'issue';
      current = { kind, title: kind === 'issue' || !name ? null : titleCase(name), continued, items: [] };
      out.blocks.push(current);
      return;
    }
    const r = parseLine(raw, idx + 1);
    if (!r) return;
    if (isError(r)) {
      out.errors.push(r);
      return;
    }
    if (!current) {
      current = { kind: null, title: null, continued: false, items: [] };
      out.blocks.push(current);
    }
    current.items.push(r);
  });
  out.blocks = out.blocks.filter((b) => b.items.length);
  return out;
}

export interface ResolvedLine extends ParsedLine {
  /** Every series in the library with this title, newest volume first. */
  choices: Series[];
  /** The series these issues will go into; null means a new series gets created. */
  series: Series | null;
  /** Issue id already in the library for each number, or null when it is new. */
  existing: (string | null)[];
}

/** Matches parsed lines to the library so the preview can offer "Reuse" for issues you already have. */
export function resolveAgainstLibrary(items: ParsedLine[], lib: Library): ResolvedLine[] {
  const byTitle = new Map<string, Series[]>();
  for (const s of lib.series.values()) {
    const key = s.title.toLowerCase();
    byTitle.set(key, [...(byTitle.get(key) ?? []), s]);
  }
  const issueIndex = new Map<string, string>();
  for (const i of lib.issues.values()) if (i.number != null) issueIndex.set(`${i.series_id}#${i.number}`, i.id);

  return items.map((item) => {
    const choices = [...(byTitle.get(item.seriesTitle.toLowerCase()) ?? [])].sort(
      (a, b) => (b.volume_year ?? 0) - (a.volume_year ?? 0),
    );
    // "Final Crisis (2008)" still finds a lone "Final Crisis" saved without a year, so it isn't duplicated.
    const onlyUndated = choices.length === 1 && choices[0].volume_year == null ? choices[0] : null;
    const series =
      item.volumeYear != null ? (choices.find((s) => s.volume_year === item.volumeYear) ?? onlyUndated) : (choices[0] ?? null);
    return {
      ...item,
      choices,
      series,
      existing: item.numbers.map((n) => (series ? (issueIndex.get(`${series.id}#${n}`) ?? null) : null)),
    };
  });
}
