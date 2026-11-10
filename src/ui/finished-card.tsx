import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Review } from '@/domain/types';
import { T } from '@/ui/parts';
import { ButtonRow, ReviewForm, VerdictBadge, Stars, type ReviewFields } from '@/ui/review';
import { C, F, publisherColor } from '@/ui/theme';

/**
 * Pops in when a list you were reading is finished and glows for a moment. It offers a review right
 * there; once saved it shows the verdict with View, Edit and Add to story. Stays until you close it.
 */
export function FinishedCard({ title, publisher, issues, review, onOpen, onClose, onSave, onView, onStory }: {
  title: string;
  publisher: string | null;
  issues: number;
  review?: Review;
  onOpen: () => void;
  onClose: () => void;
  onSave: (f: ReviewFields) => Promise<unknown>;
  onView: () => void;
  onStory: () => void;
}) {
  const [writing, setWriting] = useState(false);
  const [pop] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  const color = publisherColor(publisher);

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start();
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
      { iterations: 3 },
    );
    pulse.start();
    return () => pulse.stop();
  }, [pop, glow]);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const ring = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] });
  return (
    <Animated.View style={[s.wrap, { opacity: pop, transform: [{ scale }] }]} accessibilityLiveRegion="polite">
      <Animated.View pointerEvents="none" style={[s.ring, { borderColor: color, opacity: ring }]} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Finished ${title}. Open it`} onPress={onOpen} style={s.card}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[T.label, { color }]}>{review ? 'FINISHED · REVIEWED' : 'FINISHED'}</Text>
          <Text style={s.title} numberOfLines={2}>{title}</Text>
          {review ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <VerdictBadge verdict={review.verdict} small />
              {review.score != null ? <Text style={s.score}>{review.score.toFixed(2)}</Text> : null}
              <Stars score={review.score} size={14} />
            </View>
          ) : (
            <Text style={T.tiny}>All {issues} issue{issues === 1 ? '' : 's'} read. Nice one.</Text>
          )}
          {review?.body && !writing ? <Text style={[T.small, { marginTop: 4 }]} numberOfLines={2}>“{review.body}”</Text> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={s.close}>
          <Text style={[T.small, { color: C.text }]}>Close</Text>
        </Pressable>
      </Pressable>
      <View style={s.under}>
        {writing ? (
          <ReviewForm initial={review} onSave={(f) => onSave(f).then(() => setWriting(false))} onCancel={() => setWriting(false)} />
        ) : review ? (
          <ButtonRow items={[{ label: 'View', onPress: onView }, { label: 'Edit', onPress: () => setWriting(true) }, { label: 'Add to story', onPress: onStory, strong: true }]} />
        ) : (
          <ButtonRow items={[{ label: 'Review it', onPress: () => setWriting(true), strong: true }]} />
        )}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 8 },
  ring: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: 18, borderWidth: 3 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingBottom: 10, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: C.surface2, borderWidth: 1, borderBottomWidth: 0, borderColor: C.borderStrong },
  under: { padding: 14, paddingTop: 4, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, backgroundColor: C.surface2, borderWidth: 1, borderTopWidth: 0, borderColor: C.borderStrong },
  score: { fontFamily: F.cond, fontSize: 18, color: C.text },
  title: { fontFamily: F.cond, fontSize: 21, lineHeight: 22, color: C.text },
  close: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center' },
});
