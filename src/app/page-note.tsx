import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pageNow } from '@/domain/pages';
import { deletePageNote, savePageNote } from '@/store/pages';
import { useStore } from '@/store/store';
import { CloseIcon } from '@/ui/icons';
import { KeyboardScroll } from '@/ui/keyboard-scroll';
import { Checkbox, PrimaryButton, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/** A note on a page of a book: new, or one you tap to change. Starred notes show on your review. */
export default function PageNoteScreen() {
  const { list, note } = useLocalSearchParams<{ list: string; note?: string }>();
  const { lib, act } = useStore();
  const had = note ? (lib.pageNotes.get(list) ?? []).find((n) => n.id === note) : undefined;
  const [page, setPage] = useState(had ? (had.page != null ? String(had.page) : '') : String(pageNow(lib, list) || ''));
  const [body, setBody] = useState(had?.body ?? '');
  const [starred, setStarred] = useState(!!had?.starred);
  const [error, setError] = useState('');

  const save = async () => {
    if (!body.trim()) return setError('Write the note first');
    const p = page.trim() ? parseInt(page, 10) : null;
    await act((db) => savePageNote(db, { id: had?.id, collection_id: list, page: p, body, starred, created_at: had?.created_at ?? null }));
    router.back();
  };
  const remove = () =>
    Alert.alert('Delete this note?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => act((db) => deletePageNote(db, had!.id)).then(() => router.back()) },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={s.icon}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title}>{had ? 'Your note' : 'Add a note'}</Text>
      </View>
      <KeyboardScroll contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={T.small}>{lib.collections.get(list)?.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={T.small}>Page</Text>
          <TextInput value={page} onChangeText={(x) => setPage(x.replace(/[^0-9]/g, ''))} keyboardType="number-pad" accessibilityLabel="Page" placeholder="—" placeholderTextColor={C.faint} style={[s.input, { width: 90, textAlign: 'center' }]} />
        </View>
        <TextInput value={body} onChangeText={(x) => { setBody(x); setError(''); }} multiline autoFocus={!had} accessibilityLabel="Note" placeholder="A thought, or a line you want to keep" placeholderTextColor={C.faint} style={[s.input, { minHeight: 120, textAlignVertical: 'top', paddingTop: 10 }]} />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: starred }} onPress={() => setStarred((x) => !x)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
          <Checkbox checked={starred} label="Star" onPress={() => setStarred((x) => !x)} />
          <Text style={T.body}>Star it</Text>
          <Text style={[T.tiny, { flex: 1 }]}> · shows on your review as a favourite quote</Text>
        </Pressable>
        {error ? <Text style={[T.small, { color: C.danger }]}>{error}</Text> : null}
        <PrimaryButton label="Save note" onPress={save} />
        {had ? (
          <Pressable accessibilityRole="button" onPress={remove} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[T.body, { color: C.danger }]}>Delete note</Text>
          </Pressable>
        ) : null}
      </KeyboardScroll>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surface, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 12 },
});
