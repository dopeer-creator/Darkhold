import { Image } from 'expo-image';
import type { ComponentRef, Ref } from 'react';
import { Text, View } from 'react-native';

import { creditsSummary } from '@/domain/credits';
import { coverFor, issueTitle, progress, type Library } from '@/domain/library';
import { formatScore, verdictLabel } from '@/domain/reviews';
import type { Review } from '@/domain/types';
import { sizedCover } from '@/ui/parts';
import { Stars, VERDICT_COLORS } from '@/ui/review';
import { C, F, kindLabel, publisherColor, tintFor } from '@/ui/theme';

/** What a review is about, in the words the review page and the story picture show. */
export interface ReviewTarget {
  title: string;
  kind: string;
  publisher: string | null;
  creators: string;
  meta: string;
  cover: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (day: string | null | undefined) => (day && /^\d{4}-\d{2}/.test(day) ? `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}` : '');

export function reviewTarget(lib: Library, key: string): ReviewTarget | null {
  const c = lib.collections.get(key);
  if (c) {
    const p = progress(lib, c.id);
    const writers = c.writer ?? creditsSummary(lib, c.id).mainWriters.join(', ');
    const years = c.start_year ? `${c.start_year}${c.ongoing ? '–present' : c.end_year && c.end_year !== c.start_year ? `–${c.end_year}` : ''}` : '';
    const finished = monthYear(lib.reviews.get(key)?.reviewed_on);
    return {
      title: c.title,
      kind: `${kindLabel(c)}${c.publisher ? ` · ${c.publisher.toUpperCase()}` : ''}`,
      publisher: c.publisher,
      creators: [writers, years].filter(Boolean).join(' · '),
      meta: [`${p.total} issue${p.total === 1 ? '' : 's'}`, finished ? `reviewed ${finished}` : ''].filter(Boolean).join(' · '),
      cover: coverFor(lib, c.id),
    };
  }
  const i = lib.issues.get(key);
  if (!i) return null;
  const series = lib.series.get(i.series_id);
  return {
    title: issueTitle(lib, i.id),
    kind: `ISSUE${series?.publisher ? ` · ${series.publisher.toUpperCase()}` : ''}`,
    publisher: series?.publisher ?? null,
    creators: [i.writers, i.story_title].filter(Boolean).join(' · '),
    meta: i.completed_at ? `Read ${monthYear(i.completed_at)}` : 'Read',
    cover: i.cover_path,
  };
}

/**
 * The 9:16 picture for an Instagram story. Drawn at `width` on screen; every size scales with it,
 * so the saved 1080 × 1920 picture looks the same as the preview.
 */
export function StoryCard({ width, target, review, showText, ref }: { width: number; target: ReviewTarget; review: Review; showText: boolean; ref?: Ref<ComponentRef<typeof View>> }) {
  const k = width / 360;
  const height = (width * 16) / 9;
  const accent = publisherColor(target.publisher);
  const tint = tintFor(target.title);
  const col = VERDICT_COLORS[review.verdict];
  const words = showText ? review.body?.trim() || '' : '';
  // With words, the top gets compact (cover beside the title) and the words get the rest of the picture.
  // Longer reviews use a smaller size; anything past the space ends in an ellipsis, never off the edge.
  const size = words.length <= 140 ? 17 : words.length <= 320 ? 15 : 13.5;
  const lineH = Math.round(size * 1.5);
  const room = 196; // height left for the words, in card units (the card is 360 × 640)
  const lines = Math.max(3, Math.floor(room / lineH));
  // The line limit does the cutting (it ends in "…"); this only keeps a huge review from being laid out in full.
  const shown = words.length > 900 ? `${words.slice(0, 899).trimEnd()}…` : words;

  const cover = (w: number, h: number) => (
    <View style={{ width: w * k, height: h * k, borderRadius: 8 * k, backgroundColor: tint.fg + '33', borderWidth: 1, borderColor: tint.fg, overflow: 'hidden', justifyContent: 'flex-end' }}>
      {target.cover ? (
        <Image source={{ uri: sizedCover(target.cover, 300) }} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} contentFit="cover" />
      ) : (
        <Text style={{ fontFamily: F.condBold, fontSize: (w / 7) * k, color: tint.fg, padding: 8 * k }} numberOfLines={3}>{target.title.toUpperCase()}</Text>
      )}
    </View>
  );
  const verdict = (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ backgroundColor: col.bg, borderRadius: 999, paddingHorizontal: 16 * k, paddingVertical: 5 * k }}>
        <Text style={{ fontFamily: F.condBold, fontSize: 20 * k, letterSpacing: 1.2 * k, color: col.fg }}>{verdictLabel(review.verdict).toUpperCase()}</Text>
      </View>
    </View>
  );
  const score =
    review.score != null ? (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 * k }}>
        <Text style={{ fontFamily: F.condBold, fontSize: 64 * k, lineHeight: 64 * k, color: C.text }}>{formatScore(review.score)}</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 15 * k, color: C.dim, marginBottom: 10 * k }}>/ 10</Text>
        <View style={{ marginBottom: 12 * k, marginLeft: 6 * k }}>
          <Stars score={review.score} size={22 * k} />
        </View>
      </View>
    ) : null;

  return (
    <View ref={ref} collapsable={false} style={{ width, height, backgroundColor: C.bg, overflow: 'hidden', borderRadius: 2 }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: height * (shown ? 0.34 : 0.42), backgroundColor: tint.bg }} />
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8 * k, backgroundColor: accent }} />
      <View style={{ flex: 1, paddingHorizontal: 30 * k, paddingTop: 30 * k, paddingBottom: 26 * k }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 12 * k, letterSpacing: 2.4 * k, color: tint.fg }}>DARKHOLD</Text>
          <Text numberOfLines={1} style={{ fontFamily: F.semibold, fontSize: 11 * k, letterSpacing: 1.4 * k, color: tint.fg, maxWidth: 210 * k, textAlign: 'right' }}>{target.kind}</Text>
        </View>

        {shown ? (
          <>
            <View style={{ flexDirection: 'row', gap: 16 * k, marginTop: 26 * k, alignItems: 'flex-end' }}>
              {cover(112, 168)}
              <View style={{ flex: 1, gap: 6 * k }}>
                <Text numberOfLines={4} style={{ fontFamily: F.condBold, fontSize: 30 * k, lineHeight: 31 * k, color: C.text }}>{target.title}</Text>
                {target.creators ? <Text numberOfLines={2} style={{ fontFamily: F.sans, fontSize: 12 * k, lineHeight: 16 * k, color: C.muted }}>{target.creators}</Text> : null}
              </View>
            </View>
            <View style={{ marginTop: 20 * k }}>{verdict}</View>
            {score ? <View style={{ marginTop: 10 * k }}>{score}</View> : null}
            <View style={{ flex: 1, marginTop: 14 * k, marginBottom: 12 * k, overflow: 'hidden' }}>
              <Text numberOfLines={lines} style={{ fontFamily: F.sans, fontStyle: 'italic', fontSize: size * k, lineHeight: lineH * k, color: C.text }}>
                “{shown}”
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={{ marginTop: 30 * k }}>{cover(150, 225)}</View>
            <Text numberOfLines={2} style={{ fontFamily: F.condBold, fontSize: 40 * k, lineHeight: 40 * k, color: C.text, marginTop: 24 * k }}>{target.title}</Text>
            {target.creators ? <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 13 * k, color: C.muted, marginTop: 6 * k }}>{target.creators}</Text> : null}
            <View style={{ marginTop: 20 * k }}>{verdict}</View>
            {score ? <View style={{ marginTop: 12 * k }}>{score}</View> : null}
            <View style={{ flex: 1 }} />
          </>
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12 * k, color: C.faint }}>{target.meta}</Text>
          <Text style={{ fontFamily: F.semibold, fontSize: 12 * k, color: C.faint, letterSpacing: 1 * k }}>darkhold</Text>
        </View>
      </View>
    </View>
  );
}
