import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { issueTitle, type Library } from '@/domain/library';
import { parseReadingList, parseStructuredList, resolveAgainstLibrary, type BlockKind, type ResolvedLine } from '@/domain/parser';
import { addIssueBlocks, linkIssues } from '@/store/repo';
import { useStore } from '@/store/store';
import { ChevronDown, CloseIcon } from '@/ui/icons';
import { Checkbox, Chip, Cover, PrimaryButton, T } from '@/ui/parts';
import { C, F, KIND_COLOR, KIND_LABEL } from '@/ui/theme';

type Mode = 'library' | 'range' | 'paste';

/** Add issues to ?parent=<id>: pick existing ones, type a range, or paste a reading list. */
export default function AddIssues() {
  const params = useLocalSearchParams<{ parent?: string }>();
  const { lib, act } = useStore();
  const [parentId, setParentId] = useState(params.parent ?? null);
  const [mode, setMode] = useState<Mode>('paste');
  const [text, setText] = useState('');
  const [range, setRange] = useState({ series: '', from: '', to: '' });
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const parent = parentId ? lib.collections.get(parentId) : undefined;

  const source = mode === 'range' ? (range.series && range.from ? `${range.series} #${range.from}${range.to ? `-${range.to}` : ''}` : '') : text;
  // Paste mode understands "event:" / "run:" / "issue:" headers; each named part becomes a slice of that run or event.
  const structured = useMemo(() => (mode === 'paste' ? parseStructuredList(source) : null), [mode, source]);
  const plain = useMemo(() => (mode === 'range' ? parseReadingList(source) : null), [mode, source]);
  const errors = structured?.errors ?? plain?.errors ?? [];
  const blocks = useMemo(() => {
    const raw = structured ? structured.blocks : plain ? [{ kind: null, title: null, continued: false, items: plain.items }] : [];
    // Line numbers run across all parts, so a volume choice sticks to the right line.
    const starts = raw.map((_, i) => raw.slice(0, i).reduce((n, b) => n + b.items.length, 0));
    return raw.map((b, i) => ({ ...b, start: starts[i], lines: applyOverrides(resolveAgainstLibrary(b.items, lib), overrides, lib, starts[i]) }));
  }, [structured, plain, lib, overrides]);
  const lines = blocks.flatMap((b) => b.lines);
  const total = lines.reduce((n, l) => n + l.numbers.length, 0);
  const reused = lines.reduce((n, l) => n + l.existing.filter(Boolean).length, 0);

  if (!parent) return <PickTarget lib={lib} onPick={setParentId} />;

  const add = async () => {
    if (mode === 'library') await act((db, l) => linkIssues(db, l, parent.id, picked));
    else await act((db, l) => addIssueBlocks(db, l, parent.id, blocks.map((b) => ({ kind: b.kind, title: b.title, lines: b.lines })), parent.publisher));
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Add issues" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Pressable onPress={() => !params.parent && setParentId(null)} style={s.target}>
            <View style={{ flex: 1 }}>
              <Text style={T.tiny}>Adding to</Text>
              <Text numberOfLines={1} style={[T.bodyMedium, { fontSize: 14 }]}>{parent.title} <Text style={T.tiny}>· {KIND_LABEL[parent.kind].toLowerCase()}</Text></Text>
            </View>
            {!params.parent ? <ChevronDown /> : null}
          </Pressable>
          <View style={s.segment} accessibilityRole="tablist">
            {(['library', 'range', 'paste'] as Mode[]).map((m) => (
              <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => setMode(m)} style={[s.segItem, mode === m ? { backgroundColor: '#2C2C31' } : null]}>
                <Text style={[T.small, mode === m ? { color: C.text, fontFamily: F.semibold } : null]}>{m === 'library' ? 'From library' : m === 'range' ? 'Range' : 'Paste list'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {mode === 'library' ? (
          <LibraryPicker lib={lib} parentId={parent.id} q={q} setQ={setQ} picked={picked} setPicked={setPicked} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            {mode === 'paste' ? (
              <TextInput
                value={text}
                onChangeText={(t) => { setText(t); setOverrides({}); }}
                multiline
                placeholder={parent.kind === 'event'
                  ? 'Green Lantern #63–67\nGreen Lantern Corps #58–60\nGreen Lantern: Emerald Warriors #8–10'
                  : 'event: Blood Hunt\n• [ ] Blood Hunt #1–5\nrun: Captain America by Chip Zdarsky\n• [ ] Captain America (2025) #1–5\nissue:\n• [ ] The Will of Doom #1'}
                placeholderTextColor={C.faint}
                accessibilityLabel="Pasted reading list"
                style={s.paste}
              />
            ) : (
              <View style={{ gap: 10 }}>
                <TextInput value={range.series} onChangeText={(v) => setRange((r) => ({ ...r, series: v }))} placeholder="Series, e.g. Green Lantern (2005)" placeholderTextColor={C.faint} style={s.input} accessibilityLabel="Series" />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput value={range.from} onChangeText={(v) => setRange((r) => ({ ...r, from: v }))} placeholder="From #" keyboardType="number-pad" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} accessibilityLabel="First issue" />
                  <TextInput value={range.to} onChangeText={(v) => setRange((r) => ({ ...r, to: v }))} placeholder="To # (optional)" keyboardType="number-pad" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} accessibilityLabel="Last issue" />
                </View>
              </View>
            )}

            {errors.map((e) => (
              <Text key={e.line} style={[T.small, { color: C.indie }]}>Line {e.line}: {e.message}</Text>
            ))}
            {lines.length ? <Text style={[s.preview]}>Preview · {total} issues{structured?.hasHeaders ? ` in ${blocks.length} parts` : ''}</Text> : null}
            {blocks.map((b) => (
              <View key={b.start} style={{ gap: 8 }}>
                {b.kind ? (
                  <View style={s.blockHead}>
                    <Text style={[T.label, { color: KIND_COLOR[b.kind] }]}>{KIND_LABEL[b.kind]}</Text>
                    <Text style={[T.bodyMedium, { flex: 1 }]} numberOfLines={1}>
                      {b.title ?? (b.lines.length === 1 ? 'Single issue' : 'Single issues')}
                      {b.continued ? <Text style={T.small}> (continued)</Text> : null}
                    </Text>
                    {b.title ? <Text style={T.tiny}>{findCollection(lib, b.kind, b.title) ? 'in library' : 'new'}</Text> : null}
                  </View>
                ) : null}
                {b.lines.map((l, i) => {
                  const idx = b.start + i;
                  return (
                    <View key={idx} style={s.lineCard}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={[T.bodyMedium, { flex: 1 }]}>
                          {l.series ? l.series.title : l.seriesTitle}
                          {l.series?.volume_year ? ` (${l.series.volume_year})` : l.volumeYear ? ` (${l.volumeYear})` : ''} {rangeLabel(l.numbers)}
                          {l.checked ? <Text style={T.tiny}>  · read</Text> : null}
                        </Text>
                        <Text style={T.tiny}>{countLabel(l)}</Text>
                      </View>
                      {l.note ? <Text style={T.tiny}>{l.note}</Text> : null}
                      {l.assumedOneShot ? <Text style={[T.tiny, { color: C.indie }]}>No number given — added as #1</Text> : null}
                      {l.choices.length > 1 || (l.choices.length > 0 && !l.series) ? (
                        <View style={{ gap: 6 }}>
                          <Text style={[T.tiny, { color: C.indie }]}>Which {l.seriesTitle}?</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {l.choices.map((ch) => (
                              <Chip key={ch.id} label={ch.volume_year ? String(ch.volume_year) : 'No year'} active={l.series?.id === ch.id} onPress={() => setOverrides((o) => ({ ...o, [idx]: ch.id }))} />
                            ))}
                            <Chip label="New series" active={!l.series} onPress={() => setOverrides((o) => ({ ...o, [idx]: 'new' }))} />
                          </View>
                        </View>
                      ) : !l.series ? (
                        <Text style={T.tiny}>New series</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
            {mode === 'paste' && !text && parent.kind !== 'event' ? (
              <Text style={[T.tiny, { lineHeight: 18 }]}>
                Tip: label parts with “event:”, “run:” or “issue:” and add “(continued)” when a run comes back. Each part is added to that run or event and shown here in your order. “[x]” marks an issue read.
              </Text>
            ) : null}
          </ScrollView>
        )}

        <View style={s.footer}>
          <PrimaryButton
            label={mode === 'library' ? `Add ${picked.length} issue${picked.length === 1 ? '' : 's'}` : total ? `Add ${total} issues${reused ? ` · ${total - reused} new, ${reused} reused` : ''}` : 'Add issues'}
            onPress={add}
            disabled={mode === 'library' ? !picked.length : !total}
          />
          <Text style={[T.tiny, { textAlign: 'center', marginTop: 8 }]}>Issues you already have are reused, never duplicated.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function findCollection(lib: Library, kind: BlockKind, title: string) {
  return [...lib.collections.values()].find((c) => c.kind === kind && c.title.toLowerCase() === title.toLowerCase());
}

function applyOverrides(lines: ResolvedLine[], overrides: Record<number, string>, lib: Library, offset: number): ResolvedLine[] {
  const index = new Map<string, string>();
  for (const i of lib.issues.values()) if (i.number != null) index.set(`${i.series_id}#${i.number}`, i.id);
  return lines.map((l, idx) => {
    const o = overrides[offset + idx];
    if (!o) return l;
    const series = o === 'new' ? null : (lib.series.get(o) ?? null);
    return { ...l, series, existing: l.numbers.map((n) => (series ? (index.get(`${series.id}#${n}`) ?? null) : null)) };
  });
}

const rangeLabel = (nums: string[]) => (nums.length > 2 && nums.every((n, i) => i === 0 || Math.abs(Number(n) - Number(nums[i - 1])) === 1) ? `#${nums[0]}–${nums[nums.length - 1]}` : nums.map((n) => `#${n}`).join(', '));
function countLabel(l: ResolvedLine) {
  const have = l.existing.filter(Boolean).length;
  const fresh = l.numbers.length - have;
  return [fresh ? `${fresh} new` : '', have ? `${have} in library` : ''].filter(Boolean).join(' · ');
}

function LibraryPicker({ lib, parentId, q, setQ, picked, setPicked }: { lib: Library; parentId: string; q: string; setQ: (v: string) => void; picked: string[]; setPicked: (fn: (p: string[]) => string[]) => void }) {
  const inList = new Set((lib.children.get(parentId) ?? []).map((e) => e.child_issue_id));
  const items = useMemo(
    () =>
      [...lib.issues.values()]
        .filter((i) => !inList.has(i.id))
        .map((i) => ({ id: i.id, title: issueTitle(lib, i.id), read: i.status === 'read' }))
        .filter((x) => q.trim().length > 1 && x.title.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 200),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lib, q],
  );
  return (
    <View style={{ flex: 1 }}>
      <TextInput value={q} onChangeText={setQ} placeholder="Search your issues, e.g. Blackest Night" placeholderTextColor={C.dim} style={[s.input, { margin: 16 }]} accessibilityLabel="Search issues" />
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        ListEmptyComponent={<Text style={T.small}>{q.trim().length > 1 ? 'No matches.' : 'Type at least two letters.'}</Text>}
        renderItem={({ item }) => (
          <View style={s.pickRow}>
            <Text style={[T.body, { flex: 1, fontSize: 14 }]}>{item.title}{item.read ? <Text style={T.tiny}>  · read</Text> : null}</Text>
            <Checkbox checked={picked.includes(item.id)} label={`Select ${item.title}`} onPress={() => setPicked((p) => (p.includes(item.id) ? p.filter((x) => x !== item.id) : [...p, item.id]))} />
          </View>
        )}
      />
    </View>
  );
}

function PickTarget({ lib, onPick }: { lib: Library; onPick: (id: string) => void }) {
  const list = [...lib.collections.values()].sort((a, b) => a.title.localeCompare(b.title));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Add issues to…" />
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={<Text style={T.small}>Create a run or event first — issues always live inside one.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => onPick(item.id)} style={s.pickRow}>
            <Cover title={item.title} publisher={item.publisher} width={30} />
            <View style={{ flex: 1, paddingLeft: 12 }}>
              <Text style={T.bodyMedium}>{item.title}</Text>
              <Text style={T.tiny}>{KIND_LABEL[item.kind]}</Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4, paddingBottom: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <CloseIcon />
      </Pressable>
      <Text style={{ fontFamily: F.condBold, fontSize: 24, color: C.text }}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  target: { minHeight: 52, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  segment: { flexDirection: 'row', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 3 },
  segItem: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  paste: { minHeight: 110, backgroundColor: C.sunken, borderWidth: 1, borderColor: C.border, borderRadius: 12, color: '#D8D6D0', fontFamily: Platform.select({ android: 'monospace', default: 'Menlo' }), fontSize: 13, lineHeight: 21, padding: 12, textAlignVertical: 'top' },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
  preview: { fontFamily: F.cond, fontSize: 15, letterSpacing: 1.8, textTransform: 'uppercase', color: C.muted, marginTop: 6 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  lineCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, gap: 8 },
  footer: { padding: 16, paddingTop: 12, backgroundColor: C.bar, borderTopWidth: 1, borderTopColor: C.border },
  pickRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderBottomColor: C.divider },
});
