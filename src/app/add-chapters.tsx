import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStore } from '@/store/store';
import { addChapters, parseChapterRange } from '@/store/works';
import { CloseIcon } from '@/ui/icons';
import { KeyboardScroll } from '@/ui/keyboard-scroll';
import { PrimaryButton, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/** Adds chapters to a book or manga in one go: "49-60", "19.5". Numbers it already has are skipped. */
export default function AddChaptersScreen() {
  const { list } = useLocalSearchParams<{ list: string }>();
  const { lib, act, words } = useStore();
  const c = lib.collections.get(list);
  const seriesId = [...(lib.children.get(list) ?? [])].map((e) => (e.child_issue_id ? lib.issues.get(e.child_issue_id)?.series_id : null)).find(Boolean) ?? null;
  const last = seriesId ? [...lib.issues.values()].filter((i) => i.series_id === seriesId && i.number && /^\d+$/.test(i.number)).map((i) => Number(i.number)).sort((a, b) => b - a)[0] : undefined;
  const [range, setRange] = useState(last ? `${last + 1}-${last + 10}` : '1-20');
  const [heading, setHeading] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    if (!c || !seriesId) return setError('This list has no chapters to add to yet.');
    const numbers = parseChapterRange(range);
    if (!numbers.length) return setError('Type chapters like 49-60.');
    const n = await act((d, l) => addChapters(d, l, c.id, seriesId, numbers, heading.trim() || null));
    if (!n) return setError('Those chapters are already there.');
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title}>Add {words.issues}</Text>
      </View>
      <KeyboardScroll contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={T.small}>{c?.title}{last ? ` · has up to ${words.short(String(last))}` : ''}</Text>
        <View style={{ gap: 6 }}>
          <Text style={T.label}>{words.Issues.toUpperCase()}</Text>
          <TextInput value={range} onChangeText={setRange} accessibilityLabel="Chapters" placeholder="49-60, 60.5" placeholderTextColor={C.faint} style={s.input} autoFocus />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={T.label}>UNDER A NEW HEADING (OPTIONAL)</Text>
          <TextInput value={heading} onChangeText={setHeading} accessibilityLabel="Heading" placeholder="Vol. 12 · Ch. 99–107" placeholderTextColor={C.faint} style={s.input} />
        </View>
        {error ? <Text style={[T.small, { color: C.indie }]}>{error}</Text> : null}
        <PrimaryButton label={`Add ${words.issues}`} onPress={save} />
      </KeyboardScroll>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4 },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
});
