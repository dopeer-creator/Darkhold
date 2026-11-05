import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef, type MutableRefObject } from 'react';
import { Alert, Animated, Dimensions, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { creditsSummary, splitNames } from '@/domain/credits';
import { collectionStatus, coverFor, entryUnits, headingSections, issueTitle, lastRead, moveUnit, nextUp, progress, READING_KINDS, walk, type Library } from '@/domain/library';
import type { Collection, Entry } from '@/domain/types';
import { deleteCollection, removeEntries, reorderEntries, setIssueStatus, setOptional, updateCollection } from '@/store/repo';
import { useStore } from '@/store/store';
import { BackIcon, ChevronDown, ChevronRight, CloseIcon, GripIcon, MoreIcon, PlusIcon } from '@/ui/icons';
import { Bar, Checkbox, Cover, PrimaryButton, SectionTitle, T } from '@/ui/parts';
import { relativeDay } from '@/ui/format';
import { ConnectionsBlock } from '@/ui/connections';
import { useFillDetails } from '@/ui/use-fill-details';
import { C, F, KIND_COLOR, KIND_LABEL, KIND_NAME, kindLabel, publisherColor, STATUS_LABEL } from '@/ui/theme';

const ROW_LIMIT = 8;

export default function CollectionScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const { lib, act } = useStore();
  const c = lib.collections.get(id);
  const p = progress(lib, id);
  const next = nextUp(lib, id);
  const last = lastRead(lib, id);
  const status = collectionStatus(lib, id);

  const pathOpen = (step: typeof next) => (step ? Object.fromEntries(step.path.slice(1).map((pid) => [pid, true])) : {});
  // Arriving from a Continue button opens the sections down to the next issue and scrolls to it.
  const [open, setOpen] = useState<Record<string, boolean>>(() => (focus === 'next' ? pathOpen(next) : {}));
  const [menu, setMenu] = useState(false);
  const [options, setOptions] = useState(false);
  const [editing, setEditing] = useState(false);
  const fill = useFillDetails();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const contentRef = useRef<ComponentRef<typeof View>>(null);
  const nextRowRef = useRef<ComponentRef<typeof View> | null>(null);
  const pendingScroll = useRef(focus === 'next');
  const scrollY = useRef(0);
  const viewH = useRef(0);
  const contentH = useRef(0);
  const [scrollOn, setScrollOn] = useState(true);
  const scroller: Scroller = {
    setEnabled: setScrollOn,
    scrollBy: (dy) => {
      const y = Math.max(0, Math.min(scrollY.current + dy, contentH.current - viewH.current));
      const applied = y - scrollY.current;
      scrollY.current = y;
      if (applied) scrollRef.current?.scrollTo({ y, animated: false });
      return applied;
    },
  };

  const goToNext = () => {
    if (!next) return;
    setOpen((o) => ({ ...o, ...pathOpen(next) }));
    pendingScroll.current = true;
    onNextRowLayout();
  };

  const onNextRowLayout = () => {
    if (!pendingScroll.current || !nextRowRef.current || !contentRef.current) return;
    pendingScroll.current = false;
    nextRowRef.current.measureLayout(contentRef.current, (_x: number, y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 160), animated: true }));
  };

  if (!c) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
        <Text style={T.body}>This collection was deleted.</Text>
      </SafeAreaView>
    );
  }

  const color = publisherColor(c.publisher);
  const creators = [c.writer, c.artist].filter(Boolean).join(' & ');
  const years = c.start_year ? `${c.start_year}${c.ongoing ? '–present' : c.end_year && c.end_year !== c.start_year ? `–${c.end_year}` : ''}` : c.ongoing ? 'Ongoing' : '';

  const allIssues = [...new Set(walk(lib, c.id).map((st) => st.issueId))];
  const credits = creditsSummary(lib, c.id);
  const optionItems: { label: string; go: () => void; danger?: boolean }[] = [
    { label: 'Fill writer & artist details', go: () => fill.run(allIssues, c.id) },
    { label: 'Mark as read…', go: () => router.push({ pathname: '/mark/[id]', params: { id: c.id } }) },
    { label: 'Edit order', go: () => setEditing(true) },
    { label: c.on_hold ? 'Resume reading' : 'Put on hold', go: () => act((db, l) => updateCollection(db, l, c.id, { on_hold: !c.on_hold })) },
    ...(p.read === 0 || c.planned
      ? [{ label: c.planned ? 'Take off Plan to read' : 'Plan to read', go: () => act((db, l) => updateCollection(db, l, c.id, { planned: !c.planned })) }]
      : []),
    { label: 'Connect to another list or issue…', go: () => router.push({ pathname: '/connect', params: { collection: c.id } }) },
    { label: 'Choose a cover…', go: () => router.push({ pathname: '/covers', params: { collection: c.id } }) },
    { label: 'Edit details, type or label', go: () => router.push(`/new?edit=${c.id}`) },
    { label: 'Delete…', go: () => confirmDelete(c), danger: true },
  ];

  const confirmDelete = (col: Collection) => {
    Alert.alert(`Delete ${col.title}?`, 'Issues you read stay in your history unless you also delete the contents.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete with contents', style: 'destructive', onPress: () => act((db, l) => deleteCollection(db, l, col.id, true)).then(() => router.back()) },
      { text: `Delete ${KIND_NAME[col.kind]} only`, style: 'destructive', onPress: () => act((db, l) => deleteCollection(db, l, col.id, false)).then(() => router.back()) },
    ]);
  };

  const menuItems: { label: string; go: () => void }[] = [
    { label: 'New list inside this one', go: () => router.push(`/new?kind=event&parent=${c.id}`) },
    { label: 'Put an existing list inside', go: () => router.push(`/link?parent=${c.id}`) },
    { label: 'Connect to another list or issue…', go: () => router.push({ pathname: '/connect', params: { collection: c.id } }) },
    { label: 'Add issues', go: () => router.push(`/add-issues?parent=${c.id}`) },
    { label: 'Add a chapter heading', go: () => router.push({ pathname: '/heading', params: { parent: c.id } }) },
  ];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.iconBtn}>
          <BackIcon />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Options" accessibilityState={{ expanded: options }} onPress={() => setOptions((o) => !o)} style={s.iconBtn}>
          <MoreIcon />
        </Pressable>
      </View>
      {options ? (
        <View style={[s.menu, s.optionsMenu]}>
          {optionItems.map((m) => (
            <Pressable key={m.label} onPress={() => { setOptions(false); m.go(); }} style={({ pressed }) => [s.menuItem, pressed ? { backgroundColor: C.border } : null]}>
              <Text style={[T.body, m.danger ? { color: C.danger } : null]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {fill.busy || fill.status ? (
        <View style={s.fillBar}>
          <Text style={[T.tiny, { flex: 1, color: C.muted }]} numberOfLines={2}>{fill.busy ? `Getting details · ${fill.status}` : fill.status}</Text>
          {fill.busy ? (
            <Pressable accessibilityRole="button" onPress={fill.stop} style={{ minHeight: 36, paddingHorizontal: 10, justifyContent: 'center' }}>
              <Text style={[T.small, { color: C.text }]}>Stop</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <ScrollView
        ref={scrollRef}
        scrollEnabled={scrollOn}
        scrollEventThrottle={16}
        onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
        onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => (contentH.current = h)}
        contentContainerStyle={{ paddingBottom: 48 }}>
        <View ref={contentRef} collapsable={false}>
          <View style={s.hero}>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose a cover" onPress={() => router.push({ pathname: '/covers', params: { collection: c.id } })}>
              <Cover title={c.title} publisher={c.publisher} width={108} uri={coverFor(lib, c.id)} />
              <Text style={[T.tiny, { textAlign: 'center', marginTop: 4, fontSize: 11 }]}>Change cover</Text>
            </Pressable>
            <View style={{ flex: 1, gap: 6, paddingTop: 4 }}>
              <Text style={[T.label, { color }]}>{kindLabel(c)}{c.publisher ? ` · ${c.publisher.toUpperCase()}` : ''}</Text>
              <Text style={s.title}>{c.title}</Text>
              {creators || years ? <Text style={T.small}>{[creators, years].filter(Boolean).join(' · ')}</Text> : null}
              {!creators && credits.mainWriters.length ? <Text style={T.small}>{credits.mainWriters.join(', ')}</Text> : null}
              {credits.fillIns.length ? (
                <Text style={T.tiny} numberOfLines={2}>
                  Fill-ins: {credits.fillIns.slice(0, 3).map((f) => `${f.writers.join(', ')} (#${lib.issues.get(f.issueId)?.number ?? '?'})`).join(' · ')}
                  {credits.fillIns.length > 3 ? ` · +${credits.fillIns.length - 3} more` : ''}
                </Text>
              ) : null}
              <View style={s.pill}><Text style={[T.tiny, { color: C.text }]}>{STATUS_LABEL[status]}</Text></View>
            </View>
          </View>
          {c.description ? <Text style={[T.small, { paddingHorizontal: 16, paddingTop: 12, lineHeight: 20 }]}>{c.description}</Text> : null}
          <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={T.num}>
                <Text style={{ fontFamily: F.cond, fontSize: 26, color: C.text }}>{p.read}</Text>
                <Text style={T.small}> / {p.total} read</Text>
              </Text>
              <Text style={[T.small, T.num]}>{p.left} left · {p.total ? Math.round((p.read / p.total) * 100) : 0}%</Text>
            </View>
            <View style={{ marginTop: 8 }}><Bar read={p.read} total={p.total} color={color} height={6} /></View>
            {next ? (
              <PrimaryButton label={`Continue · ${issueTitle(lib, next.issueId)}`} icon="play" onPress={goToNext} style={{ marginTop: 14 }} />
            ) : (
              <PrimaryButton label={p.total ? 'All read — add more issues' : 'Add issues to start'} onPress={() => setMenu(true)} style={{ marginTop: 14 }} />
            )}
            {last ? <Text style={[T.tiny, { textAlign: 'center', marginTop: 8 }]}>Last read: {issueTitle(lib, last.issueId)}</Text> : null}
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
            <ConnectionsBlock collectionId={c.id} />
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
            <SectionTitle
              right={
                editing ? (
                  <Pressable accessibilityRole="button" onPress={() => setEditing(false)} style={s.doneBtn}>
                    <Text style={[T.small, { color: C.onLight, fontFamily: F.semibold }]}>Done</Text>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {(lib.children.get(c.id) ?? []).length > 1 ? (
                      <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}>
                        <Text style={T.small}>Edit order</Text>
                      </Pressable>
                    ) : null}
                    <Pressable accessibilityRole="button" accessibilityLabel="Add to this collection" accessibilityState={{ expanded: menu }} onPress={() => setMenu((m) => !m)} style={s.addBtn}>
                      <PlusIcon size={20} width={2} />
                    </Pressable>
                  </View>
                )
              }>
              {READING_KINDS.includes(c.kind) ? 'Reading path' : 'Reading order'}
            </SectionTitle>
            {menu ? (
              <View style={s.menu}>
                {menuItems.map((m) => (
                  <Pressable key={m.label} onPress={() => { setMenu(false); m.go(); }} style={({ pressed }) => [s.menuItem, pressed ? { backgroundColor: C.border } : null]}>
                    <Text style={T.body}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={{ gap: 10, marginTop: 10 }}>
              {editing ? (
                <ReorderList
                  lib={lib}
                  parentId={c.id}
                  scroller={scroller}
                  onMove={(ids) => act((db, l) => reorderEntries(db, l, c.id, ids))}
                  onOptional={(ids, optional) => act((db, l) => setOptional(db, l, c.id, ids, optional))}
                  onRemove={(ids, label) =>
                    Alert.alert(`Remove ${label}?`, 'Only from this list. The issues stay in your library and anywhere else they appear.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => act((db) => removeEntries(db, ids)) },
                    ])
                  }
                />
              ) : (lib.children.get(c.id) ?? []).length === 0 ? (
                <Text style={[T.small, { paddingVertical: 16 }]}>Nothing here yet. Tap ＋ to add {c.kind === 'event' ? 'issues' : 'events or issues'}.</Text>
              ) : (
                <EntryList
                  lib={lib}
                  parentId={c.id}
                  nextIssueId={next?.issueId}
                  mainWriters={credits.mainWriters}
                  open={open}
                  setOpen={setOpen}
                  nextRowRef={nextRowRef}
                  onNextRowLayout={onNextRowLayout}
                  onToggle={(issueId, read) => act((db, l) => setIssueStatus(db, l, issueId, read ? 'unread' : 'read'))}
                  onIssueMenu={(entry) => router.push({ pathname: '/issue/[id]', params: { id: entry.child_issue_id!, entry: entry.id, parent: entry.parent_id } })}
                />
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type ListProps = {
  lib: Library;
  parentId: string;
  nextIssueId?: string;
  open: Record<string, boolean>;
  setOpen: (fn: (o: Record<string, boolean>) => Record<string, boolean>) => void;
  nextRowRef: MutableRefObject<ComponentRef<typeof View> | null>;
  onNextRowLayout: () => void;
  onToggle: (issueId: string, read: boolean) => void;
  onIssueMenu: (entry: Entry) => void;
  /** The run's regular writers; issues by someone else show who wrote them. */
  mainWriters?: string[];
};

type Row =
  | { kind: 'issue'; entry: Entry }
  | { kind: 'group'; key: string; label: string; count: number }
  | { kind: 'collection'; entry: Entry }
  | { kind: 'slice'; key: string; via: string | null; entries: Entry[]; continued: boolean }
  | { kind: 'heading'; entry: Entry };

/**
 * Issues and inner collections in order. Three or more read issues of one series in a row fold into one line.
 * In a crisis, issues that are slices of a run or event sit in labelled blocks ("RUN · Captain America … (continued)").
 */
function EntryList(props: ListProps) {
  const { lib, parentId, nextIssueId, open, setOpen } = props;
  // "Show all" opens everything in this block at once: the hidden rest and every folded run of read issues.
  const [showAll, setShowAll] = useState(false);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const entries = lib.children.get(parentId) ?? [];
  const viaOf = (e: Entry) => e.part_of ?? null;
  const hasSlices = entries.some((e) => viaOf(e));

  const rows: Row[] = [];
  const sectionOf = new Map<Row, string>();
  const seenVia = new Set<string>();
  let section = '';
  for (let i = 0; i < entries.length; ) {
    const e = entries[i];
    if (e.heading) {
      section = e.id;
      rows.push({ kind: 'heading', entry: e });
      i++;
      continue;
    }
    const via = viaOf(e);
    const before = rows.length;
    const mark = () => rows.slice(before).forEach((r) => sectionOf.set(r, section));
    if (hasSlices && e.child_issue_id) {
      let j = i;
      while (j < entries.length && entries[j].child_issue_id && viaOf(entries[j]) === via) j++;
      let end = i;
      while (end < j && !entries[end].heading) end++;
      rows.push({ kind: 'slice', key: `slice:${e.id}`, via, entries: entries.slice(i, end), continued: !!via && seenVia.has(via) });
      if (via) seenVia.add(via);
      mark();
      i = end;
      continue;
    }
    const issue = e.child_issue_id ? lib.issues.get(e.child_issue_id) : undefined;
    if (issue?.status === 'read') {
      let j = i;
      while (j < entries.length) {
        const o = entries[j].child_issue_id ? lib.issues.get(entries[j].child_issue_id!) : undefined;
        if (!o || o.status !== 'read' || o.series_id !== issue.series_id) break;
        j++;
      }
      const key = `${parentId}:${e.id}`;
      if (j - i >= 3 && !showAll) {
        const lastIssue = lib.issues.get(entries[j - 1].child_issue_id!)!;
        rows.push({ kind: 'group', key, label: `${issueTitle(lib, issue.id)}–${lastIssue.number ?? ''}`, count: j - i });
        mark();
        i = j;
        continue;
      }
    }
    if (e.child_issue_id && issue) rows.push({ kind: 'issue', entry: e });
    else if (e.child_collection_id && lib.collections.has(e.child_collection_id)) rows.push({ kind: 'collection', entry: e });
    mark();
    i++;
  }

  // Chapter headings fold their section. The section holding the next issue starts open, others closed.
  const sections = headingSections(lib, parentId);
  const nextSection = [...sections.entries()].find(([, sec]) => !!nextIssueId && sec.issueIds.has(nextIssueId))?.[0];
  const isFolded = (id: string) => folded[id] ?? (!!nextSection && id !== nextSection);
  const inView = rows.filter((r) => r.kind === 'heading' || !sectionOf.get(r) || !isFolded(sectionOf.get(r)!));

  // Long issue lists are cut short (blocks, events and runs always show), keeping the next issue in view.
  const issueRows = inView.filter((r) => r.kind === 'issue' || r.kind === 'group');
  const nextIndex = issueRows.findIndex((r) => r.kind === 'issue' && r.entry.child_issue_id === nextIssueId);
  const limit = Math.max(ROW_LIMIT, nextIndex + 4);
  let shown = 0;
  const visible = showAll ? inView : inView.filter((r) => (r.kind !== 'issue' && r.kind !== 'group') || ++shown <= limit);
  const hidden = inView.length - visible.length;

  const renderIssue = (entry: Entry) => {
    const issue = lib.issues.get(entry.child_issue_id!);
    if (!issue) return null;
    const read = issue.status === 'read';
    const isNext = issue.id === nextIssueId;
    return (
      <Pressable
        key={entry.id}
        ref={isNext ? props.nextRowRef : undefined}
        onLayout={isNext ? props.onNextRowLayout : undefined}
        onPress={() => props.onIssueMenu(entry)}
        onLongPress={() => props.onIssueMenu(entry)}
        style={s.issueRow}>
        <View style={{ flex: 1, paddingVertical: 8 }}>
          <Text style={[T.body, { fontSize: 14, color: read ? C.muted : C.text }]}>{issueTitle(lib, issue.id)}</Text>
          {isNext ? <Text style={[T.label, { color: C.dc, marginTop: 2 }]}>{issue.status === 'reading' ? 'READING NOW' : 'NEXT UP'}</Text> : null}
          {entry.optional ? <Text style={[T.label, { color: C.dim, marginTop: 2, fontSize: 10 }]}>OPTIONAL · NOT COUNTED</Text> : null}
          {read && issue.completed_at ? <Text style={[T.tiny, { fontSize: 11, marginTop: 2 }]}>Read {relativeDay(issue.completed_at)}</Text> : null}
          {issue.notes && !read && !/^optional$/i.test(issue.notes.trim()) ? <Text style={[T.tiny, { fontSize: 11, marginTop: 2 }]}>{issue.notes}</Text> : null}
          {issue.writers && props.mainWriters?.length && !splitNames(issue.writers).some((w) => props.mainWriters!.includes(w)) ? (
            <Text style={[T.tiny, { fontSize: 11, marginTop: 2, color: C.indie }]}>Written by {issue.writers}</Text>
          ) : null}
        </View>
        <Checkbox checked={read} label={`${read ? 'Mark unread' : 'Mark read'}: ${issueTitle(lib, issue.id)}`} onPress={() => props.onToggle(issue.id, read)} />
      </Pressable>
    );
  };

  const header = (o: { label: string; color: string; title: string; suffix?: string; read: number; total: number; isOpen: boolean; bar: string; onPress: () => void; onLongPress?: () => void }) => (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: o.isOpen }} onPress={o.onPress} onLongPress={o.onLongPress} style={{ padding: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {o.isOpen ? <ChevronDown /> : <ChevronRight />}
        <View style={{ flex: 1 }}>
          <Text style={[T.label, { fontSize: 10, color: o.color }]}>{o.label}</Text>
          <Text style={[T.bodyMedium, { lineHeight: 19 }]}>
            {o.title}
            {o.suffix ? <Text style={T.small}> {o.suffix}</Text> : null}
          </Text>
        </View>
        <Text style={[T.small, T.num]}>{o.total ? `${o.read} / ${o.total}` : 'Empty'}</Text>
      </View>
      <Bar read={o.read} total={o.total} color={o.bar} height={3} />
    </Pressable>
  );

  return (
    <View style={{ gap: rows.some((r) => r.kind === 'collection' || r.kind === 'slice' || r.kind === 'heading') ? 10 : 0 }}>
      {visible.map((r) => {
        if (r.kind === 'heading') {
          const sec = sections.get(r.entry.id);
          const isOpen = !isFolded(r.entry.id);
          return (
            <Pressable
              key={r.entry.id}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              onPress={() => setFolded((f) => ({ ...f, [r.entry.id]: isOpen }))}
              style={s.heading}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {isOpen ? <ChevronDown color={C.text} /> : <ChevronRight color={C.text} />}
                <Text style={s.headingText} numberOfLines={2}>{r.entry.heading}</Text>
                {sec?.total ? <Text style={[T.small, T.num]}>{sec.read} / {sec.total}</Text> : null}
              </View>
              {r.entry.note ? <Text style={[T.tiny, { marginLeft: 24 }]}>{r.entry.note}</Text> : null}
              {sec?.total ? (
                <View style={{ marginLeft: 24 }}>
                  <Bar read={sec.read} total={sec.total} color={C.text} height={2} />
                </View>
              ) : null}
            </Pressable>
          );
        }
        if (r.kind === 'group') {
          return (
            <Pressable key={r.key} accessibilityRole="button" onPress={() => setShowAll(true)} style={s.group}>
              <Text style={T.small}>{r.label}</Text>
              <Text style={T.tiny}>{r.count} read · show all</Text>
            </Pressable>
          );
        }
        if (r.kind === 'issue') return renderIssue(r.entry);
        if (r.kind === 'slice') {
          const via = r.via ? lib.collections.get(r.via)! : null;
          const ids = r.entries.map((e) => e.child_issue_id!);
          // Optional lines show, but the block's count leaves them out (unless the whole block is optional).
          const counted = r.entries.every((e) => e.optional) ? ids : r.entries.filter((e) => !e.optional).map((e) => e.child_issue_id!);
          const read = counted.filter((id) => lib.issues.get(id)?.status === 'read').length;
          const hasNext = !!nextIssueId && ids.includes(nextIssueId);
          const isOpen = open[r.key] ?? hasNext;
          const kind = via?.kind ?? 'issue';
          const optional = r.entries.every((e) => e.optional);
          return (
            <View key={r.key} style={s.card}>
              {header({
                label: `${via ? kindLabel(via) : 'ISSUES'}${optional ? ' · OPTIONAL' : ''}${read === counted.length ? ' · DONE' : hasNext ? ' · UP NEXT' : ''}`,
                color: KIND_COLOR[kind],
                title: via ? via.title : ids.length === 1 ? issueTitle(lib, ids[0]) : `${ids.length} single issues`,
                suffix: r.continued ? '(continued)' : undefined,
                read,
                total: counted.length,
                isOpen,
                bar: KIND_COLOR[kind],
                onPress: () => setOpen((o) => ({ ...o, [r.key]: !isOpen })),
                onLongPress: via ? () => router.push(`/collection/${via.id}`) : undefined,
              })}
              {isOpen ? (
                <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingLeft: 14 }}>
                  {r.entries.map(renderIssue)}
                  {via ? (
                    <Pressable onPress={() => router.push(`/collection/${via.id}`)} style={{ paddingVertical: 12, alignItems: 'center' }}>
                      <Text style={T.small}>Open all of {via.title}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        }
        const child = lib.collections.get(r.entry.child_collection_id!)!;
        const cp = progress(lib, child.id);
        const isOpen = !!open[child.id];
        const done = collectionStatus(lib, child.id) === 'completed';
        return (
          <View key={r.entry.id} style={s.card}>
            {header({
              label: `${kindLabel(child)}${r.entry.optional ? ' · OPTIONAL' : ''}${done ? ' · DONE' : ''}`,
              color: KIND_COLOR[child.kind],
              title: child.title,
              read: cp.read,
              total: cp.total,
              isOpen,
              bar: publisherColor(child.publisher),
              onPress: () => setOpen((o) => ({ ...o, [child.id]: !isOpen })),
              onLongPress: () => router.push(`/collection/${child.id}`),
            })}
            {isOpen ? (
              <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingLeft: child.kind === 'event' ? 14 : 10, paddingRight: child.kind === 'event' ? 0 : 10, paddingVertical: child.kind === 'event' ? 0 : 10 }}>
                {(lib.children.get(child.id) ?? []).length ? <EntryList {...props} parentId={child.id} /> : <Text style={[T.small, { padding: 12 }]}>No issues yet.</Text>}
                <Pressable onPress={() => router.push(`/collection/${child.id}`)} style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={T.small}>Open {child.title}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
      {hidden > 0 || rows.some((r) => r.kind === 'group') ? (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={s.showAll}>
          <Text style={[T.small, { color: C.text }]}>Show all{hidden > 0 ? ` · ${hidden} more` : ''}</Text>
        </Pressable>
      ) : showAll && inView.length > ROW_LIMIT ? (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(false)} style={s.showAll}>
          <Text style={T.small}>Show less</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Lets the reorder list stop the page from scrolling under a drag, and scroll it near the edges. */
type Scroller = { setEnabled: (on: boolean) => void; scrollBy: (dy: number) => number };

/** Within this many pixels of the top or bottom of the screen, a dragged piece scrolls the page. */
const EDGE = 110;
const MAX_SPEED = 28;

/**
 * "Edit order": hold a piece by its grip and drag it where it goes; near the top or bottom of the screen the
 * page scrolls along. Or tap a piece to pick it up, then send it to the top, the bottom, or tap "Place here".
 * A slice block moves as one piece.
 */
function ReorderList({ lib, parentId, scroller, onMove, onRemove, onOptional }: { lib: Library; parentId: string; scroller: Scroller; onMove: (ids: string[]) => void; onRemove: (ids: string[], label: string) => void; onOptional: (ids: string[], optional: boolean) => void }) {
  const canGroup = lib.collections.get(parentId)?.kind !== 'event';
  const [picked, setPicked] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; lineY: number | null } | null>(null);
  const [lift] = useState(() => new Animated.Value(0));
  const layouts = useRef<{ y: number; h: number }[]>([]);
  const live = useRef({ from: -1, to: -1, dy: 0, scrolled: 0, pageY: 0, frame: 0 });
  const units = entryUnits(lib, parentId);

  const labelOf = (i: number) => {
    const u = units[i];
    const first = lib.children.get(parentId)?.find((e) => e.id === u.entryIds[0]);
    if (u.kind === 'heading') {
      return { tag: KIND_LABEL.heading, color: KIND_COLOR.heading, title: first?.heading ?? '', sub: first?.note ?? '' };
    }
    if (u.kind === 'collection') {
      const col = lib.collections.get(u.collectionId!)!;
      return { tag: kindLabel(col), color: KIND_COLOR[col.kind], title: col.title, sub: '' };
    }
    const issues = u.entryIds.map((eid) => lib.children.get(parentId)?.find((e) => e.id === eid)?.child_issue_id).filter(Boolean) as string[];
    const span = issues.length > 1 ? `${issueTitle(lib, issues[0])} – #${lib.issues.get(issues[issues.length - 1])?.number ?? ''}` : issueTitle(lib, first?.child_issue_id ?? '');
    if (u.kind === 'slice') {
      const col = lib.collections.get(u.collectionId!)!;
      return { tag: kindLabel(col), color: KIND_COLOR[col.kind], title: col.title, sub: `${span} · ${issues.length} issue${issues.length === 1 ? '' : 's'}` };
    }
    return { tag: 'ISSUE', color: KIND_COLOR.issue, title: span, sub: '' };
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= units.length || from === to) return;
    onMove(moveUnit(units, from, to));
  };
  /** Place the picked piece just before position `slot` (units.length = at the end). */
  const place = (slot: number) => {
    if (picked == null) return;
    move(picked, slot > picked ? slot - 1 : slot);
    setPicked(null);
  };
  const target = (slot: number) =>
    picked != null && slot !== picked && slot !== picked + 1 ? (
      <Pressable key={`slot-${slot}`} accessibilityRole="button" onPress={() => place(slot)} style={s.placeHere}>
        <Text style={[T.small, { color: C.dc }]}>Place here</Text>
      </Pressable>
    ) : null;

  // ── Dragging ──
  /** Where the dragged piece would land: the number of other pieces whose middle is above its middle. */
  const follow = () => {
    const d = live.current;
    const L = layouts.current;
    const own = L[d.from];
    if (!own) return;
    lift.setValue(d.dy + d.scrolled);
    const mid = own.y + own.h / 2 + d.dy + d.scrolled;
    let to = 0;
    for (let i = 0; i < units.length; i++) {
      const l = L[i];
      if (i !== d.from && l && l.y + l.h / 2 < mid) to++;
    }
    if (to !== d.to) {
      d.to = to;
      // The blue line shows where the piece will land.
      const slot = to < d.from ? to : to + 1;
      const last = L[units.length - 1];
      const lineY = to === d.from ? null : slot < units.length && L[slot] ? L[slot].y - 5 : last ? last.y + last.h + 2 : null;
      setDrag({ from: d.from, to, lineY });
    }
  };
  const tick = () => {
    const d = live.current;
    if (d.from < 0) return;
    const screen = Dimensions.get('window').height;
    const speed =
      d.pageY < EDGE ? -Math.min(MAX_SPEED, (EDGE - d.pageY) / 3) : d.pageY > screen - EDGE ? Math.min(MAX_SPEED, (d.pageY - (screen - EDGE)) / 3) : 0;
    if (speed) {
      d.scrolled += scroller.scrollBy(speed);
      follow();
    }
    d.frame = requestAnimationFrame(tick);
  };
  const dragStart = (i: number, pageY: number) => {
    setPicked(null);
    live.current = { from: i, to: i, dy: 0, scrolled: 0, pageY, frame: 0 };
    lift.setValue(0);
    setDrag({ from: i, to: i, lineY: null });
    scroller.setEnabled(false);
    live.current.frame = requestAnimationFrame(tick);
  };
  const dragMove = (dy: number, pageY: number) => {
    live.current.dy = dy;
    live.current.pageY = pageY;
    follow();
  };
  const dragEnd = () => {
    const d = live.current;
    cancelAnimationFrame(d.frame);
    scroller.setEnabled(true);
    const { from, to } = d;
    live.current = { ...d, from: -1 };
    lift.setValue(0);
    setDrag(null);
    if (from >= 0) move(from, to);
  };
  useEffect(() => {
    const d = live.current;
    return () => cancelAnimationFrame(d.frame);
  }, []);

  return (
    <View style={{ gap: 8 }}>
      <Text style={T.tiny}>
        {picked == null
          ? `Hold the dots and drag a piece where it goes. Near the top or bottom of the screen the list scrolls with you. Or tap a piece to send it to the top or bottom.${canGroup ? ' “Part of…” labels issues as a run’s or event’s part.' : ''}`
          : 'Send it to the top or bottom, make it optional (shown but not counted), or tap “Place here” where it should go. Tap it again to cancel.'}
      </Text>
      <View style={{ gap: 8 }}>
        {units.map((u, i) => {
          const l = labelOf(i);
          const isPicked = picked === i;
          const isDragged = drag?.from === i;
          const lines = (lib.children.get(parentId) ?? []).filter((e) => u.entryIds.includes(e.id));
          const isOptional = u.kind !== 'heading' && lines.length > 0 && lines.every((e) => e.optional);
          return (
            <Animated.View
              key={u.key}
              onLayout={(e) => (layouts.current[i] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}
              style={[{ gap: 8 }, isDragged ? { zIndex: 10, elevation: 10, transform: [{ translateY: lift }] } : null]}>
              {target(i)}
              <View style={[s.reorderRow, isPicked || isDragged ? { borderColor: C.dc, backgroundColor: '#16223A' } : null]}>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: isPicked }} onPress={() => setPicked(isPicked ? null : i)} style={{ flex: 1, paddingVertical: 10 }}>
                  <Text style={[T.label, { fontSize: 10, color: l.color }]}>{l.tag}{isOptional ? ' · OPTIONAL' : ''}</Text>
                  <Text style={T.bodyMedium} numberOfLines={1}>{l.title}</Text>
                  {l.sub ? <Text style={T.tiny} numberOfLines={1}>{l.sub}</Text> : null}
                </Pressable>
                {u.kind === 'heading' ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Rename ${l.title}`} onPress={() => router.push({ pathname: '/heading', params: { parent: parentId, entry: u.entryIds[0] } })} style={s.partBtn}>
                    <Text style={[T.tiny, { color: C.text }]}>Rename</Text>
                  </Pressable>
                ) : canGroup && u.kind !== 'collection' ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${l.title} as part of a run or event`} onPress={() => router.push({ pathname: '/part-of', params: { parent: parentId, entries: u.entryIds.join(',') } })} style={s.partBtn}>
                    <Text style={[T.tiny, { color: C.text }]}>Part of…</Text>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${l.title} from this list`} onPress={() => onRemove(u.entryIds, l.title)} style={s.arrow}>
                  <CloseIcon size={18} color={C.dim} />
                </Pressable>
                <DragHandle label={`Drag ${l.title}`} onStart={(y) => dragStart(i, y)} onMove={dragMove} onEnd={dragEnd} />
              </View>
              {isPicked ? (
                <View style={s.pickedActions}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Move ${l.title} to the top`} disabled={i === 0} onPress={() => { move(i, 0); setPicked(null); }} style={[s.pickBtn, i === 0 ? { opacity: 0.3 } : null]}>
                      <Text style={[T.tiny, { color: C.text }]}>Top</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Move ${l.title} to the bottom`} disabled={i === units.length - 1} onPress={() => { move(i, units.length - 1); setPicked(null); }} style={[s.pickBtn, i === units.length - 1 ? { opacity: 0.3 } : null]}>
                      <Text style={[T.tiny, { color: C.text }]}>Bottom</Text>
                    </Pressable>
                    {u.kind !== 'heading' ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={isOptional ? `Count ${l.title} again` : `Make ${l.title} optional`} onPress={() => { onOptional(u.entryIds, !isOptional); setPicked(null); }} style={s.pickBtn}>
                        <Text style={[T.tiny, { color: C.text }]}>{isOptional ? 'Count it' : 'Optional'}</Text>
                      </Pressable>
                    ) : null}
                </View>
              ) : null}
            </Animated.View>
          );
        })}
        {target(units.length)}
        {drag?.lineY != null ? <View pointerEvents="none" style={[s.dropLine, { top: drag.lineY }]} /> : null}
      </View>
    </View>
  );
}

/** The dots at the end of a row: press and drag them to move the row. */
function DragHandle({ label, onStart, onMove, onEnd }: { label: string; onStart: (pageY: number) => void; onMove: (dy: number, pageY: number) => void; onEnd: () => void }) {
  const latest = useRef({ onStart, onMove, onEnd });
  useEffect(() => {
    latest.current = { onStart, onMove, onEnd };
  });
  // The handlers read `latest` only while a finger is down, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => latest.current.onStart(e.nativeEvent.pageY),
      onPanResponderMove: (_e, g) => latest.current.onMove(g.dy, g.moveY),
      onPanResponderRelease: () => latest.current.onEnd(),
      onPanResponderTerminate: () => latest.current.onEnd(),
    }),
  );
  return (
    <View {...responder.panHandlers} accessibilityLabel={label} style={s.grip}>
      <GripIcon />
    </View>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingTop: 4 },
  title: { fontFamily: F.condBold, fontSize: 30, lineHeight: 31, color: C.text },
  pill: { alignSelf: 'flex-start', marginTop: 4, height: 26, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: C.borderStrong, justifyContent: 'center' },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  menu: { marginTop: 8, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 12, padding: 6 },
  optionsMenu: { position: 'absolute', top: 52, right: 12, zIndex: 10, minWidth: 220, marginTop: 0, elevation: 6 },
  doneBtn: { height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: C.text, justifyContent: 'center' },
  reorderRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 56, paddingLeft: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  fillBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  heading: { paddingTop: 10, paddingBottom: 4, gap: 6 },
  headingText: { flex: 1, fontFamily: F.condBold, fontSize: 18, letterSpacing: 0.6, textTransform: 'uppercase', color: C.text },
  partBtn: { height: 32, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: C.borderStrong, justifyContent: 'center', marginRight: 2 },
  arrow: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  pickedActions: { flexDirection: 'row', gap: 8, marginTop: -2 },
  pickBtn: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: C.dc, backgroundColor: '#16223A', alignItems: 'center', justifyContent: 'center' },
  grip: { width: 48, height: 56, alignItems: 'center', justifyContent: 'center' },
  dropLine: { position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 2, backgroundColor: C.dc },
  showAll: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  placeHere: { height: 40, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.dc, alignItems: 'center', justifyContent: 'center' },
  menuItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  group: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 14, borderBottomWidth: 1, borderBottomColor: C.divider },
  issueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, borderBottomWidth: 1, borderBottomColor: C.divider },
});
