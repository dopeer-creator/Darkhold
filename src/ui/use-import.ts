import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';

import type { ExportFile } from '@/domain/importer';
import { pickTextFile } from '@/lib/backup';
import { importFile } from '@/store/repo';
import { useStore } from '@/store/store';
import { KIND_NAME } from '@/ui/theme';

/** Asks yes/no; resolves true on yes. (Alert does nothing in a browser, so the web asks with confirm.) */
function ask(title: string, message: string, yes: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: yes, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

/**
 * Picks a Darkhold file and brings it in: a full backup, or one list someone shared. A shared list
 * lands on Plan to read, unread, and opens when it's in. Nothing you already have is duplicated.
 */
export function useImportFile({ onStatus, replace }: { onStatus: (s: string) => void; replace?: boolean }) {
  const { act, lib } = useStore();
  return async () => {
    try {
      const text = await pickTextFile();
      if (!text) return;
      let file: ExportFile;
      try {
        file = JSON.parse(text) as ExportFile;
      } catch {
        throw new Error('That file isn’t a Darkhold file.');
      }
      if (file?.format !== 'darkhold-export' || !Array.isArray(file.issues) || !Array.isArray(file.collections)) throw new Error('That file isn’t a Darkhold file.');
      const shared = file.shared;

      const ok = shared
        ? await ask(
            `Add “${shared.title}”?`,
            `A ${KIND_NAME[shared.kind]} with ${file.issues.length} issue${file.issues.length === 1 ? '' : 's'}${file.collections.length > 1 ? ` across ${file.collections.length} lists` : ''}. It goes on your Plan to read shelf, all unread. Issues you already have are reused; if you already have a list with this name, only what's missing is added.`,
            'Add',
          )
        : await ask(
            'Import this backup?',
            `${file.collections.length} lists and ${file.issues.length} issues${file.exported_at ? ` from ${file.exported_at.slice(0, 10)}` : ''}. Anything you already have is kept and not duplicated; anything missing comes back.`,
            'Import',
          );
      if (!ok) return;

      onStatus(shared ? `Adding ${shared.title}…` : 'Importing…');
      const plan = await act((d, l) => importFile(d, l, file));
      if (!shared) {
        onStatus(`Imported: ${plan.collections.length} lists and ${plan.issues.length} issues added, ${plan.markRead.length} marked read. Everything else was already here.`);
        return;
      }
      const sameName = (c: { kind: string; title: string }) => c.kind === shared.kind && c.title.toLowerCase() === shared.title.toLowerCase();
      const id = plan.collections.find(sameName)?.id ?? [...lib.collections.values()].find(sameName)?.id;
      onStatus(`Added ${shared.title}: ${plan.issues.length} new issue${plan.issues.length === 1 ? '' : 's'}, ${plan.reused.issues} you already had.`);
      if (id) (replace ? router.replace : router.push)(`/collection/${id}`);
    } catch (e) {
      onStatus(e instanceof Error ? e.message : String(e));
    }
  };
}
