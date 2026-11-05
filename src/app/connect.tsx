import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { issueTitle } from '@/domain/library';
import type { LinkKind } from '@/domain/types';
import { addLink, type LinkEnd } from '@/store/repo';
import { useStore } from '@/store/store';
import { CloseIcon, SearchIcon } from '@/ui/icons';
import { Chip, PrimaryButton, T } from '@/ui/parts';
import { C, F, KIND_COLOR, kindLabel } from '@/ui/theme';

/** The four ways to connect, as they read from this side. "Leads into" is "follows" the other way round. */
const CHOICES: { key: string; label: string; hint: string; kind: LinkKind; reverse: boolean }[] = [
  { key: 'after', label: 'Comes after', hint: 'This picks up after it, like a run that follows an event', kind: 'follows', reverse: false },
  { key: 'before', label: 'Leads into', hint: 'This comes first; the other one picks up after it', kind: 'follows', reverse: true },
  { key: 'background', label: 'Background', hint: 'Reads better if you know it. Doesn’t count toward anything', kind: 'background', reverse: false },
  { key: 'tie_in', label: 'Tie-in of', hint: 'This ties into a bigger event', kind: 'tie_in', reverse: false },
];

type Target = { key: string; end: LinkEnd; tag: string; color: string; title: string };

/** Connect a list (?collection=<id>) or an issue (?issue=<id>) to another list or issue. */
export default function ConnectScreen() {
  const params = useLocalSearchParams<{ collection?: string; issue?: string }>();
  const { lib, act } = useStore();
  const here: LinkEnd | null = params.collection ? { collectionId: params.collection } : params.issue ? { issueId: params.issue } : null;
  const hereTitle = params.collection ? lib.collections.get(params.collection)?.title : params.issue ? issueTitle(lib, params.issue) : '';
  const [choice, setChoice] = useState(CHOICES[0]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Target | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const lists: Target[] = [...lib.collections.values()]
      .filter((c) => c.id !== params.collection && c.title.toLowerCase().includes(q))
      .map((c) => ({ key: c.id, end: { collectionId: c.id }, tag: kindLabel(c), color: KIND_COLOR[c.kind], title: c.title }));
    const issues: Target[] = [...lib.issues.values()]
      .filter((i) => i.id !== params.issue)
      .map((i) => ({ key: i.id, end: { issueId: i.id } as LinkEnd, tag: 'ISSUE', color: KIND_COLOR.issue, title: issueTitle(lib, i.id) }))
      .filter((t) => t.title.toLowerCase().includes(q));
    return [...lists.sort((a, b) => a.title.localeCompare(b.title)), ...issues.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))].slice(0, 40);
  }, [lib, query, params.collection, params.issue]);

  const save = async () => {
    if (!here || !picked) return;
    const [from, to] = choice.reverse ? [picked.end, here] : [here, picked.end];
    const problem = await act((db) => addLink(db, choice.kind, from, to, note.trim() || null));
    if (problem) return setError(problem);
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title}>Connect</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1, paddingHorizontal: 16, gap: 12 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={T.small} numberOfLines={2}>{hereTitle}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CHOICES.map((c) => <Chip key={c.key} label={c.label} active={choice.key === c.key} onPress={() => setChoice(c)} />)}
        </View>
        <Text style={T.tiny}>{choice.hint}.</Text>
        {picked ? (
          <View style={{ gap: 12 }}>
            <Pressable accessibilityRole="button" accessibilityHint="Pick something else" onPress={() => setPicked(null)} style={s.picked}>
              <Text style={[T.label, { fontSize: 10, color: picked.color }]}>{choice.label.toUpperCase()} · {picked.tag}</Text>
              <Text style={T.bodyMedium}>{picked.title}</Text>
              <Text style={T.tiny}>Tap to pick something else</Text>
            </Pressable>
            <TextInput value={note} onChangeText={setNote} placeholder="A note, e.g. why Peter’s identity is out (optional)" placeholderTextColor={C.faint} multiline style={[s.input, { minHeight: 72, textAlignVertical: 'top', paddingTop: 12 }]} accessibilityLabel="Note" />
            {error ? <Text style={[T.small, { color: C.indie }]}>{error}</Text> : null}
            <PrimaryButton label="Connect" onPress={save} />
          </View>
        ) : (
          <>
            <View style={s.search}>
              <SearchIcon size={18} />
              <TextInput value={query} onChangeText={setQuery} autoFocus placeholder="Find a run, event or issue" placeholderTextColor={C.faint} style={{ flex: 1, color: C.text, fontFamily: F.sans, fontSize: 15 }} accessibilityLabel="Find a list or issue" />
            </View>
            <FlatList
              data={results}
              keyExtractor={(t) => t.key}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={[T.tiny, { paddingTop: 8 }]}>{query.trim() ? 'Nothing matches. Add it to your library first.' : 'Type part of a name: “Armageddon”, “Spider-Man #10”.'}</Text>}
              renderItem={({ item }) => (
                <Pressable onPress={() => setPicked(item)} style={({ pressed }) => [s.row, pressed ? { backgroundColor: C.surface2 } : null]}>
                  <Text style={[T.label, { fontSize: 10, color: item.color, width: 108 }]} numberOfLines={1}>{item.tag}</Text>
                  <Text style={[T.body, { flex: 1 }]} numberOfLines={2}>{item.title}</Text>
                </Pressable>
              )}
            />
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4 },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  search: { height: 46, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.divider },
  picked: { padding: 14, gap: 4, borderRadius: 12, borderWidth: 1, borderColor: C.dc, backgroundColor: '#16223A' },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
});
