import type { SQLiteDatabase } from 'expo-sqlite';

import type { Library } from '@/domain/library';
import { formatOf } from '@/domain/modes';
import { mangaStatuses, sourceOn } from '@/lib/sources';
import { getMeta, patchRow, setMeta } from './db';
import { today } from './repo';
import { advanceSchedule } from './works';

/**
 * Runs after each sync. Once a day it asks AniList whether each scheduled manga is releasing, on hiatus or
 * finished; then every running schedule gets its next chapter onto Release radar. True when anything changed.
 */
export async function keepSchedules(db: SQLiteDatabase, lib: Library): Promise<boolean> {
  let changed = false;
  const manga = [...lib.series.values()].filter((s) => formatOf(s) === 'manga');
  if (!manga.length) return false;

  const day = today();
  const tracked = manga.filter((s) => s.anilist_id && s.release_every);
  if (tracked.length && (await getMeta(db, 'anilist:checked')) !== day && (await sourceOn(db, 'hiatus')) && (await sourceOn(db, 'anilist'))) {
    try {
      const statuses = await mangaStatuses(tracked.map((s) => s.anilist_id!));
      for (const s of tracked) {
        const now = statuses.get(s.anilist_id!);
        if (now && now !== s.release_status) {
          await patchRow(db, 'series', s.id, { release_status: now });
          lib.series.set(s.id, { ...s, release_status: now });
          changed = true;
        }
      }
      await setMeta(db, 'anilist:checked', day);
    } catch {
      // Offline or AniList busy: try again next time.
    }
  }

  for (const s of [...lib.series.values()].filter((x) => formatOf(x) === 'manga')) {
    if (await advanceSchedule(db, lib, s)) changed = true;
  }
  return changed;
}
