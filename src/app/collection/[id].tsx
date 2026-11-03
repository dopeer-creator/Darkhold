import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef, type MutableRefObject } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { collectionStatus, issueTitle, lastRead, nextUp, progress, type Library } from '@/domain/library';
import type { Collection, Entry } from '@/domain/types';
import { deleteCollection, removeEntry, setIssueStatus, updateCollection } from '@/store/repo';
import { useStore } from '@/store/store';
import { BackIcon, ChevronDown, ChevronRight, MoreIcon, PlusIcon } from '@/ui/icons';
import { Bar, Checkbox, Cover, PrimaryButton, SectionTitle, T } from '@/ui/parts';
import { relativeDay } from '@/ui/format';
import { C, F, KIND_LABEL, publisherColor, STATUS_LABEL } from '@/ui/theme';

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
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const contentRef = useRef<ComponentRef<typeof View>>(null);
  const nextRowRef = useRef<ComponentRef<typeof View> | null>(null);
  const pendingScroll = useRef(focus === 'next');

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
  const years = c.start_year ? `${c.start_year}${c.end_year && c.end_year !== c.start_year ? `–${c.end_year}` : ''}` : '';

  const showOptions = () => {
    Alert.alert(c.title, undefined, [
      {
        text: c.on_hold ? 'Resume reading' : 'Put on hold',
        onPress: () => act((db, l) => updateCollection(db, l, c.id, { on_hold: !c.on_hold })),
      },
      { text: 'Edit details', onPress: () => router.push(`/new?edit=${c.id}`) },
      { text: 'Delete…', style: 'destructive', onPress: () => confirmDelete(c) },
    ]);
  };

  const confirmDelete = (col: Collection) => {
    Alert.alert(`Delete ${col.title}?`, 'Issues you read stay in your history unless you also delete the contents.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete with contents', style: 'destructive', onPress: () => act((db, l) => deleteCollection(db, l, col.id, true)).then(() => router.back()) },
      { text: `Delete ${KIND_LABEL[col.kind].toLowerCase()} only`, style: 'destructive', onPress: () => act((db, l) => deleteCollection(db, l, col.id, false)).then(() => router.back()) },
    ]);
  };

  const menuItems: { label: string; go: () => void }[] = [
    ...(c.kind === 'crisis' ? [{ label: 'New run in this crisis', go: () => router.push(`/new?kind=run&parent=${c.id}`) }] : []),
    ...(c.kind !== 'event' ? [{ label: `New event in this ${c.kind}`, go: () => router.push(`/new?kind=event&parent=${c.id}`) }] : []),
    ...(c.kind !== 'event' ? [{ label: c.kind === 'crisis' ? 'Link an existing run or event' : 'Link an existing event', go: () => router.push(`/link?parent=${c.id}`) }] : []),
    { label: 'Add issues', go: () => router.push(`/add-issues?parent=${c.id}`) },
  ];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.iconBtn}>
          <BackIcon />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Options" onPress={showOptions} style={s.iconBtn}>
          <MoreIcon />
        </Pressable>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 48 }}>
        <View ref={contentRef} collapsable={false}>
          <View style={s.hero}>
            <Cover title={c.title} publisher={c.publisher} width={108} />
            <View style={{ flex: 1, gap: 6, paddingTop: 4 }}>
              <Text style={[T.label, { color }]}>{KIND_LABEL[c.kind]}{c.publisher ? ` · ${c.publisher.toUpperCase()}` : ''}</Text>
              <Text style={s.title}>{c.title}</Text>
              {creators || years ? <Text style={T.small}>{[creators, years].filter(Boolean).join(' · ')}</Text> : null}
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
            <SectionTitle
              right={
                <Pressable accessibilityRole="button" accessibilityLabel="Add to this collection" accessibilityState={{ expanded: menu }} onPress={() => setMenu((m) => !m)} style={s.addBtn}>
                  <PlusIcon size={20} width={2} />
                </Pressable>
              }>
              {c.kind === 'crisis' ? 'Reading path' : 'Reading order'}
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
              {(lib.children.get(c.id) ?? []).length === 0 ? (
                <Text style={[T.small, { paddingVertical: 16 }]}>Nothing here yet. Tap ＋ to add {c.kind === 'event' ? 'issues' : 'events or issues'}.</Text>
              ) : (
                <EntryList
                  lib={lib}
                  parentId={c.id}
                  nextIssueId={next?.issueId}
                  open={open}
                  setOpen={setOpen}
                  nextRowRef={nextRowRef}
                  onNextRowLayout={onNextRowLayout}
                  onToggle={(issueId, read) => act((db, l) => setIssueStatus(db, l, issueId, read ? 'unread' : 'read'))}
                  onIssueMenu={(entry) => issueMenu(entry)}
                />
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  function issueMenu(entry: Entry) {
    const issue = lib.issues.get(entry.child_issue_id!);
    if (!issue) return;
    Alert.alert(issueTitle(lib, issue.id), issue.completed_at ? `Read ${relativeDay(issue.completed_at)}` : undefined, [
      {
        text: issue.status === 'reading' ? 'Not currently reading' : 'Mark currently reading',
        onPress: () => act((db, l) => setIssueStatus(db, l, issue.id, issue.status === 'reading' ? 'unread' : 'reading')),
      },
      { text: 'Remove from this list', style: 'destructive', onPress: () => act((db) => removeEntry(db, entry.id)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
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
};

type Row =
  | { kind: 'issue'; entry: Entry }
  | { kind: 'group'; key: string; label: string; count: number }
  | { kind: 'collection'; entry: Entry };

/** Issues and inner collections in order. Three or more read issues of one series in a row fold into one line. */
function EntryList(props: ListProps) {
  const { lib, parentId, nextIssueId, open, setOpen } = props;
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState(false);
  const entries = lib.children.get(parentId) ?? [];

  const rows: Row[] = [];
  for (let i = 0; i < entries.length; ) {
    const e = entries[i];
    const issue = e.child_issue_id ? lib.issues.get(e.child_issue_id) : undefined;
    if (issue?.status === 'read') {
      let j = i;
      while (j < entries.length) {
        const o = entries[j].child_issue_id ? lib.issues.get(entries[j].child_issue_id!) : undefined;
        if (!o || o.status !== 'read' || o.series_id !== issue.series_id) break;
        j++;
      }
      const key = `${parentId}:${e.id}`;
      if (j - i >= 3 && !unfolded[key]) {
        const lastIssue = lib.issues.get(entries[j - 1].child_issue_id!)!;
        rows.push({ kind: 'group', key, label: `${issueTitle(lib, issue.id)}–${lastIssue.number ?? ''}`, count: j - i });
        i = j;
        continue;
      }
    }
    if (e.child_issue_id && issue) rows.push({ kind: 'issue', entry: e });
    else if (e.child_collection_id && lib.collections.has(e.child_collection_id)) rows.push({ kind: 'collection', entry: e });
    i++;
  }

  // Long issue lists are cut short (events and runs always show), keeping the next issue in view.
  const issueRows = rows.filter((r) => r.kind !== 'collection');
  const nextIndex = issueRows.findIndex((r) => r.kind === 'issue' && r.entry.child_issue_id === nextIssueId);
  const limit = Math.max(ROW_LIMIT, nextIndex + 4);
  let shown = 0;
  const visible = showAll ? rows : rows.filter((r) => r.kind === 'collection' || ++shown <= limit);
  const hidden = rows.length - visible.length;

  return (
    <View style={{ gap: rows.some((r) => r.kind === 'collection') ? 10 : 0 }}>
      {visible.map((r) => {
        if (r.kind === 'group') {
          return (
            <Pressable key={r.key} onPress={() => setUnfolded((u) => ({ ...u, [r.key]: true }))} style={s.group}>
              <Text style={T.small}>{r.label}</Text>
              <Text style={T.tiny}>{r.count} read · show</Text>
            </Pressable>
          );
        }
        if (r.kind === 'issue') {
          const issue = lib.issues.get(r.entry.child_issue_id!)!;
          const read = issue.status === 'read';
          const isNext = issue.id === nextIssueId;
          return (
            <Pressable
              key={r.entry.id}
              ref={isNext ? props.nextRowRef : undefined}
              onLayout={isNext ? props.onNextRowLayout : undefined}
              onLongPress={() => props.onIssueMenu(r.entry)}
              style={s.issueRow}>
              <View style={{ flex: 1, paddingVertical: 8 }}>
                <Text style={[T.body, { fontSize: 14, color: read ? C.muted : C.text }]}>{issueTitle(lib, issue.id)}</Text>
                {isNext ? <Text style={[T.label, { color: C.dc, marginTop: 2 }]}>{issue.status === 'reading' ? 'READING NOW' : 'NEXT UP'}</Text> : null}
                {read && issue.completed_at ? <Text style={[T.tiny, { fontSize: 11, marginTop: 2 }]}>Read {relativeDay(issue.completed_at)}</Text> : null}
              </View>
              <Checkbox checked={read} label={`${read ? 'Mark unread' : 'Mark read'}: ${issueTitle(lib, issue.id)}`} onPress={() => props.onToggle(issue.id, read)} />
            </Pressable>
          );
        }
        const child = lib.collections.get(r.entry.child_collection_id!)!;
        const cp = progress(lib, child.id);
        const isOpen = !!open[child.id];
        const done = collectionStatus(lib, child.id) === 'completed';
        return (
          <View key={r.entry.id} style={s.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              onPress={() => setOpen((o) => ({ ...o, [child.id]: !isOpen }))}
              onLongPress={() => router.push(`/collection/${child.id}`)}
              style={{ padding: 14, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {isOpen ? <ChevronDown /> : <ChevronRight />}
                <View style={{ flex: 1 }}>
                  <Text style={[T.label, { fontSize: 10 }]}>{KIND_LABEL[child.kind]}{done ? ' · DONE' : ''}</Text>
                  <Text style={[T.bodyMedium, { lineHeight: 19 }]}>{child.title}</Text>
                </View>
                <Text style={[T.small, T.num]}>{cp.total ? `${cp.read} / ${cp.total}` : 'Empty'}</Text>
              </View>
              <Bar read={cp.read} total={cp.total} color={publisherColor(child.publisher)} height={3} />
            </Pressable>
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
      {hidden > 0 ? (
        <Pressable onPress={() => setShowAll(true)} style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={T.small}>Show {hidden} more</Text>
        </Pressable>
      ) : null}
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
  menuItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  group: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 14, borderBottomWidth: 1, borderBottomColor: C.divider },
  issueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, borderBottomWidth: 1, borderBottomColor: C.divider },
});
