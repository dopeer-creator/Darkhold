import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from 'react';
import { Alert, Animated, Dimensions, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SQLiteDatabase } from 'expo-sqlite';

import { creditsSummary, splitNames } from '@/domain/credits';
import { chapterSpots, collectionStatus, coverFor, headingSections, issueTitle, lastRead, moveLines, nextUp, notOutYet, type Piece, progress, READING_KINDS, rereadNumber, rereadSince, sectionLines, shownProgress, stepTargets, timesRead, type Library, walk } from '@/domain/library';
import type { Collection, Entry, Review } from '@/domain/types';
import { deleteCollection, removeEntries, reorderEntries, restoreEntries, setOptional, startReading, startReread, stopReading, stopReread, toggleRereadInList, updateCollection } from '@/store/repo';
import { useStore } from '@/store/store';
import { BackIcon, ChevronDown, ChevronRight, ChevronUp, GripIcon, MoreIcon, PlusIcon } from '@/ui/icons';
import { type SheetContent, type SheetItem, useActionSheet } from '@/ui/action-sheet';
import { Bar, Checkbox, Chip, Cover, PrimaryButton, SectionTitle, T } from '@/ui/parts';
import { relativeDay, releaseLabel } from '@/ui/format';
import { ConnectionsBlock } from '@/ui/connections';
import { NameLinks } from '@/ui/name-links';
import { exportList, shareFileName } from '@/domain/share';
import { shareTextFile } from '@/lib/backup';
import { splitTags } from '@/domain/characters';
import { reviewLine } from '@/domain/reviews';
import { Stars, VERDICT_COLORS, VerdictBadge } from '@/ui/review';
import { useFillDetails } from '@/ui/use-fill-details';
import { C, F, KIND_COLOR, kindLabel, kindName, publisherColor, STATUS_LABEL } from '@/ui/theme';
import { useReadTick } from '@/ui/read-again';
import { ReleasesCard } from '@/ui/releases-card';
import { formatOf } from '@/domain/modes';
import { BookPanel } from '@/ui/book-progress';
import { useCoverViewer } from '@/ui/cover-viewer';

const ROW_LIMIT = 8;

type Job = (db: SQLiteDatabase, lib: Library) => Promise<unknown>;
/** On the web, dragging with a mouse would otherwise select the cards' text. */
const NO_SELECT = { userSelect: 'none' } as object;

