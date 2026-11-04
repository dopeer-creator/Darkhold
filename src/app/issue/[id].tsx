import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { issueTitle } from '@/domain/library';
import type { IssueStatus } from '@/domain/types';
import { findVolume, getComicVineKey, volumeCovers } from '@/lib/comicvine';
import { daysAgo, moveIssue, removeEntry, setIssueStatus, setReadDate, today, updateIssue, updateSeries } from '@/store/repo';
import { useStore } from '@/store/store';
import { BackIcon } from '@/ui/icons';
import { Chip, Cover, GhostButton, SectionTitle, T } from '@/ui/parts';
import { relativeDay } from '@/ui/format';
import { pickDay } from '@/ui/pick-day';
import { C, F, KIND_COLOR, KIND_LABEL } from '@/ui/theme';

const STATUSES: { key: IssueStatus; label: string }[] = [
  { key: 'unread', label: 'Unread' },
  { key: 'reading', label: 'Reading' },
  { key: 'read', label: 'Read' },
];

/** One issue: status, when you read it (or "date unknown"), rating, notes, cover, and where it appears. */
export default function IssueScreen() {
  const { id, entry, parent } = useLocalSearchParams<{ id: string; entry?: string; parent?: string }>();
  const { lib, act } = useStore();
  const db = useSQLiteContext();
  const issue = lib.issues.get(id);
  const [notes, setNotes] = useState(issue?.notes ?? '');
  const [link, setLink] = useState('');
  const [finding, setFinding] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const startSeries = issue ? lib.series.get(issue.series_id) : undefined;
  const [editNumber, setEditNumber] = useState(issue?.number ?? '');
  const [editTitle, setEditTitle] = useState(startSeries?.title ?? '');
  const [editYear, setEditYear] = useState(startSeries?.volume_year ? String(startSeries.volume_year) : '');

  useEffect(() => {
    getComicVineKey(db).then((k) => setHasKey(!!k));
  }, [db]);

  if (!issue) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
        <Text style={T.body}>This issue was deleted.</Text>
      </SafeAreaView>
    );
  }
  const series = lib.series.get(issue.series_id);
  const title = issueTitle(lib, issue.id);
  const yesterday = daysAgo(1);
  const parentColl = parent ? lib.collections.get(parent) : undefined;
  const appearsIn = [...new Set([...(lib.parents.get(issue.id) ?? [])])]
    .map((cid) => lib.collections.get(cid))
    .filter((c): c is NonNullable<typeof c> => !!c);

  const setDate = (day: string | null) => act((d, l) => setReadDate(d, l, issue.id, day));
  const pick = async () => {
    const day = await pickDay(issue.completed_at);
    if (day) await setDate(day);
  };
  const saveNotes = () => {
    if ((issue.notes ?? '') !== notes) act((d, l) => updateIssue(d, l, issue.id, { notes: notes.trim() || null }));
  };
  const saveLink = async () => {
    const url = link.trim();
    if (!/^https?:\/\/\S+$/.test(url)) return Alert.alert('That does not look like an image link', 'Paste a link that starts with http:// or https://');
    await act((d, l) => updateIssue(d, l, issue.id, { cover_path: url }));
    setLink('');
  };
  const year = /^\d{4}$/.test(editYear.trim()) ? Number(editYear.trim()) : null;
  const seriesChanged = !!series && (editTitle.trim() !== series.title || year !== (series.volume_year ?? null));
  const numberChanged = editNumber.trim() !== (issue.number ?? '');
  const inSeries = series ? [...lib.issues.values()].filter((i) => i.series_id === series.id).length : 0;
  const saveThisIssue = async () => {
    const problem = await act((d, l) => moveIssue(d, l, issue.id, { title: editTitle, volume_year: year, number: editNumber }));
    if (problem) Alert.alert('Not saved', problem);
  };
  const saveWholeSeries = () => {
    if (!series) return;
    const clash = [...lib.series.values()].find((x) => x.id !== series.id && x.title.toLowerCase() === editTitle.trim().toLowerCase() && (x.volume_year ?? null) === year);
    if (clash) return Alert.alert('That series already exists', `Use "Only this issue" to move issues into ${clash.title}${clash.volume_year ? ` (${clash.volume_year})` : ''} one by one.`);
    Alert.alert(`Change all ${inSeries} issues?`, `${series.title}${series.volume_year ? ` (${series.volume_year})` : ''} becomes ${editTitle.trim()}${year ? ` (${year})` : ''} everywhere.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change series', onPress: () => act((d, l) => updateSeries(d, l, series.id, { title: editTitle.trim(), volume_year: year })) },
    ]);
  };
  const findCover = async () => {
    const key = await getComicVineKey(db);
    if (!key || !series) return router.push('/settings');
    if (issue.number == null) return Alert.alert('No issue number', 'Give this issue a number first, or paste a cover link.');
    setFinding('Looking up the series…');
    try {
      const volume = await findVolume(key, series);
      if (!volume) throw new Error(`Comic Vine has no series called "${series.title}". Paste a cover link instead.`);
      setFinding('Getting covers…');
      const url = (await volumeCovers(key, volume)).get(issue.number);
      if (!url) throw new Error(`Comic Vine has no cover for #${issue.number} in that series.`);
      await act((d, l) => updateIssue(d, l, issue.id, { cover_path: url }));
    } catch (e) {
      Alert.alert('No cover found', e instanceof Error ? e.message : String(e));
    } finally {
      setFinding('');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.iconBtn}>
          <BackIcon />
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 22, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Cover title={series?.title ?? title} publisher={series?.publisher ?? null} width={108} mark={issue.number ?? '?'} uri={issue.cover_path} />
            <View style={{ flex: 1, gap: 6, paddingTop: 4 }}>
              <Text style={s.title}>{title}</Text>
              {series ? (
                <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/series/[id]', params: { id: series.id } })} hitSlop={6}>
                  <Text style={[T.small, { color: C.dc }]}>{series.title}{series.volume_year ? ` (${series.volume_year})` : ''}{series.publisher ? ` · ${series.publisher}` : ''} ›</Text>
                </Pressable>
              ) : null}
              {issue.label && issue.number == null ? <Text style={T.tiny}>{issue.label}</Text> : null}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <SectionTitle>Status</SectionTitle>
            <View style={s.segment}>
              {STATUSES.map((st) => (
                <Pressable
                  key={st.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: issue.status === st.key }}
                  onPress={() => act((d, l) => setIssueStatus(d, l, issue.id, st.key, st.key === 'read' ? null : undefined))}
                  style={[s.segItem, issue.status === st.key ? { backgroundColor: '#2C2C31' } : null]}>
                  <Text style={[T.small, issue.status === st.key ? { color: C.text, fontFamily: F.semibold } : null]}>{st.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {issue.status === 'read' ? (
            <View style={{ gap: 8 }}>
              <SectionTitle>Read on</SectionTitle>
              <Text style={T.body}>{issue.completed_at ? relativeDay(issue.completed_at) : 'Date unknown'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label="Date unknown" active={!issue.completed_at} onPress={() => setDate(null)} />
                <Chip label="Today" active={issue.completed_at === today()} onPress={() => setDate(today())} />
                <Chip label="Yesterday" active={issue.completed_at === yesterday} onPress={() => setDate(yesterday)} />
                <Chip label="Pick a date…" active={!!issue.completed_at && issue.completed_at !== today() && issue.completed_at !== yesterday} onPress={pick} />
              </View>
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <SectionTitle>Your rating</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = (issue.rating ?? 0) >= n * 2;
                return (
                  <Pressable
                    key={n}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
                    onPress={() => act((d, l) => updateIssue(d, l, issue.id, { rating: issue.rating === n * 2 ? null : n * 2 }))}
                    style={s.star}>
                    <Text style={{ fontSize: 28, color: on ? '#E8B04B' : C.faint }}>{on ? '★' : '☆'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <SectionTitle>Notes</SectionTitle>
            <TextInput value={notes} onChangeText={setNotes} onBlur={saveNotes} multiline placeholder="Thoughts, where you read it…" placeholderTextColor={C.faint} style={[s.input, { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }]} accessibilityLabel="Notes" />
          </View>

          <View style={{ gap: 8 }}>
            <SectionTitle>Cover</SectionTitle>
            {finding ? (
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <ActivityIndicator color={C.dim} />
                <Text style={T.small}>{finding}</Text>
              </View>
            ) : (
              <GhostButton label={hasKey ? 'Find cover on Comic Vine' : 'Set up Comic Vine covers'} onPress={findCover} />
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={link} onChangeText={setLink} placeholder="…or paste an image link" placeholderTextColor={C.faint} autoCapitalize="none" keyboardType="url" style={[s.input, { flex: 1 }]} accessibilityLabel="Cover image link" />
              <Pressable accessibilityRole="button" onPress={saveLink} disabled={!link.trim()} style={[s.smallBtn, !link.trim() ? { opacity: 0.4 } : null]}>
                <Text style={[T.small, { color: C.text }]}>Save</Text>
              </Pressable>
            </View>
            {issue.cover_path ? (
              <Pressable onPress={() => act((d, l) => updateIssue(d, l, issue.id, { cover_path: null }))} style={{ paddingVertical: 8 }}>
                <Text style={T.small}>Remove cover</Text>
              </Pressable>
            ) : null}
          </View>

          {series && hasKey ? (
            <Pressable onPress={() => router.push({ pathname: '/covers', params: { series: series.id } })} style={{ paddingVertical: 4 }}>
              <Text style={[T.small, { color: C.dc }]}>Wrong covers for this series? Pick the right one on Comic Vine →</Text>
            </Pressable>
          ) : null}

          <View style={{ gap: 8 }}>
            <SectionTitle>Edit issue</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={editTitle} onChangeText={setEditTitle} placeholder="Series" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} accessibilityLabel="Series name" />
              <TextInput value={editYear} onChangeText={setEditYear} placeholder="Year" keyboardType="number-pad" maxLength={4} placeholderTextColor={C.faint} style={[s.input, { width: 76 }]} accessibilityLabel="Series start year" />
              <TextInput value={editNumber} onChangeText={setEditNumber} placeholder="#" placeholderTextColor={C.faint} style={[s.input, { width: 64 }]} accessibilityLabel="Issue number" />
            </View>
            <Text style={T.tiny}>The year is when the series started — Batman (2016) and Batman (1940) are different series.</Text>
            {seriesChanged || numberChanged ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable accessibilityRole="button" onPress={saveThisIssue} style={[s.smallBtn, { flex: 1, alignItems: 'center' }]}>
                  <Text style={[T.small, { color: C.text }]}>Only this issue</Text>
                </Pressable>
                {seriesChanged && !numberChanged && inSeries > 1 ? (
                  <Pressable accessibilityRole="button" onPress={saveWholeSeries} style={[s.smallBtn, { flex: 1, alignItems: 'center' }]}>
                    <Text style={[T.small, { color: C.text }]}>All {inSeries} in this series</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {appearsIn.length ? (
            <View style={{ gap: 4 }}>
              <SectionTitle>Appears in</SectionTitle>
              <Text style={T.tiny}>One issue, linked in each place — reading it anywhere counts everywhere, once.</Text>
              {appearsIn.map((c) => (
                <Pressable key={c.id} onPress={() => router.push(`/collection/${c.id}`)} style={s.row}>
                  <Text style={[T.label, { color: KIND_COLOR[c.kind], width: 56 }]}>{KIND_LABEL[c.kind]}</Text>
                  <Text style={[T.body, { flex: 1 }]} numberOfLines={1}>{c.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {entry && parentColl ? (
            <GhostButton
              label={`Remove from ${parentColl.title}`}
              onPress={() =>
                Alert.alert(`Remove from ${parentColl.title}?`, 'The issue stays in your library and anywhere else it appears.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => act((d) => removeEntry(d, entry)).then(() => router.back()) },
                ])
              }
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', paddingHorizontal: 6, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.condBold, fontSize: 28, lineHeight: 30, color: C.text },
  segment: { flexDirection: 'row', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 3 },
  segItem: { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
  smallBtn: { height: 48, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: C.borderStrong, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderBottomWidth: 1, borderBottomColor: C.divider },
});
