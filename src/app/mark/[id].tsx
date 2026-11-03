import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { walk } from '@/domain/library';
import { markCollection, today, type ReadDate } from '@/store/repo';
import { useStore } from '@/store/store';
import { CloseIcon } from '@/ui/icons';
import { GhostButton, PrimaryButton, T } from '@/ui/parts';
import { relativeDay } from '@/ui/format';
import { pickDay } from '@/ui/pick-day';
import { C, F, KIND_LABEL } from '@/ui/theme';

type Choice = 'unknown' | 'today' | 'day';

/** Mark a whole run, event or crisis read in one go — without a date, today, or on a day you pick. */
export default function MarkAll() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { lib, act } = useStore();
  const c = lib.collections.get(id);
  const [choice, setChoice] = useState<Choice>('unknown');
  const [day, setDay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!c) return null;

  const ids = [...new Set(walk(lib, id).map((s) => s.issueId))];
  const unread = ids.filter((i) => lib.issues.get(i)?.status !== 'read').length;
  const read = ids.length - unread;
  const date: ReadDate = choice === 'unknown' ? null : choice === 'today' ? today() : day;

  const pick = async () => {
    const d = await pickDay(day);
    if (d) {
      setDay(d);
      setChoice('day');
    }
  };
  const run = async (status: 'read' | 'unread') => {
    setBusy(true);
    await act((db, l) => markCollection(db, l, id, status, status === 'read' ? date : undefined));
    setBusy(false);
    router.back();
  };

  const options: { key: Choice; title: string; hint: string; onPress: () => void }[] = [
    { key: 'unknown', title: 'Without a date', hint: 'Counts as read; History lists them under "Date unknown"', onPress: () => setChoice('unknown') },
    { key: 'today', title: 'Today', hint: 'Shows up in History today', onPress: () => setChoice('today') },
    { key: 'day', title: day ? `On ${relativeDay(day)}` : 'On a day you pick…', hint: 'For something you read before', onPress: pick },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title}>Mark as read</Text>
      </View>
      <View style={{ padding: 16, gap: 14 }}>
        <Text style={T.body}>
          {c.title} <Text style={T.small}>· {KIND_LABEL[c.kind].toLowerCase()}</Text>
        </Text>
        <Text style={T.small}>
          {unread ? `${unread} issue${unread === 1 ? '' : 's'} will be marked read.` : 'Everything here is already read.'}
          {read ? ` ${read} already read keep their dates.` : ''}
        </Text>
        <View style={{ gap: 8 }}>
          {options.map((o) => (
            <Pressable key={o.key} accessibilityRole="radio" accessibilityState={{ checked: choice === o.key }} onPress={o.onPress} style={[s.option, choice === o.key ? { borderColor: C.text } : null]}>
              <View style={[s.radio, choice === o.key ? { borderColor: C.text } : null]}>{choice === o.key ? <View style={s.dot} /> : null}</View>
              <View style={{ flex: 1 }}>
                <Text style={T.bodyMedium}>{o.title}</Text>
                <Text style={T.tiny}>{o.hint}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <PrimaryButton label={busy ? 'Saving…' : `Mark ${unread} read`} onPress={() => run('read')} disabled={busy || !unread || (choice === 'day' && !day)} />
        {read ? (
          <GhostButton
            label="Mark everything here unread"
            onPress={() =>
              Alert.alert(`Mark all of ${c.title} unread?`, `${read} read issues lose their read dates. Issues are shared, so they also show unread in other runs and crises.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Mark unread', style: 'destructive', onPress: () => run('unread') },
              ])
            }
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4 },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.text },
});
