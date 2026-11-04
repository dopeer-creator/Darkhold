import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import { useRef, useState } from 'react';

import { creditsSummary } from '@/domain/credits';
import { fillDetails, getComicVineKey } from '@/lib/comicvine';
import { updateCollection } from '@/store/repo';
import { useStore } from '@/store/store';

/**
 * Runs "Fill writer & artist details" with a progress line and a stop button. When it finishes for a
 * run or event with no writer typed in, the main writers and artists are filled in for it too.
 */
export function useFillDetails() {
  const { act } = useStore();
  const db = useSQLiteContext();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);

  const run = async (issueIds: string[], collectionId?: string, force = false) => {
    const key = await getComicVineKey(db);
    if (!key) return router.push('/settings');
    stop.current = false;
    setBusy(true);
    try {
      const r = await act((d, l) => fillDetails(d, l, key, issueIds, (done, total, label) => setStatus(`${done + 1} of ${total}: ${label}`), () => stop.current, force));
      if (collectionId) {
        await act(async (d, l) => {
          const c = l.collections.get(collectionId);
          if (!c) return;
          const sum = creditsSummary(l, collectionId);
          const patch: { writer?: string; artist?: string } = {};
          if (!c.writer && sum.mainWriters.length) patch.writer = sum.mainWriters.join(', ');
          if (!c.artist && sum.mainArtists.length) patch.artist = sum.mainArtists.join(', ');
          if (patch.writer || patch.artist) await updateCollection(d, l, collectionId, patch);
        });
      }
      const parts = [`Filled ${r.filled}`];
      if (r.skipped) parts.push(`${r.skipped} already had details`);
      if (r.notFound) parts.push(`${r.notFound} not found on Comic Vine`);
      setStatus(r.stoppedEarly ? `${parts.join(' · ')}. Stopped: ${r.stoppedEarly}. Run it again later to carry on.` : `${parts.join(' · ')}.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return { run, status, busy, stop: () => (stop.current = true) };
}
