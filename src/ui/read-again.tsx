import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { issueTitle } from '@/domain/library';
import { logReread, removeReread, setIssueStatus, today } from '@/store/repo';
import { useStore } from '@/store/store';
import { relativeDay } from '@/ui/format';
import { T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/**
 * Ticking an issue you've already read no longer unmarks it on the spot (which wiped its read date and
 * rereads). It asks instead: read it again today, or mark it unread, which says what that removes.
 * Use `tick` for a checkbox, `askUnread` for an explicit "Unread" button, and render `sheet` once.
 */
export function useReadTick() {
  const { lib, act } = useStore();
  const [target, setTarget] = useState<{ id: string; confirm: boolean } | null>(null);

  const tick = (issueId: string) => {
    const issue = lib.issues.get(issueId);
    if (!issue) return;
    if (issue.status !== 'read') return act((d, l) => setIssueStatus(d, l, issueId, 'read'));
    setTarget({ id: issueId, confirm: false });
  };
  const askUnread = (issueId: string) => setTarget({ id: issueId, confirm: true });
  const close = () => setTarget(null);

  const issue = target ? lib.issues.get(target.id) : undefined;
  const rereads = issue ? (lib.rereads.get(issue.id) ?? []) : [];
  const todays = rereads.filter((r) => r.day === today());
  const firstRead = issue?.completed_at ? `Read ${relativeDay(issue.completed_at)}` : 'Read, date unknown';
  const again = rereads.length ? ` · read again ${rereads.length === 1 ? 'once' : `${rereads.length} times`}` : '';

  const sheet = (
    <Modal transparent animationType="fade" visible={!!issue} onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={s.backdrop} />
      {issue ? (
        <View style={s.sheet}>
          <Text style={s.title} numberOfLines={2}>{issueTitle(lib, issue.id)}</Text>
          <Text style={T.small}>{firstRead}{again}</Text>

          {!target!.confirm ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              {todays.length ? (
                <Choice
                  label="Take back today’s reread"
                  hint="You logged reading it again today. This removes that line from History."
                  onPress={() => { close(); act((d) => Promise.all(todays.map((r) => removeReread(d, r.id)))); }}
                />
              ) : (
                <Choice primary label="Read it again today" hint="Adds a reread to History. Your first read and any review stay as they are." onPress={() => { close(); act((d) => logReread(d, issue.id)); }} />
              )}
              <Choice label="Mark as unread" hint="For an issue you ticked by mistake." onPress={() => setTarget({ id: issue.id, confirm: true })} />
              <Pressable accessibilityRole="button" onPress={close} style={s.cancel}><Text style={T.small}>Cancel</Text></Pressable>
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 14 }}>
              <Text style={[T.body, { lineHeight: 21 }]}>
                Mark it unread? This removes its read date{rereads.length ? ` and ${rereads.length === 1 ? 'its reread' : `all ${rereads.length} rereads`}` : ''} from History. Issues are shared, so it shows unread in every list that holds it.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable accessibilityRole="button" onPress={close} style={[s.btn, { flex: 1 }]}><Text style={[T.small, { color: C.text }]}>Keep it read</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => { close(); act((d, l) => setIssueStatus(d, l, issue.id, 'unread')); }} style={[s.btn, { flex: 1, borderColor: C.danger }]}>
                  <Text style={[T.small, { color: C.danger, fontFamily: F.semibold }]}>Mark unread</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ) : null}
    </Modal>
  );

  return { tick, askUnread, sheet };
}

function Choice({ label, hint, onPress, primary }: { label: string; hint: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityHint={hint} onPress={onPress} style={({ pressed }) => [s.choice, primary ? s.primary : null, pressed ? { opacity: 0.8 } : null]}>
      <Text style={[T.bodyMedium, primary ? { color: C.onLight } : null]}>{label}</Text>
      <Text style={[T.tiny, primary ? { color: '#3A3A40' } : null]}>{hint}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: C.border, padding: 18, paddingBottom: 30, gap: 4, maxWidth: 600, alignSelf: 'center', width: '100%' },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  choice: { borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, paddingHorizontal: 14, paddingVertical: 12, gap: 2, minHeight: 56, justifyContent: 'center' },
  primary: { backgroundColor: C.text, borderColor: C.text },
  btn: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
