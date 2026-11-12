import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { chapterSpots, issueTitle, type Library } from '@/domain/library';
import { parseStructuredList, resolveAgainstLibrary, type BlockKind, type ResolvedLine } from '@/domain/parser';
import { addIssueBlocks, linkIssues } from '@/store/repo';
import { useStore } from '@/store/store';
import { ChevronDown, CloseIcon } from '@/ui/icons';
import { Checkbox, Chip, Cover, PrimaryButton, T } from '@/ui/parts';
import { C, F, KIND_COLOR, KIND_LABEL, kindLabel } from '@/ui/theme';

type Mode = 'type' | 'library';

/**
 * Add issues to ?parent=<id>: type them ("Uncanny X-Men #139–140, 143") or pick ones you already have.
 * Where they go (?after=<entry>, or a chapter picked here), the run or event they're part of (?partOf=<id>),
 * and whether you've read them are all chosen on this one screen. ?issue=<id> starts with that issue picked.
 */
export default function AddIssues() {
  const params = useLocalSearchParams<{ parent?: string; after?: string; partOf?: string; issue?: string }>();
  const { lib, act } = useStore();
  const [parentId, setParentId] = useState(params.parent ?? null);
  const [mode, setMode] = useState<Mode>(params.issue ? 'library' : 'type');
  const [text, setText] = useState('');
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<string[]>(params.issue ? [params.issue] : []);
  const [q, setQ] = useState('');
  const [after, setAfter] = useState<string | null>(params.after ?? null);
  const [partOf, setPartOf] = useState<string | null>(params.partOf ?? null);
  const [markRead, setMarkRead] = useState(false);
  // Optional, per line typed (by line number) or per issue picked.
  const [optLines, setOptLines] = useState<Record<number, boolean>>({});
  const [optIds, setOptIds] = useState<string[]>([]);
  const parent = parentId ? lib.collections.get(parentId) : undefined;
  const chapters = useMemo(() => (parentId ? chapterSpots(lib, parentId) : []), [lib, parentId]);

  const structured = useMemo(() => (mode === 'type' ? parseStructuredList(text) : null), [mode, text]);
  const errors = structured?.errors ?? [];
  const blocks = useMemo(() => {
    const raw = structured ? structured.blocks : [];
    // Line numbers run across all parts, so a volume choice sticks to the right line.
    const starts = raw.map((_, i) => raw.slice(0, i).reduce((n, b) => n + b.items.length, 0));
    return raw.map((b, i) => ({ ...b, start: starts[i], lines: applyOverrides(resolveAgainstLibrary(b.items, lib), overrides, lib, starts[i]) }));
  }, [structured, lib, overrides]);
  const lines = blocks.flatMap((b) => b.lines);
  const total = lines.reduce((n, l) => n + l.numbers.length, 0);

  if (!parent) return <PickTarget lib={lib} onPick={setParentId} />;

  const chapter = chapters.find((ch) => ch.afterEntryId === after || ch.headingId === after);
  const pickChapter = (ch: (typeof chapters)[number] | null) => {
    setAfter(ch ? ch.afterEntryId : null);
    setPartOf(ch?.partOf.length === 1 ? ch.partOf[0] : null);
  };
  // Runs and events worth offering: the chapter's own first, then the others this list already uses.
  const listVias = [...new Set((lib.children.get(parent.id) ?? []).map((e) => (e.child_issue_id ? (e.part_of ?? e.via_collection_id) : null)).filter((v): v is string => !!v && lib.collections.has(v)))];
  const suggestions = [...new Set([...(partOf ? [partOf] : []), ...(chapter?.partOf ?? []).slice().reverse(), ...listVias.reverse()])].slice(0, 6);
  const canFile = parent.kind !== 'event';
  const count = mode === 'library' ? picked.length : total;

  const add = async () => {
    const opts = { afterEntryId: after, partOf: canFile ? partOf : null, markRead, optionalIds: optIds.filter((id) => picked.includes(id)) };
    if (mode === 'library') await act((db, l) => linkIssues(db, l, parent.id, picked, opts));
    else await act((db, l) => addIssueBlocks(db, l, parent.id, blocks.map((b) => ({ kind: b.kind, title: b.title, lines: b.lines.map((l, i) => ({ ...l, optional: !!optLines[b.start + i] })) })), parent.publisher, opts));
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Add issues" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => !params.parent && setParentId(null)} style={s.target}>
            <View style={{ flex: 1 }}>
              <Text style={T.tiny}>Adding to</Text>
              <Text numberOfLines={1} style={[T.bodyMedium, { fontSize: 14 }]}>{parent.title} <Text style={T.tiny}>· {kindLabel(parent).toLowerCase()}</Text></Text>
            </View>
            {!params.parent ? <ChevronDown /> : null}
          </Pressable>

          {chapters.length ? (
            <View style={{ gap: 6 }}>
              <Text style={T.label}>WHERE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <Chip label="At the end" active={!after} onPress={() => pickChapter(null)} />
                {chapters.map((ch) => (
                  <Chip key={ch.headingId} label={ch.title} active={chapter?.headingId === ch.headingId} onPress={() => pickChapter(ch)} />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {canFile ? (
            <View style={{ gap: 6 }}>
              <Text style={T.label}>PART OF</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Chip label="Nothing" active={!partOf} onPress={() => setPartOf(null)} />
                {suggestions.map((id) => (
                  <Chip key={id} label={lib.collections.get(id)!.title} active={partOf === id} onPress={() => setPartOf(id)} />
                ))}
              </View>
              <PartOfSearch lib={lib} exclude={parent.id} onPick={setPartOf} />
              {partOf ? <Text style={T.tiny}>They’re added to {lib.collections.get(partOf)?.title} too, in number order.</Text> : null}
            </View>
          ) : null}

          <Toggle label="I’ve read these" on={markRead} onPress={() => setMarkRead((m) => !m)} />

          <View style={s.segment} accessibilityRole="tablist">
            {(['type', 'library'] as Mode[]).map((m) => (
              <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => setMode(m)} style={[s.segItem, mode === m ? { backgroundColor: '#2C2C31' } : null]}>
                <Text style={[T.small, mode === m ? { color: C.text, fontFamily: F.semibold } : null]}>{m === 'type' ? 'Type or paste' : 'From your library'}</Text>
              </Pressable>
            ))}
          </View>

          {mode === 'library' ? (
            <LibraryPicker lib={lib} parentId={parent.id} q={q} setQ={setQ} picked={picked} setPicked={setPicked} optIds={optIds} setOptIds={setOptIds} />
          ) : (
            <View style={{ gap: 10 }}>
              <TextInput
                value={text}
                onChangeText={(t) => { setText(t); setOverrides({}); setOptLines({}); }}
                multiline
                placeholder={'Uncanny X-Men (1963) #139–140, 143\nX-Men (2024) #35'}
                placeholderTextColor={C.faint}
                accessibilityLabel="Issues to add"
                style={s.paste}
              />
              {!text ? <Text style={T.tiny}>One series per line. Ranges and lists work: #1–5, 7, 9.</Text> : null}
              {errors.map((e) => (
                <Text key={e.line} style={[T.small, { color: C.indie }]}>Line {e.line}: {e.message}</Text>
              ))}
              {blocks.map((b, bi) => (
                <View key={`${bi}:${b.start}`} style={{ gap: 8 }}>
                  {b.kind ? (
                    <View style={s.blockHead}>
                      <Text style={[T.label, { color: KIND_COLOR[b.kind] }]}>{KIND_LABEL[b.kind]}</Text>
                      <Text style={[T.bodyMedium, { flex: 1 }]} numberOfLines={1}>
                        {b.title ?? (b.lines.length === 1 ? 'Single issue' : 'Single issues')}
                        {b.continued ? <Text style={T.small}> (continued)</Text> : null}
                      </Text>
                      {b.title && b.kind !== 'heading' ? <Text style={T.tiny}>{findCollection(lib, b.kind, b.title) ? 'in library' : 'new'}</Text> : null}
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
                          </Text>
                          <Text style={T.tiny}>{countLabel(l)}</Text>
                        </View>
                        {(l.choices.length > 0 && !l.series) || (l.choices.length > 1 && l.volumeYear == null) ? (
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
                          <Text style={[T.tiny, l.volumeYear == null ? { color: C.indie } : null]}>
                            {l.volumeYear == null ? `New series. Add the year it started, like “${l.seriesTitle} (2024)”.` : 'New series'}
                          </Text>
                        ) : null}
                        {b.kind !== 'heading' ? (
                          <OptionalChip on={!!optLines[idx]} onPress={() => setOptLines((o) => ({ ...o, [idx]: !o[idx] }))} />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={s.footer}>
          <PrimaryButton
            label={count ? `Add ${count} issue${count === 1 ? '' : 's'}${chapter ? ` to ${chapter.title}` : ''}` : 'Add issues'}
            onPress={add}
            disabled={!count}
          />
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

/** "Other…": find any run or event by name. */
function PartOfSearch({ lib, exclude, onPick }: { lib: Library; exclude: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const hits = q.trim().length < 2 ? [] : [...lib.collections.values()]
    .filter((c) => c.id !== exclude && (c.kind === 'run' || c.kind === 'event') && c.title.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 6);
  return (
    <View style={{ gap: 4 }}>
      <TextInput value={q} onChangeText={setQ} placeholder="Another run or event…" placeholderTextColor={C.dim} style={[s.input, { minHeight: 40, fontSize: 14 }]} accessibilityLabel="Find a run or event" />
      {hits.map((c) => (
        <Pressable key={c.id} onPress={() => { onPick(c.id); setQ(''); }} style={s.hit}>
          <Text style={[T.body, { fontSize: 14, flex: 1 }]} numberOfLines={1}>{c.title}</Text>
          <Text style={T.tiny}>{kindLabel(c)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function LibraryPicker({ lib, parentId, q, setQ, picked, setPicked, optIds, setOptIds }: { lib: Library; parentId: string; q: string; setQ: (v: string) => void; picked: string[]; setPicked: (fn: (p: string[]) => string[]) => void; optIds: string[]; setOptIds: (fn: (p: string[]) => string[]) => void }) {
  const inList = new Set((lib.children.get(parentId) ?? []).map((e) => e.child_issue_id));
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const items = q.trim().length < 2 ? [] : [...lib.issues.values()]
    .filter((i) => !inList.has(i.id) && !picked.includes(i.id))
    .map((i) => ({ id: i.id, title: issueTitle(lib, i.id), read: i.status === 'read' }))
    .filter((x) => words.every((w) => x.title.toLowerCase().replace('#', ' ').includes(w.replace('#', ''))))
    .slice(0, 60);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const row = (id: string, title: string, read: boolean) => (
    <View key={id} style={s.pickRow}>
      <Text style={[T.body, { flex: 1, fontSize: 14 }]}>{title}{read ? <Text style={T.tiny}>  · read</Text> : null}</Text>
      {picked.includes(id) ? (
        <OptionalChip on={optIds.includes(id)} onPress={() => setOptIds((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))} />
      ) : null}
      <Checkbox checked={picked.includes(id)} label={`Select ${title}`} onPress={() => toggle(id)} />
    </View>
  );
  return (
    <View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search, e.g. x-men 40" placeholderTextColor={C.dim} style={s.input} accessibilityLabel="Search issues" />
      {picked.map((id) => (lib.issues.has(id) ? row(id, issueTitle(lib, id), lib.issues.get(id)!.status === 'read') : null))}
      {items.map((x) => row(x.id, x.title, x.read))}
      {!items.length && !picked.length ? <Text style={[T.small, { paddingTop: 10 }]}>{q.trim().length > 1 ? 'No matches.' : 'Type at least two letters.'}</Text> : null}
    </View>
  );
}

function PickTarget({ lib, onPick }: { lib: Library; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const list = [...lib.collections.values()]
    .filter((c) => !q.trim() || c.title.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Add to which list?" />
      <TextInput value={q} onChangeText={setQ} placeholder="Search your lists" placeholderTextColor={C.dim} style={[s.input, { marginHorizontal: 16, marginBottom: 8 }]} accessibilityLabel="Search lists" />
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={<Text style={T.small}>No lists yet. Create a run or event first.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => onPick(item.id)} style={s.pickRow}>
            <Cover title={item.title} publisher={item.publisher} width={30} />
            <View style={{ flex: 1, paddingLeft: 12 }}>
              <Text style={T.bodyMedium}>{item.title}</Text>
              <Text style={T.tiny}>{kindLabel(item)}</Text>
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

/** Marks a line optional in this list: shown, not counted, skipped by Up next. */
function OptionalChip({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel="Optional" hitSlop={6} onPress={onPress}
      style={[s.optChip, on ? { backgroundColor: C.text, borderColor: C.text } : null]}>
      <Text style={[T.tiny, on ? { color: C.onLight, fontFamily: F.semibold } : null]}>{on ? '✓ Optional' : 'Optional'}</Text>
    </Pressable>
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress} style={s.readRow}>
      <Text style={[T.body, { flex: 1 }]}>{label}</Text>
      <View style={[s.box, on ? { backgroundColor: C.text, borderColor: C.text } : null]}>
        {on ? <Text style={{ color: C.onLight, fontFamily: F.semibold, fontSize: 14 }}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  target: { minHeight: 52, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  segment: { flexDirection: 'row', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 3 },
  segItem: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  paste: { minHeight: 96, backgroundColor: C.sunken, borderWidth: 1, borderColor: C.border, borderRadius: 12, color: '#D8D6D0', fontFamily: Platform.select({ android: 'monospace', default: 'Menlo' }), fontSize: 13, lineHeight: 21, padding: 12, textAlignVertical: 'top' },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
  optChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: C.borderStrong },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  readRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  hit: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.divider },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  lineCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, gap: 8 },
  footer: { padding: 16, paddingTop: 12, backgroundColor: C.bar, borderTopWidth: 1, borderTopColor: C.border },
  pickRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderBottomColor: C.divider },
});