export default function CollectionScreen() {
  const { id, focus } = useLocalSearchParams<{ id: string; focus?: string }>();
  const { lib, act, words } = useStore();
  const showCover = useCoverViewer();
  const readTick = useReadTick();
  const c = lib.collections.get(id);
  const p = shownProgress(lib, id);
  const rereading = !!c?.reread_since;
  const next = nextUp(lib, id);
  const last = lastRead(lib, id);
  const status = collectionStatus(lib, id);

  const pathOpen = (step: typeof next) => (step ? Object.fromEntries(step.path.slice(1).map((pid) => [pid, true])) : {});
  // Arriving from a Continue button opens the sections down to the next issue and scrolls to it.
  const [open, setOpen] = useState<Record<string, boolean>>(() => (focus === 'next' ? pathOpen(next) : {}));
  const [menu, setMenu] = useState(false);
  const [options, setOptions] = useState(false);
  const [showArtists, setShowArtists] = useState(false);
  const [editing, setEditing] = useState(false);
  // Editing the order in place: what's selected, what Undo takes back, the card just held, closed chapters.
  const [picked, setPicked] = useState<string[]>([]);
  const [history, setHistory] = useState<{ label: string; undo: Job }[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const actionSheet = useActionSheet();
  const insets = useSafeAreaInsets();
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
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

  const fmt = formatOf(c);

  // ── Editing the order in place ──
  const lines = () => (lib.children.get(c.id) ?? []).map((e) => e.id);
  const remember = (label: string, undo: Job) => setHistory((h) => [...h.slice(-29), { label, undo }]);
  /**
   * Edits run one after another, each on the list as it is by then, so quick taps build on each other
   * instead of racing (two writes at once also fail: "cannot start a transaction within a transaction").
   */
  const run = (job: Job) => {
    queue.current = queue.current.then(() => act(job)).then(
      () => undefined,
      (e) => Alert.alert('Couldn’t change the order', e instanceof Error ? e.message : String(e)),
    );
  };
  const moveTo = (ids: string[], beforeId: string | null, label: string) =>
    run(async (db, l) => {
      const entries = l.children.get(c.id) ?? [];
      const prev = entries.map((e) => e.id);
      const next = moveLines(prev, ids.filter((id) => prev.includes(id)), beforeId != null && prev.includes(beforeId) ? beforeId : null);
      if (next.join() === prev.join()) return;
      remember(label, (d, l2) => reorderEntries(d, l2, c.id, prev));
      // A card moved into a closed chapter opens it, so you see where it went.
      const byId = new Map(entries.map((e) => [e.id, e]));
      if (!byId.get(ids[0])?.heading) {
        for (let k = next.indexOf(ids[0]) - 1; k >= 0; k--) {
          const h = byId.get(next[k]);
          if (h?.heading) {
            setFolded((f) => ({ ...f, [h.id]: false }));
            break;
          }
        }
      }
      await reorderEntries(db, l, c.id, next);
    });
  const pickedInOrder = () => lines().filter((id) => picked.includes(id));
  const setLinesOptional = (ids: string[], optional: boolean, label: string) => {
    const was = (lib.children.get(c.id) ?? []).filter((e) => ids.includes(e.id));
    const on = was.filter((e) => e.optional).map((e) => e.id);
    const off = was.filter((e) => !e.optional).map((e) => e.id);
    remember(label, async (db, l) => {
      await setOptional(db, l, c.id, on, true);
      await setOptional(db, l, c.id, off, false);
    });
    run((db, l) => setOptional(db, l, c.id, ids, optional));
  };
  const removeLines = (ids: string[], label: string) => {
    const gone = (lib.children.get(c.id) ?? []).filter((e) => ids.includes(e.id));
    const go = () => {
      remember(`remove ${label}`, (db) => restoreEntries(db, gone));
      setPicked((p) => p.filter((id) => !ids.includes(id)));
      run((db) => removeEntries(db, ids));
    };
    if (Platform.OS === 'web') return go();
    Alert.alert(`Remove ${label}?`, 'Only from this list. The issues stay in your library and anywhere else they appear. Undo brings it back.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: go },
    ]);
  };
  const canGroup = c.kind !== 'event';
  const partOf = (ids: string[]) => router.push({ pathname: '/part-of', params: { parent: c.id, entries: ids.join(',') } });
  const edit: EditApi = {
    on: editing,
    picked,
    flash,
    begin: (key) => {
      setEditing(true);
      setFlash(key);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 2500);
    },
    pick: (ids) => setPicked((p) => (ids.every((id) => p.includes(id)) ? p.filter((id) => !ids.includes(id)) : [...p, ...ids.filter((id) => !p.includes(id))])),
    moveTo,
    place: (beforeId) => {
      moveTo(pickedInOrder(), beforeId, `move ${picked.length === 1 ? 'the selected issue' : 'the selected cards'}`);
      setPicked([]);
    },
    optional: setLinesOptional,
    remove: removeLines,
    partOf: canGroup ? partOf : null,
    rename: (headingId) => router.push({ pathname: '/heading', params: { parent: c.id, entry: headingId } }),
    menu: actionSheet.open,
    scroller,
    folded,
    setFolded,
  };
  const finishEditing = () => {
    setEditing(false);
    setPicked([]);
    setFlash(null);
  };
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    run(last.undo);
  };
  const chapters = (lib.children.get(c.id) ?? []).filter((e) => e.heading);
  const pickedLines = (lib.children.get(c.id) ?? []).filter((e) => picked.includes(e.id));
  const pickedOptional = pickedLines.length > 0 && pickedLines.every((e) => e.optional);
  const pickedName = `${picked.length} selected`;
  const pickedChapterMenu = () =>
    actionSheet.open({
      title: `Move ${pickedName} to…`,
      sub: 'They go at the end of the chapter you pick, together, in their order.',
      items: chapters.map((h, i) => ({ label: h.heading ?? 'Chapter', go: () => edit.place(chapters[i + 1]?.id ?? null) })),
    });
  const color = fmt === 'comic' ? publisherColor(c.publisher) : words.accent;
  const years = c.start_year ? `${c.start_year}${c.ongoing ? '–present' : c.end_year && c.end_year !== c.start_year ? `–${c.end_year}` : ''}` : c.ongoing ? 'Ongoing' : '';

  const allIssues = [...new Set(walk(lib, c.id).map((st) => st.issueId))];
  const credits = creditsSummary(lib, c.id);
  const writerNames = c.writer ? splitNames(c.writer) : credits.mainWriters;
  const artistNames = c.artist ? splitNames(c.artist) : credits.mainArtists;
  // A book is read by page: no chapter list, no order to edit.
  const isBook = fmt === 'book' && c.kind !== 'crisis';
  const optionItems: { label: string; go: () => void; danger?: boolean }[] = [
    ...(isBook
      ? [
          ...(status === 'completed' ? [] : [{ label: 'Mark finished…', go: () => router.push({ pathname: '/update-page', params: { list: c.id, finish: '1' } }) }]),
          { label: 'Your copy (pages, kind)…', go: () => router.push({ pathname: '/book-copy', params: { list: c.id } }) },
        ]
      : [
          { label: 'Fill writer & artist details', go: () => fill.run(allIssues, c.id) },
          { label: 'Mark as read…', go: () => router.push({ pathname: '/mark/[id]', params: { id: c.id } }) },
          { label: 'Edit order', go: () => setEditing(true) },
        ]),
    ...(status === 'completed' ? [] : [{ label: status === 'on_hold' ? 'Resume reading' : 'Put on hold', go: () => act((db, l) => (status === 'on_hold' ? startReading(db, l, c.id) : updateCollection(db, l, c.id, { on_hold: true, reading_now: false }))) }]),
    ...(status === 'reading' && !c.reread_since ? [{ label: 'Stop reading', go: () => act((db, l) => stopReading(db, l, c.id)) }] : []),
    ...(status === 'completed' ? [{ label: 'Start a reread', go: () => act((db, l) => startReread(db, l, c.id)) }] : []),
    ...(c.reread_since ? [{ label: 'Stop the reread', go: () => act((db, l) => stopReread(db, l, c.id)) }] : []),
    { label: 'Connect to another list or issue…', go: () => router.push({ pathname: '/connect', params: { collection: c.id } }) },
    fmt === 'comic'
      ? { label: 'Choose a cover…', go: () => router.push({ pathname: '/covers', params: { collection: c.id } }) }
      : { label: `Find cover & details on ${words.source}…`, go: () => router.push({ pathname: '/add-work', params: { match: c.id } }) },
    { label: 'Export to share…', go: () => shareList(c.id) },
    { label: 'Edit details, type or label', go: () => router.push(`/new?edit=${c.id}`) },
    { label: 'Delete…', go: () => confirmDelete(c), danger: true },
  ];

  /** Sends this list (with everything inside it, but none of your reading) as a file someone can import. */
  const shareList = async (id: string) => {
    const file = exportList(lib, id);
    if (!file) return;
    try {
      const ok = await shareTextFile(shareFileName(file.shared!.title), JSON.stringify(file, null, 2));
      if (!ok) Alert.alert('Sharing isn’t available', 'This phone can’t open the share menu right now.');
    } catch (e) {
      Alert.alert('Couldn’t export', e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = (col: Collection) => {
    Alert.alert(`Delete ${col.title}?`, 'Issues you read stay in your history unless you also delete the contents.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete with contents', style: 'destructive', onPress: () => act((db, l) => deleteCollection(db, l, col.id, true)).then(() => router.back()) },
      { text: `Delete ${kindName(col.kind, col.format)} only`, style: 'destructive', onPress: () => act((db, l) => deleteCollection(db, l, col.id, false)).then(() => router.back()) },
    ]);
  };

  const menuItems: { label: string; go: () => void }[] =
    fmt === 'comic'
      ? [
          { label: 'Add issues', go: () => router.push(`/add-issues?parent=${c.id}`) },
          { label: 'Add a chapter', go: () => router.push({ pathname: '/heading', params: { parent: c.id } }) },
          { label: 'Add a run or event inside', go: () => router.push(`/link?parent=${c.id}`) },
        ]
      : c.kind === 'crisis'
        ? [
            { label: fmt === 'book' ? 'Add a book inside' : 'Add a manga inside', go: () => router.push(`/link?parent=${c.id}`) },
            { label: 'Add a heading', go: () => router.push({ pathname: '/heading', params: { parent: c.id } }) },
          ]
        : [
            { label: `Add ${words.issues}`, go: () => router.push({ pathname: '/add-chapters', params: { list: c.id } }) },
            { label: fmt === 'manga' ? 'Add a volume or arc heading' : 'Add a heading (Part One…)', go: () => router.push({ pathname: '/heading', params: { parent: c.id } }) },
          ];
  const workSeries = fmt === 'comic' ? null : ([...(lib.children.get(c.id) ?? [])].map((e) => (e.child_issue_id ? lib.issues.get(e.child_issue_id)?.series_id : null)).find(Boolean) ?? null);

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
      <ScrollView
        ref={scrollRef}
        scrollEnabled={scrollOn}
        scrollEventThrottle={16}
        onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
        onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => (contentH.current = h)}
        contentContainerStyle={{ paddingBottom: editing ? 220 : 48 }}>
        <View ref={contentRef} collapsable={false}>
          <View style={s.hero}>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose a cover" accessibilityHint="Hold to see it big" onLongPress={() => showCover(coverFor(lib, c.id), c.title)} onPress={() => (fmt === 'comic' ? router.push({ pathname: '/covers', params: { collection: c.id } }) : router.push({ pathname: '/add-work', params: { match: c.id } }))}>
              <Cover title={c.title} publisher={c.publisher} width={108} uri={coverFor(lib, c.id)} />
              <Text style={[T.tiny, { textAlign: 'center', marginTop: 4, fontSize: 11 }]}>Change cover</Text>
            </Pressable>
            <View style={{ flex: 1, gap: 6, paddingTop: 4 }}>
              <Text style={[T.label, { color }]}>{kindLabel(c)}{c.publisher ? ` · ${c.publisher.toUpperCase()}` : ''}</Text>
              <Text style={s.title}>{c.title}</Text>
              {writerNames.length || years ? (
                <Text style={T.small}>
                  <NameLinks names={writerNames} role="writer" />
                  {writerNames.length && years ? ' · ' : ''}
                  {years}
                </Text>
              ) : null}
              {artistNames.length || credits.variedArtists ? (
                c.artist || !credits.variedArtists || showArtists ? (
                  <Text style={T.tiny}>
                    Art: <NameLinks names={c.artist || !credits.variedArtists ? artistNames : credits.allArtists} role="artist" />
                  </Text>
                ) : (
                  <Text style={T.tiny} onPress={() => setShowArtists(true)} accessibilityRole="button">
                    Art: <Text style={{ color: C.dc }}>Various artists ({credits.allArtists.length}) ›</Text>
                  </Text>
                )
              ) : null}
              {credits.fillIns.length ? (
                <Text style={T.tiny} numberOfLines={2}>
                  Fill-ins:{' '}
                  {credits.fillIns.slice(0, 3).map((f, i) => (
                    <Text key={f.issueId}>
                      {i ? ' · ' : ''}
                      <NameLinks names={f.writers} role="writer" /> (#{lib.issues.get(f.issueId)?.number ?? '?'})
                    </Text>
                  ))}
                  {credits.fillIns.length > 3 ? ` · +${credits.fillIns.length - 3} more` : ''}
                </Text>
              ) : null}
              <View style={[s.pill, rereading ? { borderColor: '#E8C48A' } : null]}><Text style={[T.tiny, { color: rereading ? '#E8C48A' : C.text }]}>{rereading ? `Rereading · ${ordinal(rereadNumber(lib, c.id))} time` : STATUS_LABEL[status]}</Text></View>
            </View>
          </View>
          {c.description ? <Text style={[T.small, { paddingHorizontal: 16, paddingTop: 12, lineHeight: 20 }]}>{c.description}</Text> : null}
          {splitTags(c.characters).length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 12 }}>
              {splitTags(c.characters).map((t) => (
                <Chip key={t} label={t} onPress={() => router.push({ pathname: '/character/[name]', params: { name: t } })} />
              ))}
            </View>
          ) : null}
          {isBook ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
              {status === 'completed' ? (
                <ReviewStrip review={lib.reviews.get(c.id)} kind="book" issues="pages" onView={() => router.push({ pathname: '/review', params: { collection: c.id } })} onWrite={() => router.push({ pathname: '/review', params: { collection: c.id, edit: '1' } })} />
              ) : null}
              <BookPanel id={c.id} accent={color} />
            </View>
          ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={T.num}>
                <Text style={{ fontFamily: F.cond, fontSize: 26, color: C.text }}>{p.read}</Text>
                <Text style={T.small}> / {p.total} read</Text>
              </Text>
              <Text style={[T.small, T.num]}>{p.left} left{p.upcoming ? ` · ${p.upcoming} not out yet` : ''} · {p.total ? Math.round((p.read / p.total) * 100) : 0}%</Text>
            </View>
            <View style={{ marginTop: 8 }}><Bar read={p.read} total={p.total} color={color} height={6} /></View>
            {next && status !== 'reading' ? (
              <PrimaryButton
                label={`${status === 'on_hold' ? 'Resume' : 'Start reading'} · ${issueTitle(lib, next.issueId)}`}
                icon="play"
                onPress={() => act((db, l) => startReading(db, l, c.id)).then(goToNext)}
                style={{ marginTop: 14 }}
              />
            ) : next ? (
              <PrimaryButton label={`Continue · ${issueTitle(lib, next.issueId)}`} icon="play" onPress={goToNext} style={{ marginTop: 14 }} />
            ) : status === 'completed' ? (
              <ReviewStrip review={lib.reviews.get(c.id)} kind={kindName(c.kind, c.format)} issues={words.issues} onView={() => router.push({ pathname: '/review', params: { collection: c.id } })} onWrite={() => router.push({ pathname: '/review', params: { collection: c.id, edit: '1' } })} onAdd={() => setMenu(true)} />
            ) : (
              <PrimaryButton label={p.total ? `All read — add more ${words.issues}` : `Add ${words.issues} to start`} onPress={() => setMenu(true)} style={{ marginTop: 14 }} />
            )}
            {fmt === 'book' && c.kind !== 'crisis' ? (
              <Pressable accessibilityRole="button" accessibilityState={{ checked: !!c.owned }} onPress={() => act((db, l) => updateCollection(db, l, c.id, { owned: !c.owned }))} style={s.ownedRow}>
                <Checkbox checked={!!c.owned} label="Bought" onPress={() => act((db, l) => updateCollection(db, l, c.id, { owned: !c.owned }))} />
                <Text style={T.body}>Bought</Text>
                <Text style={[T.tiny, { flex: 1 }]}> · you have a physical copy</Text>
              </Pressable>
            ) : null}
            {last ? <Text style={[T.tiny, { textAlign: 'center', marginTop: 8 }]}>Last read: {issueTitle(lib, last.issueId)}</Text> : null}
          </View>
          )}

          {fmt === 'manga' && workSeries ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 8 }}>
              <SectionTitle>Releases</SectionTitle>
              <ReleasesCard seriesId={workSeries} />
            </View>
          ) : null}

          <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
            <ConnectionsBlock collectionId={c.id} />
          </View>

          {isBook ? null : (
          <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
            <SectionTitle
              right={
                editing ? (
                  <Pressable accessibilityRole="button" onPress={finishEditing} style={s.doneBtn}>
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
              {fmt !== 'comic' && c.kind !== 'crisis' ? words.Issues : READING_KINDS.includes(c.kind) ? 'Reading path' : 'Reading order'}
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
                <Text style={T.tiny}>
                  {picked.length
                    ? 'Tap more cards or issues to add them, then tap “Place here” where they go, or use the buttons below.'
                    : 'Tap ↑ ↓ to move a card one step, or drag its dots. Hold a card for more: top or bottom, another chapter, optional, remove. Moving a chapter heading moves everything in it.'}
                </Text>
              ) : null}
              {(lib.children.get(c.id) ?? []).length === 0 ? (
                <Text style={[T.small, { paddingVertical: 16 }]}>Nothing here yet. Tap ＋ to add {fmt !== 'comic' ? (c.kind === 'crisis' ? (fmt === 'book' ? 'books' : 'manga') : words.issues) : c.kind === 'event' ? 'issues' : 'events or issues'}.</Text>
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
                  rereadSince={c.reread_since ?? null}
                  onToggle={(issueId) => (c.reread_since ? act((db, l) => toggleRereadInList(db, l, c.id, issueId)) : readTick.tick(issueId))}
                  onIssueMenu={(entry) => router.push({ pathname: '/issue/[id]', params: { id: entry.child_issue_id!, entry: entry.id, parent: entry.parent_id } })}
                  edit={edit}
                />
              )}
            </View>
          </View>
          )}
        </View>
      </ScrollView>
      {editing ? (
        <View style={[s.editBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {picked.length ? (
            <>
              <Text style={[T.small, { color: C.dc }]}>{pickedName}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Pressable accessibilityRole="button" onPress={() => edit.place(lines().find((id) => !picked.includes(id)) ?? null)} style={s.pickBtn}><Text style={[T.tiny, { color: C.text }]}>Top</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => edit.place(null)} style={s.pickBtn}><Text style={[T.tiny, { color: C.text }]}>Bottom</Text></Pressable>
                {chapters.length ? <Pressable accessibilityRole="button" onPress={pickedChapterMenu} style={s.pickBtn}><Text style={[T.tiny, { color: C.text }]}>Chapter…</Text></Pressable> : null}
                <Pressable accessibilityRole="button" onPress={() => { setLinesOptional(picked, !pickedOptional, pickedOptional ? `count ${pickedName}` : `make ${pickedName} optional`); setPicked([]); }} style={s.pickBtn}><Text style={[T.tiny, { color: C.text }]}>{pickedOptional ? 'Count them' : 'Optional'}</Text></Pressable>
                {canGroup && pickedLines.every((e) => e.child_issue_id) ? <Pressable accessibilityRole="button" onPress={() => { partOf(pickedInOrder()); setPicked([]); }} style={s.pickBtn}><Text style={[T.tiny, { color: C.text }]}>Part of…</Text></Pressable> : null}
                <Pressable accessibilityRole="button" onPress={() => removeLines(pickedInOrder(), pickedName)} style={s.pickBtn}><Text style={[T.tiny, { color: C.danger }]}>Remove</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => setPicked([])} style={s.pickBtn}><Text style={[T.tiny, { color: C.dim }]}>Clear</Text></Pressable>
              </View>
            </>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={history.length ? `Undo ${history[history.length - 1].label}` : 'Nothing to undo'} disabled={!history.length} onPress={undo} style={[s.barBtn, { flex: 1, alignItems: 'flex-start', opacity: history.length ? 1 : 0.45 }]}>
              <Text style={[T.small, { color: C.text, fontFamily: F.semibold }]}>Undo</Text>
              <Text style={T.tiny} numberOfLines={1}>{history.length ? history[history.length - 1].label : 'nothing yet'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={finishEditing} style={[s.doneBtn, { height: 46, borderRadius: 23, paddingHorizontal: 24 }]}>
              <Text style={[T.small, { color: C.onLight, fontFamily: F.semibold }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {readTick.sheet}
      {actionSheet.sheet}
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
  /** Set while the list is being reread: ticks show and log rereads since this day. */
  rereadSince?: string | null;
  onIssueMenu: (entry: Entry) => void;
  /** The run's regular writers; issues by someone else show who wrote them. */
  mainWriters?: string[];
  /** Only on the list this screen is about (not lists opened inside it): editing its order in place. */
  edit?: EditApi;
};

/** What the list needs to change its order where it stands ("Edit order"). Lines are entry ids. */
type EditApi = {
  on: boolean;
  /** Lines selected to move or change together. */
  picked: string[];
  /** A card to light up for a moment (the one you held to start editing). */
  flash: string | null;
  /** Start editing with this card lit up. */
  begin: (key: string) => void;
  pick: (ids: string[]) => void;
  moveTo: (ids: string[], beforeId: string | null, label: string) => void;
  /** Move the selected lines just before this line (null = the end). */
  place: (beforeId: string | null) => void;
  optional: (ids: string[], optional: boolean, label: string) => void;
  remove: (ids: string[], label: string) => void;
  partOf: ((ids: string[]) => void) | null;
  rename: (headingId: string) => void;
  menu: (content: SheetContent) => void;
  scroller: Scroller;
  folded: Record<string, boolean>;
  setFolded: Dispatch<SetStateAction<Record<string, boolean>>>;
};

type Row =
  | { kind: 'issue'; entry: Entry }
  | { kind: 'group'; key: string; label: string; count: number; ids: string[] }
  | { kind: 'collection'; entry: Entry }
  | { kind: 'slice'; key: string; via: string | null; entries: Entry[]; continued: boolean }
  | { kind: 'heading'; entry: Entry };

const rowKey = (r: Row) => (r.kind === 'group' || r.kind === 'slice' ? r.key : r.entry.id);
const rowIds = (r: Row) => (r.kind === 'group' ? r.ids : r.kind === 'slice' ? r.entries.map((e) => e.id) : [r.entry.id]);

/** "Avengers #1–3", or one issue's title, or first … last when a block mixes series. */
function spanTitle(lib: Library, issueIds: string[]) {
  const first = lib.issues.get(issueIds[0]);
  const last = lib.issues.get(issueIds[issueIds.length - 1]);
  if (!first || !last || issueIds.length === 1) return issueTitle(lib, issueIds[0]);
  if (first.series_id === last.series_id) return `${issueTitle(lib, first.id)}–${last.number ?? ''}`;
  return `${issueTitle(lib, first.id)} … ${issueTitle(lib, last.id)}`;
}

/**
 * Issues and inner collections in order. Three or more read issues of one series in a row fold into one line.
 * In a crisis, issues that are slices of a run or event sit in labelled blocks ("RUN · Avengers #4–5").
 * While editing, the same cards stay where they are, open or closed, and get ↑ ↓ buttons, a drag grip and a
 * hold menu; a heading moves its whole chapter.
 */
function EntryList(props: ListProps) {
  const { lib, parentId, nextIssueId, open, setOpen, edit } = props;
  const editing = !!edit?.on;
  // "Show all" opens everything in this block at once: the hidden rest and every folded run of read issues.
  const [showAll, setShowAll] = useState(false);
  const [ownFolded, setOwnFolded] = useState<Record<string, boolean>>({});
  const folded = edit ? edit.folded : ownFolded;
  const setFolded = edit ? edit.setFolded : setOwnFolded;
  const entries = lib.children.get(parentId) ?? [];
  const order = entries.map((e) => e.id);
  const viaOf = (e: Entry) => e.part_of ?? null;
  const hasSlices = entries.some((e) => viaOf(e));

  const rows: Row[] = [];
  // Whether any run of read issues is long enough to fold, so "Show less" can fold them back.
  let foldable = false;
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
      if (j - i >= 3) foldable = true;
      if (j - i >= 3 && !showAll) {
        const lastIssue = lib.issues.get(entries[j - 1].child_issue_id!)!;
        rows.push({ kind: 'group', key, label: `${issueTitle(lib, issue.id)}–${lastIssue.number ?? ''}`, count: j - i, ids: entries.slice(i, j).map((x) => x.id) });
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
  const spots = new Map(chapterSpots(lib, parentId).map((sp) => [sp.headingId, sp]));
  const addHere = (afterEntryId: string, partOf: string | null) =>
    router.push({ pathname: '/add-issues', params: { parent: parentId, after: afterEntryId, ...(partOf ? { partOf } : {}) } });
  const nextSection = [...sections.entries()].find(([, sec]) => !!nextIssueId && sec.issueIds.has(nextIssueId))?.[0];
  const isFolded = (id: string) => folded[id] ?? (!!nextSection && id !== nextSection);
  const inView = rows.filter((r) => r.kind === 'heading' || !sectionOf.get(r) || !isFolded(sectionOf.get(r)!));

  // Long issue lists are cut short (blocks, events and runs always show), keeping the next issue in view.
  // Not in a list with chapters: chapters already fold, and a cut counted across the whole list showed an
  // opened chapter with only its first issue or two, and "Show all" under a later chapter.
  const chaptered = rows.some((r) => r.kind === 'heading');
  const issueRows = inView.filter((r) => r.kind === 'issue' || r.kind === 'group');
  const nextIndex = issueRows.findIndex((r) => r.kind === 'issue' && r.entry.child_issue_id === nextIssueId);
  const limit = Math.max(ROW_LIMIT, nextIndex + 4);
  const overLimit = !chaptered && issueRows.length > limit;
  let shown = 0;
  const visible = showAll || !overLimit ? inView : inView.filter((r) => (r.kind !== 'issue' && r.kind !== 'group') || ++shown <= limit);
  const hidden = inView.length - visible.length;

  /** A block's title: the run's name when it holds the whole run, else which issues ("Avengers #4–5") with the run's name under it. */
  const blockTitle = (r: Extract<Row, { kind: 'slice' }>): { title: string; sub?: string } => {
    const via = r.via ? lib.collections.get(r.via) : undefined;
    const ids = r.entries.map((e) => e.child_issue_id!);
    if (!via) return { title: ids.length === 1 ? issueTitle(lib, ids[0]) : `${ids.length} single issues` };
    const viaIssues = (lib.children.get(via.id) ?? []).filter((e) => e.child_issue_id).length;
    if (!r.continued && ids.length >= viaIssues) return { title: via.title };
    const seriesName = lib.series.get(lib.issues.get(ids[0])?.series_id ?? '')?.title;
    return { title: spanTitle(lib, ids), sub: via.title !== seriesName ? via.title : undefined };
  };

  // ── Editing in place ──
  const pieces: Piece[] = rows.map((r) => ({ ids: rowIds(r), heading: r.kind === 'heading' }));
  const indexOf = new Map(rows.map((r, k) => [r, k]));
  const visibleIdx = visible.map((r) => indexOf.get(r)!);
  /** What a card moves: its lines, or for a heading its whole chapter. */
  const pieceIds = (k: number) => (pieces[k].heading ? sectionLines(pieces, k) : pieces[k].ids);
  const nameOf = (r: Row): string => {
    if (r.kind === 'heading') return r.entry.heading ?? 'Chapter';
    if (r.kind === 'group') return r.label;
    if (r.kind === 'issue') return issueTitle(lib, r.entry.child_issue_id!);
    if (r.kind === 'collection') return lib.collections.get(r.entry.child_collection_id!)?.title ?? '';
    return blockTitle(r).title;
  };
  const picked = new Set(edit?.picked ?? []);
  const selecting = editing && picked.size > 0;
  const isPicked = (ids: string[]) => ids.length > 0 && ids.every((id) => picked.has(id));
  const headingIdx = rows.map((r, k) => (r.kind === 'heading' ? k : -1)).filter((k) => k >= 0);
  /** Where a card lands at the end of a chapter: before the next heading, or at the very end. */
  const endOfChapter = (h: number) => {
    const n = headingIdx.find((x) => x > h);
    return n == null ? null : pieces[n].ids[0];
  };
  const chapterMenu = (ids: string[], name: string, skip: number | null) =>
    edit!.menu({
      title: `Move ${name} to…`,
      sub: 'It goes at the end of the chapter you pick.',
      items: headingIdx
        .filter((h) => h !== skip)
        .map((h) => ({ label: (rows[h] as Extract<Row, { kind: 'heading' }>).entry.heading ?? 'Chapter', go: () => edit!.moveTo(ids, endOfChapter(h), `move ${name}`) })),
    });

  /** Hold a card while editing: every way to move or change it. */
  const pieceMenu = (k: number) => {
    const r = rows[k];
    const ids = pieceIds(k);
    const name = nameOf(r);
    const t = stepTargets(pieces, k);
    const items: SheetItem[] = [];
    if (t.up !== undefined) items.push({ label: r.kind === 'heading' ? 'Move chapter up' : 'Move up', go: () => edit!.moveTo(ids, t.up!, `move ${name} up`) });
    if (t.down !== undefined) items.push({ label: r.kind === 'heading' ? 'Move chapter down' : 'Move down', go: () => edit!.moveTo(ids, t.down ?? null, `move ${name} down`) });
    if (r.kind === 'heading') {
      items.push({ label: isFolded(r.entry.id) ? 'Open chapter' : 'Close chapter', go: () => setFolded((f) => ({ ...f, [r.entry.id]: !isFolded(r.entry.id) })) });
      items.push({ label: 'Rename chapter', go: () => edit!.rename(r.entry.id) });
      items.push({ label: 'Remove heading', hint: 'Only the heading. What’s under it joins the chapter above.', danger: true, go: () => edit!.remove([r.entry.id], `the heading ${name}`) });
    } else {
      let h = k - 1;
      while (h >= 0 && rows[h].kind !== 'heading') h--;
      const top = h + 1;
      const bottom = endOfChapter(h);
      const where = h >= 0 ? 'this chapter' : 'the list';
      if (top !== k) items.push({ label: `Move to the top of ${where}`, go: () => edit!.moveTo(ids, pieces[top].ids[0], `move ${name}`) });
      if (k < rows.length - 1 && rows[k + 1].kind !== 'heading') items.push({ label: `Move to the bottom of ${where}`, go: () => edit!.moveTo(ids, bottom, `move ${name}`) });
      if (headingIdx.length > (h >= 0 ? 1 : 0)) items.push({ label: 'Move to another chapter…', go: () => chapterMenu(ids, name, h >= 0 ? h : null) });
      items.push(...lineItems(ids, name, r.kind !== 'collection'));
    }
    edit!.menu({ title: name, sub: r.kind === 'heading' ? 'Moves the chapter with everything in it.' : undefined, items });
  };
  /** The choices every card or issue line has: optional, part of, select, remove. */
  const lineItems = (ids: string[], name: string, issues: boolean): SheetItem[] => {
    const lines = entries.filter((e) => ids.includes(e.id));
    const allOptional = lines.length > 0 && lines.every((e) => e.optional);
    return [
      { label: allOptional ? 'Count it again' : 'Make optional', hint: allOptional ? undefined : 'Shown and tickable, counted once read.', go: () => edit!.optional(ids, !allOptional, allOptional ? `count ${name}` : `make ${name} optional`) },
      ...(issues && edit!.partOf ? [{ label: 'Part of…', hint: 'Label it as part of a run or event.', go: () => edit!.partOf!(ids) }] : []),
      { label: 'Select to move with others', hint: 'Then tap more cards and place them together.', go: () => edit!.pick(ids) },
      { label: 'Remove from this list', danger: true, go: () => edit!.remove(ids, name) },
    ];
  };
  /** Hold an issue inside an open block while editing. */
  /**
   * ↑ ↓ for an issue inside an open block: one step within the block; from the block's first or last issue,
   * out past the card above or below (as the card's own ↑ ↓ would move the whole block).
   */
  const innerSteps = (r: Extract<Row, { kind: 'slice' }>, j: number) => {
    const e = r.entries[j];
    const name = issueTitle(lib, e.child_issue_id!);
    const t = stepTargets(pieces, indexOf.get(r)!);
    const last = r.entries.length - 1;
    const up =
      j > 0 ? () => edit!.moveTo([e.id], r.entries[j - 1].id, `move ${name} up`) : t.up !== undefined ? () => edit!.moveTo([e.id], t.up!, `move ${name} up`) : null;
    const down =
      j < last
        ? () => edit!.moveTo([r.entries[j + 1].id], e.id, `move ${name} down`)
        : t.down !== undefined
          ? () => edit!.moveTo([e.id], t.down ?? null, `move ${name} down`)
          : null;
    return { e, name, up, down, upLabel: j > 0 ? 'Move up' : 'Move up, past the card above', downLabel: j < last ? 'Move down' : 'Move down, past the card below' };
  };
  /** Hold an issue inside an open block while editing. */
  const innerMenu = (r: Extract<Row, { kind: 'slice' }>, j: number) => {
    const { e, name, up, down, upLabel, downLabel } = innerSteps(r, j);
    const after = order[order.indexOf(r.entries[r.entries.length - 1].id) + 1] ?? null;
    const items: SheetItem[] = [];
    if (up) items.push({ label: upLabel, go: up });
    if (down) items.push({ label: downLabel, go: down });
    if (r.entries.length > 1) {
      if (j > 0) items.push({ label: 'Take it out, above this card', go: () => edit!.moveTo([e.id], r.entries[0].id, `move ${name}`) });
      if (j < r.entries.length - 1) items.push({ label: 'Take it out, below this card', go: () => edit!.moveTo([e.id], after, `move ${name}`) });
    }
    if (headingIdx.length) items.push({ label: 'Move to another chapter…', go: () => chapterMenu([e.id], name, null) });
    items.push(...lineItems([e.id], name, true));
    edit!.menu({ title: name, items });
  };

  // Long-pressing a card when not editing: open it, or start editing right here.
  const rowEls = useRef<Record<string, ComponentRef<typeof View> | null>>({});
  const anchor = useRef<{ key: string; y: number } | null>(null);
  const startHere = (key: string) => {
    const ref = rowEls.current[key];
    if (!ref) return edit?.begin(key);
    ref.measureInWindow((_x, y) => {
      anchor.current = { key, y };
      edit?.begin(key);
    });
  };
  // Keep the card you held where it was on screen once editing starts.
  useEffect(() => {
    const a = anchor.current;
    if (!a || !editing) return;
    anchor.current = null;
    const t = setTimeout(() => rowEls.current[a.key]?.measureInWindow((_x, y) => edit?.scroller.scrollBy(y - a.y)), 60);
    return () => clearTimeout(t);
  }, [editing, edit]);
  const viewMenu = (key: string, title: string, openIt?: { label: string; go: () => void }) =>
    edit?.menu({ title, items: [...(openIt ? [openIt] : []), { label: 'Edit order here', hint: 'Move cards right where you are.', go: () => startHere(key) }] });

  // ── Dragging ──
  const layouts = useRef<Record<string, { y: number; h: number }>>({});
  const live = useRef({ k: -1, dy: 0, scrolled: 0, pageY: 0, frame: 0, before: undefined as string | null | undefined });
  const [drag, setDrag] = useState<{ key: string; lineY: number | null } | null>(null);
  const [lift] = useState(() => new Animated.Value(0));
  const follow = () => {
    const d = live.current;
    const L = layouts.current;
    const me = rows[d.k];
    const own = me ? L[rowKey(me)] : undefined;
    if (!own) return;
    lift.setValue(d.dy + d.scrolled);
    const mid = own.y + own.h / 2 + d.dy + d.scrolled;
    // A chapter only lands between chapters.
    const cands = visibleIdx.filter((i) => i !== d.k && (me.kind !== 'heading' || rows[i].kind === 'heading'));
    let t = 0;
    for (const i of cands) {
      const l = L[rowKey(rows[i])];
      if (l && l.y + l.h / 2 < mid) t++;
    }
    const beforeRow = cands[t];
    const before = beforeRow != null ? pieces[beforeRow].ids[0] : null;
    const same = moveLines(order, pieceIds(d.k), before).join() === order.join();
    const lb = beforeRow != null ? L[rowKey(rows[beforeRow])] : null;
    const lastL = cands.length ? L[rowKey(rows[cands[cands.length - 1]])] : null;
    const lineY = same ? null : lb ? lb.y - 5 : lastL ? lastL.y + lastL.h + 2 : null;
    d.before = same ? undefined : before;
    setDrag((p) => (p && p.key === rowKey(me) && p.lineY === lineY ? p : { key: rowKey(me), lineY }));
  };
  const tick = () => {
    const d = live.current;
    if (d.k < 0) return;
    const screen = Dimensions.get('window').height;
    const speed = d.pageY < EDGE ? -Math.min(MAX_SPEED, (EDGE - d.pageY) / 3) : d.pageY > screen - EDGE ? Math.min(MAX_SPEED, (d.pageY - (screen - EDGE)) / 3) : 0;
    if (speed && edit) {
      d.scrolled += edit.scroller.scrollBy(speed);
      follow();
    }
    d.frame = requestAnimationFrame(tick);
  };
  const dragStart = (k: number, pageY: number) => {
    live.current = { k, dy: 0, scrolled: 0, pageY, frame: 0, before: undefined };
    lift.setValue(0);
    setDrag({ key: rowKey(rows[k]), lineY: null });
    edit?.scroller.setEnabled(false);
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
    edit?.scroller.setEnabled(true);
    const { k, before } = d;
    live.current = { ...d, k: -1 };
    lift.setValue(0);
    setDrag(null);
    if (k >= 0 && before !== undefined) edit?.moveTo(pieceIds(k), before, `move ${nameOf(rows[k])}`);
  };
  useEffect(() => {
    const d = live.current;
    return () => cancelAnimationFrame(d.frame);
  }, []);

  /** ↑ ↓ (and the drag grip) at the end of a card while editing. */
  const controls = (k: number, canDrag: boolean) => {
    const t = stepTargets(pieces, k);
    const ids = pieceIds(k);
    const name = nameOf(rows[k]);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Move ${name} up`} disabled={t.up === undefined} hitSlop={4} onPress={() => edit!.moveTo(ids, t.up!, `move ${name} up`)} style={s.step}>
            <ChevronUp size={20} color={t.up === undefined ? C.faint : C.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Move ${name} down`} disabled={t.down === undefined} hitSlop={4} onPress={() => edit!.moveTo(ids, t.down ?? null, `move ${name} down`)} style={s.step}>
            <ChevronDown size={20} color={t.down === undefined ? C.faint : C.text} />
          </Pressable>
        </View>
        {canDrag && !selecting ? <DragHandle label={`Drag ${name}`} onStart={(y) => dragStart(k, y)} onMove={dragMove} onEnd={dragEnd} /> : null}
      </View>
    );
  };
  /** Small ↑ ↓ for an issue inside an open block. */
  const innerControls = (r: Extract<Row, { kind: 'slice' }>, j: number) => {
    const { name, up, down } = innerSteps(r, j);
    return (
      <View style={{ flexDirection: 'row' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Move ${name} up`} disabled={!up} onPress={up ?? undefined} style={s.innerStep}>
          <ChevronUp size={18} color={up ? C.text : C.faint} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Move ${name} down`} disabled={!down} onPress={down ?? undefined} style={s.innerStep}>
          <ChevronDown size={18} color={down ? C.text : C.faint} />
        </Pressable>
      </View>
    );
  };

  /** One issue line. `inBlock` is set for an issue inside an open block of the list being edited. */
  const renderIssue = (entry: Entry, at?: { k: number } | { block: Extract<Row, { kind: 'slice' }>; j: number }) => {
    const issue = lib.issues.get(entry.child_issue_id!);
    if (!issue) return null;
    const read = issue.status === 'read';
    const ticked = props.rereadSince ? rereadSince(lib, issue.id, props.rereadSince) : read;
    const times = timesRead(lib, issue.id);
    const isNext = issue.id === nextIssueId;
    const editHere = editing && !!at;
    const lit = editHere && picked.has(entry.id);
    const title = issueTitle(lib, issue.id);
    const onLong = !edit
      ? () => props.onIssueMenu(entry)
      : editHere
        ? () => ('k' in at! ? pieceMenu(at.k) : innerMenu(at!.block, at!.j))
        : () => viewMenu(at && 'block' in at ? at.block.key : entry.id, title, { label: 'Issue details', go: () => props.onIssueMenu(entry) });
    const row = (
      <Pressable
        key={entry.id}
        ref={isNext ? props.nextRowRef : undefined}
        onLayout={isNext ? props.onNextRowLayout : undefined}
        onPress={() => (selecting && editHere ? edit!.pick([entry.id]) : props.onIssueMenu(entry))}
        onLongPress={onLong}
        style={editHere ? { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center' } : s.issueRow}>
        <View style={{ flex: 1, paddingVertical: 8 }}>
          <Text style={[T.body, { fontSize: 14, color: read || notOutYet(issue) ? C.muted : C.text }]}>{title}</Text>
          {issue.story_title ? <Text numberOfLines={2} style={[T.tiny, { fontSize: 12, marginTop: 1, fontStyle: 'italic' }]}>“{issue.story_title}”</Text> : null}
          {isNext ? <Text style={[T.label, { color: C.dc, marginTop: 2 }]}>{issue.status === 'reading' ? 'READING NOW' : 'NEXT UP'}</Text> : null}
          {notOutYet(issue) ? <Text style={[T.label, { color: C.indie, marginTop: 2, fontSize: 10 }]}>NOT OUT YET{issue.release_on ? ` · ${releaseLabel(issue.release_on).toUpperCase()}` : ''}</Text> : null}
          {entry.optional ? <Text style={[T.label, { color: C.dim, marginTop: 2, fontSize: 10 }]}>{ticked ? 'OPTIONAL · COUNTED' : 'OPTIONAL · COUNTS ONCE READ'}</Text> : null}
          {read && (issue.completed_at || lib.reviews.has(issue.id) || times > 1) ? (
            <Text style={[T.tiny, { fontSize: 11, marginTop: 2 }]}>
              {issue.completed_at ? `Read ${relativeDay(issue.completed_at)}` : ''}
              {times > 1 ? `${issue.completed_at ? ' · ' : ''}read ${times}×` : ''}
              {issue.completed_at && lib.reviews.has(issue.id) ? ' · ' : ''}
              {lib.reviews.has(issue.id) ? <Text style={{ color: VERDICT_COLORS[lib.reviews.get(issue.id)!.verdict].fg }}>{reviewLine(lib.reviews.get(issue.id)!)}</Text> : null}
            </Text>
          ) : null}
          {issue.notes && !read && !/^optional$/i.test(issue.notes.trim()) ? <Text style={[T.tiny, { fontSize: 11, marginTop: 2 }]}>{issue.notes}</Text> : null}
          {issue.writers && props.mainWriters?.length && !splitNames(issue.writers).some((w) => props.mainWriters!.includes(w)) ? (
            <Text style={[T.tiny, { fontSize: 11, marginTop: 2, color: C.indie }]}>Written by {issue.writers}</Text>
          ) : null}
        </View>
        {editHere ? null : (
          <Checkbox checked={ticked} label={`${props.rereadSince ? (ticked ? 'Undo reread' : 'Reread') : read ? 'Read, tap for options' : 'Mark read'}: ${title}`} onPress={() => props.onToggle(issue.id, read)} />
        )}
      </Pressable>
    );
    if (!editHere) return row;
    return (
      <View key={entry.id} style={[s.issueRow, { gap: 4 }, lit ? { backgroundColor: '#16223A' } : null]}>
        {row}
        {'k' in at! ? controls(at.k, true) : innerControls(at!.block, at!.j)}
      </View>
    );
  };

  const header = (o: { label: string; color: string; title: string; suffix?: string; sub?: string; read: number; total: number; isOpen: boolean; bar: string; onPress: () => void; onLongPress?: () => void; right?: ReactNode }) => {
    const main = (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: o.isOpen }} onPress={o.onPress} onLongPress={o.onLongPress} style={{ flex: 1, paddingLeft: 14, paddingRight: o.right ? 6 : 14, paddingVertical: o.right ? 10 : 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {o.isOpen ? <ChevronDown /> : <ChevronRight />}
        <View style={{ flex: 1 }}>
          <Text style={[T.label, { fontSize: 10, color: o.color }]}>{o.label}</Text>
          <Text style={[T.bodyMedium, { lineHeight: 19 }]}>
            {o.title}
            {o.suffix ? <Text style={T.small}> {o.suffix}</Text> : null}
          </Text>
          {o.sub ? <Text style={[T.tiny, { marginTop: 1 }]} numberOfLines={1}>{o.sub}</Text> : null}
        </View>
        <Text style={[T.small, T.num]}>{o.total ? `${o.read} / ${o.total}` : 'Empty'}</Text>
      </View>
      <Bar read={o.read} total={o.total} color={o.bar} height={3} />
    </Pressable>
    );
    return o.right ? (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {main}
        {o.right}
      </View>
    ) : (
      main
    );
  };

  const renderRow = (r: Row): ReactNode => {
    const k = indexOf.get(r)!;
    const key = rowKey(r);
    const lit = editing && (edit!.flash === key || isPicked(rowIds(r)));
    const tapPick = selecting && r.kind !== 'heading' ? () => edit!.pick(rowIds(r)) : null;
    if (r.kind === 'heading') {
      const sec = sections.get(r.entry.id);
      const isOpen = !isFolded(r.entry.id);
      return (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
            onPress={() => setFolded((f) => ({ ...f, [r.entry.id]: isOpen }))}
            onLongPress={editing ? () => pieceMenu(k) : edit ? () => viewMenu(key, r.entry.heading ?? 'Chapter', { label: 'Rename chapter', go: () => edit.rename(r.entry.id) }) : undefined}
            style={[s.heading, { flex: 1 }, lit ? s.lit : null]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isOpen ? <ChevronDown color={C.text} /> : <ChevronRight color={C.text} />}
              <Text style={s.headingText} numberOfLines={2}>{r.entry.heading}</Text>
              {sec?.total ? <Text style={[T.small, T.num]}>{sec.read} / {sec.total}</Text> : null}
            </View>
            {r.entry.note ? <Text style={[T.tiny, { marginLeft: 24 }]} numberOfLines={editing ? 2 : undefined}>{r.entry.note}</Text> : null}
            {sec?.total ? (
              <View style={{ marginLeft: 24 }}>
                <Bar read={sec.read} total={sec.total} color={C.text} height={2} />
              </View>
            ) : null}
          </Pressable>
          {editing ? (
            <View style={{ marginTop: 4 }}>{controls(k, !isOpen)}</View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add issues to ${r.entry.heading}`}
              hitSlop={8}
              onPress={() => {
                const sp = spots.get(r.entry.id);
                addHere(sp?.afterEntryId ?? r.entry.id, sp?.partOf.length === 1 ? sp.partOf[0] : null);
              }}
              style={s.chapterAdd}>
              <PlusIcon size={16} width={2} />
            </Pressable>
          )}
        </View>
      );
    }
    if (r.kind === 'group') {
      return (
        <View style={[s.group, { paddingRight: editing ? 0 : 14 }, lit ? { backgroundColor: '#16223A' } : null]}>
          <Pressable
            accessibilityRole="button"
            onPress={tapPick ?? (() => setShowAll(true))}
            onLongPress={editing ? () => pieceMenu(k) : edit ? () => viewMenu(key, r.label) : undefined}
            style={{ flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
            <Text style={T.small}>{r.label}</Text>
            <Text style={T.tiny}>{r.count} read · show all</Text>
          </Pressable>
          {editing ? controls(k, true) : null}
        </View>
      );
    }
    if (r.kind === 'issue') return renderIssue(r.entry, edit ? { k } : undefined);
    if (r.kind === 'slice') {
      const via = r.via ? lib.collections.get(r.via)! : null;
      const ids = r.entries.map((e) => e.child_issue_id!);
      // Optional lines count in the block once read (a block that's all optional counts all of them).
      const counted = (r.entries.every((e) => e.optional) ? ids : r.entries.filter((e) => !e.optional || lib.issues.get(e.child_issue_id!)?.status === 'read').map((e) => e.child_issue_id!)).filter((id) => !notOutYet(lib.issues.get(id)!));
      const read = counted.filter((id) => lib.issues.get(id)?.status === 'read').length;
      const hasNext = !!nextIssueId && ids.includes(nextIssueId);
      const isOpen = open[r.key] ?? hasNext;
      const kind = via?.kind ?? 'issue';
      const optional = r.entries.every((e) => e.optional);
      const bt = blockTitle(r);
      return (
        <View style={[s.card, lit ? s.lit : null]}>
          {header({
            label: `${via ? kindLabel(via) : 'ISSUES'}${optional ? ' · OPTIONAL' : ''}${read === counted.length ? ' · DONE' : hasNext ? ' · UP NEXT' : ''}`,
            color: KIND_COLOR[kind],
            title: bt.title,
            sub: bt.sub,
            read,
            total: counted.length,
            isOpen,
            bar: KIND_COLOR[kind],
            onPress: tapPick ?? (() => setOpen((o) => ({ ...o, [r.key]: !isOpen }))),
            onLongPress: editing ? () => pieceMenu(k) : edit ? () => viewMenu(key, bt.title, via ? { label: `Open ${via.title}`, go: () => router.push(`/collection/${via.id}`) } : undefined) : via ? () => router.push(`/collection/${via.id}`) : undefined,
            right: editing ? controls(k, true) : undefined,
          })}
          {isOpen ? (
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingLeft: 14 }}>
              {r.entries.map((e, j) => renderIssue(e, edit ? { block: r, j } : undefined))}
              {editing ? null : (
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
                  <Pressable accessibilityRole="button" onPress={() => addHere(r.entries[r.entries.length - 1].id, via?.id ?? null)} style={{ paddingVertical: 12 }}>
                    <Text style={[T.small, { color: C.text }]}>＋ Add issues here</Text>
                  </Pressable>
                  {via ? (
                    <Pressable onPress={() => router.push(`/collection/${via.id}`)} style={{ paddingVertical: 12 }}>
                      <Text style={T.small}>Open {via.title}</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
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
      <View style={[s.card, lit ? s.lit : null]}>
        {header({
          label: `${kindLabel(child)}${r.entry.optional ? ' · OPTIONAL' : ''}${done ? ' · DONE' : ''}`,
          color: KIND_COLOR[child.kind],
          title: child.title,
          read: cp.read,
          total: cp.total,
          isOpen,
          bar: publisherColor(child.publisher),
          onPress: tapPick ?? (() => setOpen((o) => ({ ...o, [child.id]: !isOpen }))),
          onLongPress: editing ? () => pieceMenu(k) : edit ? () => viewMenu(key, child.title, { label: `Open ${child.title}`, go: () => router.push(`/collection/${child.id}`) }) : () => router.push(`/collection/${child.id}`),
          right: editing ? controls(k, true) : undefined,
        })}
        {isOpen ? (
          <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingLeft: child.kind === 'event' ? 14 : 10, paddingRight: child.kind === 'event' ? 0 : 10, paddingVertical: child.kind === 'event' ? 0 : 10 }}>
            {(lib.children.get(child.id) ?? []).length ? <EntryList {...props} edit={undefined} parentId={child.id} /> : <Text style={[T.small, { padding: 12 }]}>No issues yet.</Text>}
            <Pressable onPress={() => router.push(`/collection/${child.id}`)} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={T.small}>Open {child.title}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  /** While cards are selected: a "Place here" spot before each card that isn't selected. */
  const placeSpot = (r: Row | null, prev: Row | null) => {
    if (!selecting) return null;
    if (r && isPicked(rowIds(r))) return null;
    if (prev && isPicked(rowIds(prev))) return null;
    return (
      <Pressable key={`place-${r ? rowKey(r) : 'end'}`} accessibilityRole="button" onPress={() => edit!.place(r ? rowIds(r)[0] : null)} style={s.placeHere}>
        <Text style={[T.small, { color: C.dc }]}>Place here</Text>
      </Pressable>
    );
  };

  return (
    <View style={[{ gap: rows.some((r) => r.kind === 'collection' || r.kind === 'slice' || r.kind === 'heading') || editing ? 10 : 0 }, editing && Platform.OS === 'web' ? NO_SELECT : null]}>
      {/* The cards' buttons and grips use refs only in their handlers (drag state, positions), never while rendering. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {visible.map((r, v) => {
        const key = rowKey(r);
        const dragged = drag?.key === key;
        return (
          <Animated.View
            key={key}
            ref={(el: ComponentRef<typeof View> | null) => {
              rowEls.current[key] = el;
            }}
            collapsable={false}
            onLayout={(e) => (layouts.current[key] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height })}
            style={[{ gap: 10 }, dragged ? s.lifted : null, dragged ? { transform: [{ translateY: lift }] } : null]}>
            {placeSpot(r, visible[v - 1] ?? null)}
            {renderRow(r)}
          </Animated.View>
        );
      })}
      {selecting ? placeSpot(null, visible[visible.length - 1] ?? null) : null}
      {drag?.lineY != null ? <View pointerEvents="none" style={[s.dropLine, { top: drag.lineY }]} /> : null}
      {!showAll && (hidden > 0 || rows.some((r) => r.kind === 'group')) ? (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={s.showAll}>
          <Text style={[T.small, { color: C.text }]}>Show all{hidden > 0 ? ` · ${hidden} more` : ''}</Text>
        </Pressable>
      ) : showAll && (overLimit || foldable) ? (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(false)} style={s.showAll}>
          <Text style={T.small}>Show less</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Lets the list stop the page from scrolling under a drag, and scroll it near the edges. */
type Scroller = { setEnabled: (on: boolean) => void; scrollBy: (dy: number) => number };

/** Within this many pixels of the top or bottom of the screen, a dragged card scrolls the page. */
const EDGE = 110;
const MAX_SPEED = 28;

/** The dots at the end of a card: press and drag them to move it. */
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
  ownedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, minHeight: 44 },
  reviewStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderStrong },
  viewBtn: { minHeight: 36, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, justifyContent: 'center' },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingTop: 4 },
  title: { fontFamily: F.condBold, fontSize: 30, lineHeight: 31, color: C.text },
  pill: { alignSelf: 'flex-start', marginTop: 4, height: 26, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: C.borderStrong, justifyContent: 'center' },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  menu: { marginTop: 8, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 12, padding: 6 },
  optionsMenu: { position: 'absolute', top: 52, right: 12, zIndex: 10, minWidth: 220, marginTop: 0, elevation: 6 },
  doneBtn: { height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: C.text, justifyContent: 'center' },
  fillBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  heading: { paddingTop: 10, paddingBottom: 4, gap: 6 },
  headingText: { flex: 1, fontFamily: F.condBold, fontSize: 18, letterSpacing: 0.6, textTransform: 'uppercase', color: C.text },
  chapterAdd: { marginTop: 8, width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  step: { width: 40, height: 26, alignItems: 'center', justifyContent: 'center' },
  innerStep: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  lit: { borderColor: C.dc, backgroundColor: '#16223A' },
  editBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.borderStrong, paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  barBtn: { height: 42, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  pickBtn: { flexGrow: 1, flexBasis: '30%', height: 40, borderRadius: 10, borderWidth: 1, borderColor: C.dc, backgroundColor: '#16223A', alignItems: 'center', justifyContent: 'center' },
  grip: { width: 34, height: 52, alignItems: 'center', justifyContent: 'center' },
  dropLine: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: C.dc, zIndex: 20, elevation: 20 },
  lifted: { zIndex: 10, elevation: 12, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  showAll: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  placeHere: { height: 40, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.dc, alignItems: 'center', justifyContent: 'center' },
  menuItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  group: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.divider },
  issueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, borderBottomWidth: 1, borderBottomColor: C.divider },
});

/** On a finished list, where the Continue button was: your review in one line with View, or a button to write one. */
function ReviewStrip({ review, kind, issues, onView, onWrite, onAdd }: { review?: Review; kind: string; issues: string; onView: () => void; onWrite: () => void; onAdd?: () => void }) {
  return (
    <View style={{ marginTop: 14, gap: 8 }}>
      {review ? (
        <Pressable accessibilityRole="button" accessibilityLabel="View your review" onPress={onView} style={s.reviewStrip}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <VerdictBadge verdict={review.verdict} small />
              {review.score != null ? <Text style={{ fontFamily: F.cond, fontSize: 20, color: C.text }}>{review.score.toFixed(2)}</Text> : null}
              <Stars score={review.score} size={13} />
            </View>
            <Text style={T.tiny}>Your review</Text>
          </View>
          <View style={s.viewBtn}><Text style={[T.small, { color: C.text }]}>View</Text></View>
        </Pressable>
      ) : (
        <PrimaryButton label={"Review this " + kind} onPress={onWrite} />
      )}
      {onAdd ? (
        <Pressable accessibilityRole="button" onPress={onAdd} style={{ alignSelf: 'center', minHeight: 32, justifyContent: 'center' }}>
          <Text style={T.tiny}>All read · add more {issues}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
