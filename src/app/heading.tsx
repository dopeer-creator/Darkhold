import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addHeading, removeEntry, updateHeading } from '@/store/repo';
import { useStore } from '@/store/store';
import { CloseIcon } from '@/ui/icons';
import { GhostButton, PrimaryButton, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/**
 * Add or rename a chapter heading — a line that names a section of a reading order
 * ("Phase 2 · The Incursions") and holds no issues. ?parent=<id>[&entry=<id> to rename]
 */
export default function HeadingScreen() {
  const { parent, entry } = useLocalSearchParams<{ parent: string; entry?: string }>();
  const { lib, act } = useStore();
  const existing = entry ? (lib.children.get(parent) ?? []).find((e) => e.id === entry) : undefined;
  const collection = lib.collections.get(parent);
  const [title, setTitle] = useState(existing?.heading ?? '');
  const [note, setNote] = useState(existing?.note ?? '');

  const save = async () => {
    const t = title.trim();
    if (!t) return;
    if (existing) await act((db, l) => updateHeading(db, l, parent, existing.id, t, note.trim() || null));
    else await act((db, l) => addHeading(db, l, parent, t, note.trim() || null));
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title}>{existing ? 'Rename chapter' : 'New chapter heading'}</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1, padding: 16, gap: 14 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={T.small}>
          A heading names a section of {collection?.title ?? 'this list'}, like “Phase 2 · The Incursions”. It holds no issues — it shows that section’s progress and folds it away.
          {existing ? '' : ' It goes at the end; move it into place with Edit order.'}
        </Text>
        <TextInput value={title} onChangeText={setTitle} autoFocus placeholder="Phase 2 · The Incursions" placeholderTextColor={C.faint} style={s.input} accessibilityLabel="Heading" />
        <TextInput value={note} onChangeText={setNote} placeholder="One line about this part (optional)" placeholderTextColor={C.faint} style={s.input} accessibilityLabel="Description" />
        <PrimaryButton label={existing ? 'Save' : 'Add heading'} onPress={save} disabled={!title.trim()} />
        {existing ? (
          <GhostButton
            label="Delete heading"
            onPress={() =>
              Alert.alert('Delete this heading?', 'Only the heading line goes. Every issue stays where it is.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => act((db) => removeEntry(db, existing.id)).then(() => router.back()) },
              ])
            }
          />
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4 },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
});
