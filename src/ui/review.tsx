import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';

import { clampScore, formatScore, parseScore, suggestedVerdict, VERDICTS, verdictLabel } from '@/domain/reviews';
import type { Review, Verdict } from '@/domain/types';
import { reviewDay } from '@/domain/library';
import { useStore } from '@/store/store';
import { relativeDay } from '@/ui/format';
import { PrimaryButton, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/** Background and text colour for each verdict, worst (red) to best (gold). */
export const VERDICT_COLORS: Record<Verdict, { bg: string; fg: string }> = {
  bad: { bg: '#3A1418', fg: '#F0B4B4' },
  forgettable: { bg: '#2A2A2F', fg: '#A6A3AD' },
  good_enough: { bg: '#12302F', fg: '#9ED9D3' },
  generational: { bg: '#26202F', fg: '#CDBFE0' },
  peak: { bg: '#35240E', fg: '#E8C48A' },
};
export const STAR = '#E8C48A';

/** Five stars filled to score ÷ 2, so 8.75 shows 4 full stars and most of the fifth. */
export function Stars({ score, size = 18 }: { score: number | null; size?: number }) {
  const stars = score == null ? 0 : Math.max(0, Math.min(5, score / 2));
  return (
    <View accessible accessibilityLabel={score == null ? 'No score' : `${formatScore(stars)} of 5 stars`} style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: size * 0.12 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, stars - i));
        return (
          <View key={i}>
            <Text style={{ fontSize: size, lineHeight: size * 1.15, color: C.borderStrong }}>★</Text>
            {fill > 0 ? (
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fill * 100}%`, overflow: 'hidden' }}>
                <Text numberOfLines={1} style={{ fontSize: size, lineHeight: size * 1.15, color: STAR }}>★</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** "Generational" in its colour, optionally with the score after it. */
export function VerdictBadge({ verdict, score, small }: { verdict: Verdict; score?: number | null; small?: boolean }) {
  const col = VERDICT_COLORS[verdict];
  return (
    <View style={[s.badge, { backgroundColor: col.bg }, small ? { paddingHorizontal: 8, paddingVertical: 2 } : null]}>
      <Text style={{ fontFamily: F.medium, fontSize: small ? 11 : 13, color: col.fg }}>
        {verdictLabel(verdict)}
        {score != null ? ` ${formatScore(score)}` : ''}
      </Text>
    </View>
  );
}

/** A drag bar for 0–10 in steps of 0.05 (type in the box beside it for exact two-decimal scores). */
function ScoreSlider({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const width = useRef(0);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);
  // The handlers read the refs only while a finger is down, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const at = (x: number) => latest.current(width.current ? Math.round(clampScore((x / width.current) * 10) * 20) / 20 : 0);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => at(e.nativeEvent.locationX),
      onPanResponderMove: (e) => at(e.nativeEvent.locationX),
    });
  });
  const pct = `${value * 10}%` as const;
  return (
    <View
      {...pan.panHandlers}
      onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width)}
      accessibilityRole="adjustable"
      accessibilityLabel="Score"
      accessibilityValue={{ min: 0, max: 10, now: value, text: formatScore(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(clampScore(value + (e.nativeEvent.actionName === 'increment' ? 0.25 : -0.25)))}
      style={s.sliderHit}>
      <View pointerEvents="none" style={s.track}>
        <View style={[s.fill, { width: pct }]} />
      </View>
      <View pointerEvents="none" style={[s.thumb, { left: pct }]} />
    </View>
  );
}

export type ReviewFields = { verdict: Verdict; score: number | null; body: string | null };

/**
 * Verdict, score and words. The verdict follows the score until you tap one yourself; after that
 * your pick stays even if you move the score.
 */
export function ReviewForm({ initial, onSave, onCancel, onDelete, saveLabel = 'Save review' }: { initial?: Review; onSave: (f: ReviewFields) => void; onCancel?: () => void; onDelete?: () => void; saveLabel?: string }) {
  const start = initial?.score ?? 7.5;
  const [score, setScore] = useState(start);
  const [scoreText, setScoreText] = useState(formatScore(start));
  const [picked, setPicked] = useState<Verdict | null>(initial && initial.verdict !== suggestedVerdict(start) ? initial.verdict : null);
  const [body, setBody] = useState(initial?.body ?? '');
  const [error, setError] = useState('');
  const verdict = picked ?? suggestedVerdict(score);

  const slide = (n: number) => {
    setScore(n);
    setScoreText(formatScore(n));
    setError('');
  };
  const type = (t: string) => {
    setScoreText(t);
    const n = parseScore(t);
    if (n == null) return setError('Enter a score from 0 to 10, up to two decimals');
    setError('');
    setScore(n);
  };
  const save = () => {
    if (parseScore(scoreText) == null) return setError('Enter a score from 0 to 10, up to two decimals');
    onSave({ verdict, score, body: body.trim() || null });
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={T.label}>YOUR VERDICT</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {VERDICTS.map((v) => {
          const on = v.key === verdict;
          const col = VERDICT_COLORS[v.key];
          return (
            <Pressable
              key={v.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setPicked(picked === v.key ? null : v.key)}
              style={[s.chip, on ? { backgroundColor: col.bg, borderColor: col.fg } : null]}>
              <Text style={[T.small, on ? { color: col.fg, fontFamily: F.medium } : null]}>{v.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[T.tiny, { marginTop: -4 }]}>{picked ? 'Your own pick. It stays even if you change the score.' : 'Suggested from your score. Tap one to choose your own.'}</Text>

      <Text style={[T.label, { marginTop: 4 }]}>SCORE OUT OF 10</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <ScoreSlider value={score} onChange={slide} />
        </View>
        <TextInput value={scoreText} onChangeText={type} keyboardType="decimal-pad" maxLength={5} selectTextOnFocus accessibilityLabel="Score out of 10" style={s.scoreBox} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Stars score={score} size={20} />
        <Text style={T.tiny}>{formatScore(score / 2).replace(/0$/, '')} of 5 stars</Text>
      </View>
      {error ? <Text style={[T.small, { color: C.danger }]}>{error}</Text> : null}

      <Text style={[T.label, { marginTop: 4 }]}>YOUR REVIEW</Text>
      <TextInput
        value={body}
        onChangeText={setBody}
        multiline
        placeholder="What worked, what didn't…"
        placeholderTextColor={C.faint}
        accessibilityLabel="Your review"
        style={s.bodyBox}
      />
      <PrimaryButton label={saveLabel} onPress={save} />
      {onCancel || onDelete ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
          {onCancel ? (
            <Pressable accessibilityRole="button" onPress={onCancel} style={s.textBtn}>
              <Text style={T.small}>Cancel</Text>
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable accessibilityRole="button" onPress={onDelete} style={s.textBtn}>
              <Text style={[T.small, { color: C.danger }]}>Delete review</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** A saved review: verdict, score, stars and (optionally cut short) your words. */
export function ReviewSummary({ review, lines, big }: { review: Review; lines?: number; big?: boolean }) {
  const { lib } = useStore();
  const readDay = reviewDay(lib, review);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <VerdictBadge verdict={review.verdict} />
        {review.score != null ? (
          <Text style={{ fontFamily: F.cond, fontSize: big ? 40 : 22, color: C.text, lineHeight: big ? 42 : 24 }}>
            {formatScore(review.score)}
            <Text style={T.small}> / 10</Text>
          </Text>
        ) : null}
      </View>
      <Stars score={review.score} size={big ? 22 : 16} />
      {review.body ? (
        <Text numberOfLines={lines} style={[T.body, { fontSize: big ? 15 : 13, lineHeight: big ? 23 : 19, color: big ? C.text : C.muted }]}>
          {review.body}
        </Text>
      ) : null}
      {big ? <Text style={[T.tiny, { color: C.faint }]}>{readDay ? `Read ${relativeDay(readDay)}` : 'Read, date unknown'}</Text> : null}
    </View>
  );
}

/** A row of small buttons (View, Edit, Add to story); the last can be the bright one. */
export function ButtonRow({ items }: { items: { label: string; onPress: () => void; strong?: boolean }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map((b) => (
        <Pressable key={b.label} accessibilityRole="button" onPress={b.onPress} style={[s.rowBtn, b.strong ? { backgroundColor: C.text, borderColor: C.text } : null]}>
          <Text style={[T.small, { color: b.strong ? C.onLight : C.text, fontFamily: b.strong ? F.semibold : F.sans }]}>{b.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  chip: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, justifyContent: 'center' },
  sliderHit: { height: 40, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: C.border, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: STAR },
  thumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, marginLeft: -11, backgroundColor: C.text, top: 9 },
  scoreBox: { width: 72, height: 44, borderRadius: 10, backgroundColor: C.sunken, borderWidth: 1, borderColor: C.borderStrong, color: C.text, fontFamily: F.semibold, fontSize: 16, textAlign: 'center' },
  bodyBox: { minHeight: 96, borderRadius: 12, backgroundColor: C.sunken, borderWidth: 1, borderColor: C.borderStrong, color: C.text, fontFamily: F.sans, fontSize: 14, padding: 12, textAlignVertical: 'top' },
  textBtn: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 },
  rowBtn: { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
