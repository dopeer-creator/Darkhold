import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import type { Review } from '@/domain/types';
import { addToStory, canShareImages, captureStory, shareImage } from '@/lib/share-review';
import { deleteReview, saveReview } from '@/store/repo';
import { useStore } from '@/store/store';
import { BackIcon, CloseIcon } from '@/ui/icons';
import { Cover, PrimaryButton, T } from '@/ui/parts';
import { ButtonRow, ReviewForm, ReviewSummary } from '@/ui/review';
import { reviewTarget, StoryCard, type ReviewTarget } from '@/ui/story-card';
import { C, F } from '@/ui/theme';

/**
 * Your review of a list (?collection=<id>) or an issue (?issue=<id>). ?edit=1 opens the form,
 * ?share=1 opens the story picture straight away.
 */
export default function ReviewScreen() {
  const params = useLocalSearchParams<{ collection?: string; issue?: string; edit?: string; share?: string }>();
  const { lib, act } = useStore();
  const db = useSQLiteContext();
  const key = params.collection ?? params.issue ?? '';
  const target = reviewTarget(lib, key);
  const review = lib.reviews.get(key);
  const [editing, setEditing] = useState(params.edit === '1');
  const [sharing, setSharing] = useState<null | 'story' | 'menu'>(params.share === '1' ? 'story' : null);

  if (!target) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
        <Text style={T.body}>This list or issue isn’t in your library any more.</Text>
      </SafeAreaView>
    );
  }

  const open = () => (params.collection ? router.push(`/collection/${params.collection}`) : router.push({ pathname: '/issue/[id]', params: { id: key } }));
  const remove = () =>
    Alert.alert('Delete this review?', 'The list or issue stays; only your verdict, score and words go.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => act((d, l) => deleteReview(d, l, key)).then(() => router.back()) },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.iconBtn}>
          <BackIcon />
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 18, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="link" onPress={open} style={{ flexDirection: 'row', gap: 14 }}>
            <Cover title={target.title} publisher={target.publisher} width={84} uri={target.cover} />
            <View style={{ flex: 1, gap: 4, paddingTop: 2 }}>
              <Text style={[T.label, { color: C.muted }]}>{target.kind}</Text>
              <Text style={s.title}>{target.title}</Text>
              {target.creators ? <Text style={T.small}>{target.creators}</Text> : null}
              <Text style={T.tiny}>{target.meta}</Text>
              <Text style={[T.small, { color: C.dc }]}>Open ›</Text>
            </View>
          </Pressable>
          <View style={{ height: 1, backgroundColor: C.divider }} />

          {editing || !review ? (
            <ReviewForm
              initial={review}
              onSave={(f) => act((d, l) => saveReview(d, l, params.collection ? { collection_id: key } : { issue_id: key }, f)).then(() => setEditing(false))}
              onCancel={review ? () => setEditing(false) : () => router.back()}
              onDelete={review ? remove : undefined}
            />
          ) : (
            <>
              <ReviewSummary review={review} big />
              <ButtonRow
                items={[
                  { label: 'Edit', onPress: () => setEditing(true) },
                  { label: 'Share…', onPress: () => setSharing('menu') },
                  { label: 'Add to story', onPress: () => setSharing('story'), strong: true },
                ]}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {review && sharing ? <ShareSheet mode={sharing} onClose={() => setSharing(null)} target={target} review={review} db={db} /> : null}
    </SafeAreaView>
  );
}

/** The story picture as it will be saved, with "with review / score only", and the button that sends it. */
function ShareSheet({ mode, onClose, target, review, db }: { mode: 'story' | 'menu'; onClose: () => void; target: ReviewTarget; review: Review; db: SQLiteDatabase }) {
  const { width, height } = useWindowDimensions();
  const cardW = Math.floor(Math.min(width - 48, ((height - 240) * 9) / 16));
  const [showText, setShowText] = useState(!!review.body);
  const [busy, setBusy] = useState(false);
  const card = useRef<ComponentRef<typeof View>>(null);

  const send = async (how: 'story' | 'menu') => {
    if (!canShareImages) return Alert.alert('On your phone', 'Sharing pictures works in the phone app, not in the browser preview.');
    setBusy(true);
    try {
      const uri = await captureStory(card);
      if (how === 'story') await addToStory(db, uri);
      else await shareImage(uri);
      onClose();
    } catch (e) {
      Alert.alert('Couldn’t share', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.sunken }}>
        <View style={[s.top, { justifyContent: 'space-between' }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={s.iconBtn}>
            <CloseIcon />
          </Pressable>
          {review.body ? (
            <View style={s.toggle}>
              {[true, false].map((on) => (
                <Pressable key={String(on)} accessibilityRole="button" accessibilityState={{ selected: showText === on }} onPress={() => setShowText(on)} style={[s.toggleItem, showText === on ? { backgroundColor: C.text } : null]}>
                  <Text style={[T.small, { color: showText === on ? C.onLight : C.muted, fontFamily: showText === on ? F.semibold : F.sans }]}>{on ? 'With review' : 'Score only'}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{ width: 44 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <StoryCard ref={card} width={cardW} target={target} review={review} showText={showText} />
        </View>
        <View style={{ padding: 16, gap: 10 }}>
          {busy ? <ActivityIndicator color={C.text} /> : null}
          <PrimaryButton label={mode === 'story' ? 'Add to Instagram story' : 'Share picture…'} onPress={() => send(mode)} disabled={busy} />
          <Pressable accessibilityRole="button" onPress={() => send(mode === 'story' ? 'menu' : 'story')} disabled={busy} style={{ minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={T.small}>{mode === 'story' ? 'Or share it somewhere else…' : 'Or add it to your Instagram story'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.condBold, fontSize: 26, lineHeight: 27, color: C.text },
  toggle: { flexDirection: 'row', borderWidth: 1, borderColor: C.borderStrong, borderRadius: 999, overflow: 'hidden' },
  toggleItem: { paddingHorizontal: 14, height: 34, justifyContent: 'center' },
});
