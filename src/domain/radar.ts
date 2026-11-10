import { todayKey, type Library } from './library';
import type { Kind } from './types';

export interface RadarItem {
  issueId: string;
  /** "2026-11-25", or "2027-02" when only the month is known. */
  on: string;
  /** The run or event the issue belongs to (else whatever list holds it). */
  listId: string | null;
}

/** Most specific first: an issue is "in" its event or run rather than the big reading order around it. */
const RANK: Kind[] = ['event', 'run', 'arc', 'edition', 'era', 'crisis'];

const startOf = (on: string) => (on.length === 7 ? `${on}-01` : on);
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Release radar: unread issues in your lists that have a release date.
 * Out now: released in the last `recentDays` days. Coming up: everything after today, soonest first.
 */
export function releaseRadar(lib: Library, today = todayKey(), recentDays = 21): { outNow: RadarItem[]; coming: RadarItem[] } {
  const since = addDays(today, -recentDays);
  const outNow: RadarItem[] = [];
  const coming: RadarItem[] = [];
  for (const issue of lib.issues.values()) {
    if (issue.status === 'read' || !issue.release_on) continue;
    const parents = (lib.parents.get(issue.id) ?? []).map((id) => lib.collections.get(id)).filter((c) => !!c);
    if (!parents.length) continue;
    const list = [...parents].sort((a, b) => RANK.indexOf(a!.kind) - RANK.indexOf(b!.kind))[0]!;
    const item = { issueId: issue.id, on: issue.release_on, listId: list.id };
    const day = startOf(issue.release_on);
    if (day > today) coming.push(item);
    else if (day >= since) outNow.push(item);
  }
  outNow.sort((a, b) => startOf(b.on).localeCompare(startOf(a.on)));
  coming.sort((a, b) => startOf(a.on).localeCompare(startOf(b.on)) || a.on.length - b.on.length);
  return { outNow, coming };
}
