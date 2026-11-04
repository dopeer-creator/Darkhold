import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { canSlice, issueTitle } from '@/domain/library';
import type { Kind } from '@/domain/types';
import { createCollection, setPartOf } from '@/store/repo';
import { useStore } from '@/store/store';
import { CloseIcon } from '@/ui/icons';
import { Checkbox, Chip, SectionTitle, T } from '@/ui/parts';
import { C, F, KIND_COLOR, KIND_LABEL } from '@/ui/theme';

/**
 * "Part of…": mark lines of a crisis (or run) as one run's or event's part, e.g. Batman #21–22 and
 * Flash #21–22 as The Button. The issues are added to that run or event too, and the crisis shows
 * them as a labelled block. ?parent=<id>&entries=<id,id>
 */
export default function PartOf() {
  const { parent: parentId, entries } = useLocalSearchParams<{ parent: string; entries?: string }>();
  const { lib, act } = useStore();
  const parent = lib.collections.get(parentId);
  const lines = (lib.children.get(parentId) ?? []).filter((e) => e.child_issue_id && lib.issues.has(e.child_issue_id));
  const start = new Set((entries ?? '').split(',').filter(Boolean));
  // Start with the tapped lines plus the plain lines of the same series right after them.
  const [picked, setPicked] = useState<Set<string>>(() => {
    const out = new Set(start);
    const firstIdx = lines.findIndex((e) => start.has(e.id));
    if (firstIdx >= 0 && start.size === 1 && !lines[firstIdx].via_collection_id) {
      const series = lib.issues.get(lines[firstIdx].child_issue_id!)!.series_id;
      for (let k = firstIdx + 1; k < lines.length; k++) {
        const e = lines[k];
        if (e.via_collection_id || lib.issues.get(e.child_issue_id!)!.series_id !== series) break;
        out.add(e.id);
      }
    }
    return out;
  });
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<Kind>('event');
  if (!parent) return null;

  const targets = [...lib.collections.values()]
    .filter((c) => canSlice(lib, parentId, c.id))
    .sort((a, b) => Number(isHome(b.id)) - Number(isHome(a.id)) || a.title.localeCompare(b.title));
  function isHome(id: string) {
    return lines.some((e) => picked.has(e.id) && (lib.parents.get(e.child_issue_id!) ?? []).includes(id));
  }

  const apply = async (viaId: string | null, label: string) => {
    if (!picked.size) return Alert.alert('Tick some lines first');
    const reason = await act((db, l) => setPartOf(db, l, parentId, [...picked], viaId));
    if (reason) return Alert.alert('Not possible', reason);
    router.back();
    void label;
  };
  const createAndApply = async () => {
    const title = newName.trim();
    if (!title) return;
    const id = await act((db, l) => createCollection(db, { kind: newKind, title, publisher: parent.publisher }, undefined, l));
    await act((db, l) => setPartOf(db, l, parentId, [...picked], id));
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title}>Part of…</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={T.small}>Tick the lines, then pick the run or event they belong to. {parent.title} shows them as one labelled block.</Text>

        <View>
          <SectionTitle right={<Text style={T.tiny}>{picked.size} ticked</Text>}>Lines</SectionTitle>
          {lines.map((e) => {
            const via = e.via_collection_id ? lib.collections.get(e.via_collection_id) : undefined;
            const on = picked.has(e.id);
            return (
              <View key={e.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={T.body}>{issueTitle(lib, e.child_issue_id!)}</Text>
                  {via ? <Text style={[T.tiny, { color: KIND_COLOR[via.kind] }]}>{KIND_LABEL[via.kind]} · {via.title}</Text> : null}
                </View>
                <Checkbox
                  checked={on}
                  label={`Tick ${issueTitle(lib, e.child_issue_id!)}`}
                  onPress={() =>
                    setPicked((p) => {
                      const n = new Set(p);
                      if (on) n.delete(e.id);
                      else n.add(e.id);
                      return n;
                    })
                  }
                />
              </View>
            );
          })}
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle>A new one</SectionTitle>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Event" active={newKind === 'event'} onPress={() => setNewKind('event')} />
            {parent.kind === 'crisis' ? <Chip label="Run" active={newKind === 'run'} onPress={() => setNewKind('run')} /> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={newName} onChangeText={setNewName} placeholder={newKind === 'event' ? 'e.g. The Button' : 'e.g. The Flash (2016)'} placeholderTextColor={C.faint} style={s.input} accessibilityLabel="New name" />
            <Pressable accessibilityRole="button" onPress={createAndApply} disabled={!newName.trim() || !picked.size} style={[s.btn, !newName.trim() || !picked.size ? { opacity: 0.4 } : null]}>
              <Text style={[T.small, { color: C.onLight, fontFamily: F.semibold }]}>Create</Text>
            </Pressable>
          </View>
        </View>

        <View>
          <SectionTitle>Or one you have</SectionTitle>
          {targets.map((c) => (
            <Pressable key={c.id} onPress={() => apply(c.id, c.title)} style={s.row}>
              <Text style={[T.label, { color: KIND_COLOR[c.kind], width: 52 }]}>{KIND_LABEL[c.kind]}</Text>
              <Text style={[T.body, { flex: 1 }]} numberOfLines={1}>{c.title}</Text>
              {isHome(c.id) ? <Text style={T.tiny}>has these</Text> : null}
            </Pressable>
          ))}
          <Pressable onPress={() => apply(null, '')} style={s.row}>
            <Text style={[T.body, { color: C.muted }]}>Not part of anything — plain lines</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4 },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderBottomWidth: 1, borderBottomColor: C.divider },
  input: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
  btn: { height: 48, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.text, justifyContent: 'center' },
});
