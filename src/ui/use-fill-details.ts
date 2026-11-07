import { router } from 'expo-router';

import { useStore } from '@/store/store';

/**
 * "Fill writer & artist details": starts the app-wide job and reports on it, so leaving the screen
 * doesn't stop it. When it finishes for a run or event with no writer typed in, the main writers and
 * artists are filled in for it too.
 */
export function useFillDetails() {
  const { job, fillDetailsFor, stopJob } = useStore();
  const mine = job?.kind === 'details';
  const run = async (issueIds: string[], collectionId?: string, force = false) => {
    if (job?.busy) return;
    const started = await fillDetailsFor(issueIds, collectionId, force);
    if (!started) router.push('/settings');
  };
  return { run, status: mine ? job!.status : '', busy: !!job?.busy, stop: stopJob };
}
