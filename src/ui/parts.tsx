import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { CheckIcon, PlayIcon } from './icons';
import { C, F, publisherColor, tintFor } from './theme';

/**
 * Comic Vine serves every cover in several sizes at the same address with a different folder
 * ("/scale_medium/" → "/scale_small/"). Small list thumbnails load the small file, which takes a
 * fraction of the space in the phone's picture cache; big covers keep the saved size. Other links are left alone.
 */
export function sizedCover(uri: string, width: number): string {
  if (!/comicvine\.gamespot\.com\/a\/uploads\//.test(uri)) return uri;
  // Measured on one cover: original-size medium 317 KB, small 157 KB, avatar 15 KB.
  const size = width <= 44 ? 'scale_avatar' : width <= 130 ? 'scale_small' : null;
  return size ? uri.replace(/\/(scale_medium|scale_large|screen_medium|screen_kubrick|original)\//, `/${size}/`) : uri;
}

/**
 * A cover: the real image when there is a link (downloaded once, then cached on the phone),
 * otherwise a drawn one with the title, a big mark and a publisher stripe.
 */
export function Cover({ title, publisher, mark, width, done, uri }: { title: string; publisher: string | null; mark?: string; width: number; done?: boolean; uri?: string | null }) {
  const tint = tintFor(title);
  const height = Math.round(width * 1.5);
  const big = mark ?? initials(title);
  if (uri) {
    return (
      <View style={{ width, height, borderRadius: width > 60 ? 8 : 4, overflow: 'hidden', backgroundColor: tint.bg }}>
        <Image source={{ uri: sizedCover(uri, width) }} style={{ width, height }} contentFit="cover" cachePolicy="disk" transition={150} recyclingKey={uri} accessibilityLabel={`${title} cover`} />
        {done ? (
          <View accessibilityLabel="Completed" style={{ position: 'absolute', right: 6, bottom: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' }}>
            <CheckIcon size={12} />
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={{ width, height, borderRadius: width > 60 ? 8 : 4, backgroundColor: tint.bg, overflow: 'hidden', padding: width * 0.09, paddingTop: width * 0.12, justifyContent: 'space-between' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: width > 60 ? 3 : 2, backgroundColor: publisherColor(publisher) }} />
      {width > 50 ? (
        <Text numberOfLines={3} style={{ fontFamily: F.condBold, fontSize: Math.max(10, width * 0.15), lineHeight: Math.max(10, width * 0.15), color: tint.fg, textTransform: 'uppercase' }}>
          {title}
        </Text>
      ) : (
        <View />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: width > 50 ? 'space-between' : 'center' }}>
        <Text numberOfLines={1} style={{ fontFamily: F.condBold, fontSize: width * (width > 50 ? 0.38 : 0.42), lineHeight: width * (width > 50 ? 0.4 : 0.46), color: tint.fg, opacity: 0.9 }}>
          {big}
        </Text>
        {done ? (
          <View accessibilityLabel="Completed" style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' }}>
            <CheckIcon size={12} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function initials(title: string) {
  const words = title.replace(/['’]s\b/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export function Bar({ read, total, color, height = 4 }: { read: number; total: number; color: string; height?: number }) {
  const pct = total ? Math.round((read / total) * 100) : 0;
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: C.border, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }}>
      <Text style={s.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function PrimaryButton({ label, onPress, icon = 'none', style, disabled }: { label: string; onPress: () => void; icon?: 'play' | 'none'; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.primary, { opacity: disabled ? 0.4 : pressed ? 0.85 : 1 }, style]}>
      {icon === 'play' ? <PlayIcon /> : null}
      <Text numberOfLines={1} style={s.primaryText}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, style }: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.ghost, { opacity: pressed ? 0.7 : 1 }, style]}>
      <Text style={s.ghostText}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, dot }: { label: string; active?: boolean; onPress: () => void; dot?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[s.chip, active ? { backgroundColor: C.surface2, borderColor: C.borderStrong } : null]}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text style={[s.chipText, active ? { color: C.text } : null]}>{label}</Text>
    </Pressable>
  );
}

export function Checkbox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={onPress} hitSlop={6} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      {checked ? (
        <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' }}>
          <CheckIcon />
        </View>
      ) : (
        <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: '#4A4A52' }} />
      )}
    </Pressable>
  );
}

export const T = StyleSheet.create({
  h1: { fontFamily: F.condBold, fontSize: 30, color: C.text, letterSpacing: 0.3 },
  body: { fontFamily: F.sans, fontSize: 15, color: C.text },
  bodyMedium: { fontFamily: F.medium, fontSize: 15, color: C.text },
  small: { fontFamily: F.sans, fontSize: 13, color: C.muted },
  tiny: { fontFamily: F.sans, fontSize: 12, color: C.dim },
  label: { fontFamily: F.semibold, fontSize: 11, letterSpacing: 0.9, color: C.dim },
  num: { fontVariant: ['tabular-nums'] } as TextStyle,
});

const s = StyleSheet.create({
  sectionTitle: { fontFamily: F.cond, fontSize: 15, letterSpacing: 1.8, textTransform: 'uppercase', color: C.muted },
  primary: { height: 52, borderRadius: 26, backgroundColor: C.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  primaryText: { fontFamily: F.semibold, fontSize: 15, color: C.onLight, flexShrink: 1 },
  ghost: { height: 48, borderRadius: 24, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  ghostText: { fontFamily: F.medium, fontSize: 15, color: C.muted },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontFamily: F.sans, fontSize: 13, color: C.muted },
});
