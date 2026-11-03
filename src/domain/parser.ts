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
}

export interface ParseError {
  line: number;
  raw: string;
  message: string;
}

const DASHES = /[‐-―−]/g;
const MAX_RANGE = 500;

/**
 * Reads a pasted reading list, one series per line:
 *   Green Lantern #63–67
 *   Green Lantern (2005) #1, 3, 5-7
 *   Green Lantern Corps #22 and #48–60
 *   Zero Hour #4-0            (counts down)
 *   Blackest Night: Batman    (no number → one-shot #1)
 */
export function parseReadingList(text: string): { items: ParsedLine[]; errors: ParseError[] } {
  const items: ParsedLine[] = [];
  const errors: ParseError[] = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = idx + 1;
    const clean = raw
      .replace(DASHES, '-')
      .replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, '')
      .trim();
    if (!clean) return;

    const hash = clean.indexOf('#');
    let title = (hash === -1 ? clean : clean.slice(0, hash)).trim();
    let volumeYear: number | null = null;
    const vol = title.match(/^(.*?)\s*\((\d{4})\)$/);
    if (vol) {
      title = vol[1].trim();
      volumeYear = Number(vol[2]);
    }
    if (!title) {
      errors.push({ line, raw, message: 'No series name before the #' });
      return;
    }
    if (hash === -1) {
      items.push({ line, raw, seriesTitle: title, volumeYear, numbers: ['1'], assumedOneShot: true });
      return;
    }

    const numbers: string[] = [];
    for (const part of clean.slice(hash).split(/,|&|\band\b/i)) {
      const token = part.replace(/#/g, '').trim();
      if (!token) continue;
      const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        const a = Number(range[1]);
        const b = Number(range[2]);
        if (Math.abs(b - a) >= MAX_RANGE) {
          errors.push({ line, raw, message: `Range ${token} is too long` });
          return;
        }
        const step = a <= b ? 1 : -1;
        for (let n = a; n !== b + step; n += step) numbers.push(String(n));
      } else if (/^[\w./]+$/.test(token)) {
        numbers.push(token);
      } else {
        errors.push({ line, raw, message: `Can't read "${token}" as an issue number` });
        return;
      }
    }
    if (!numbers.length) {
      errors.push({ line, raw, message: 'No issue numbers after the #' });
      return;
    }
    items.push({ line, raw, seriesTitle: title, volumeYear, numbers: [...new Set(numbers)], assumedOneShot: false });
  });
  return { items, errors };
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
    const series =
      item.volumeYear != null ? (choices.find((s) => s.volume_year === item.volumeYear) ?? null) : (choices[0] ?? null);
    return {
      ...item,
      choices,
      series,
      existing: item.numbers.map((n) => (series ? (issueIndex.get(`${series.id}#${n}`) ?? null) : null)),
    };
  });
}
