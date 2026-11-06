import { describe, expect, it } from 'vitest';

import { planImport, type ExportFile } from '../../src/domain/importer';
import { buildLibrary, collectionStatus, issueTitle, nextUp, progress, stats } from '../../src/domain/library';
import seed from './my-library.json';

const lib = buildLibrary(seed as unknown as Parameters<typeof buildLibrary>[0]);
const byTitle = (title: string, kind?: string) => [...lib.collections.values()].find((c) => c.title === title && (!kind || c.kind === kind))!.id;

describe('starting data', () => {
  it('has every Green Lantern issue once: 183 read of 237', () => {
    expect(progress(lib, byTitle("Geoff Johns' Green Lantern"))).toEqual({ read: 183, total: 237, left: 54, upcoming: 0 });
  });

  it('matches the planned lists', () => {
    expect(progress(lib, byTitle('Road to War of the Green Lanterns'))).toEqual({ read: 10, total: 10, left: 0, upcoming: 0 });
    expect(progress(lib, byTitle('Brightest Day — Part 1'))).toEqual({ read: 3, total: 15, left: 12, upcoming: 0 });
    expect(progress(lib, byTitle('War of the Green Lanterns')).total).toBe(11);
  });

  it('counts the linked GLC #34 and #39 once inside Blackest Night', () => {
    expect(progress(lib, byTitle('Blackest Night and Tie-ins'))).toEqual({ read: 52, total: 52, left: 0, upcoming: 0 });
    expect(progress(lib, byTitle("Geoff Johns' Green Lantern")).total).toBe(237);
  });

  it('picks up at Brightest Day #2', () => {
    const step = nextUp(lib, byTitle("Geoff Johns' Green Lantern"))!;
    expect(issueTitle(lib, step.issueId)).toBe('Brightest Day #2');
  });

  it('marks finished events completed; part-read lists wait until you mark one currently reading', () => {
    expect(collectionStatus(lib, byTitle('Blood Hunt'))).toBe('completed');
    expect(collectionStatus(lib, byTitle('Armageddon', 'crisis'))).toBe('not_started');
    expect(collectionStatus(lib, byTitle('Batman: New 52'))).toBe('not_started');
  });

  it('imports into an empty library, and a second import changes nothing', () => {
    let k = 0;
    const newId = () => `u${++k}`;
    const empty = buildLibrary({ series: [], issues: [], collections: [], entries: [] });
    const first = planImport(empty, seed as unknown as ExportFile, newId);
    expect([first.issues.length, first.collections.length, first.entries.length, first.read_log.length]).toEqual([278, 21, 332, 5]);
    const after = buildLibrary(first);
    expect(progress(after, [...after.collections.values()].find((c) => c.title === "Geoff Johns' Green Lantern")!.id).read).toBe(183);
    const second = planImport(after, seed as unknown as ExportFile, newId);
    expect([second.series, second.issues, second.collections, second.entries, second.read_log, second.markRead].map((x) => x.length)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('lays out Armageddon as slices in your reading order, with each run kept whole', () => {
    const crisis = byTitle('Armageddon', 'crisis');
    expect(progress(lib, crisis)).toEqual({ read: 5, total: 41, left: 36, upcoming: 0 });
    const step = nextUp(lib, crisis)!;
    expect(issueTitle(lib, step.issueId)).toBe('Captain America #1');
    expect(lib.collections.get(step.via!)!.title).toBe('Captain America by Chip Zdarsky');
    expect(progress(lib, byTitle('Captain America by Chip Zdarsky'))).toEqual({ read: 0, total: 16, left: 16, upcoming: 0 });
    expect(progress(lib, byTitle('Armageddon', 'event')).total).toBe(6);
  });

  it('gives the home totals', () => {
    expect(stats(lib)).toEqual({ issuesRead: 188, issuesLeft: 0, reading: 0, completed: 8 });
  });
});
