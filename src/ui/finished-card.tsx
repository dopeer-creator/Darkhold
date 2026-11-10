import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { T } from '@/ui/parts';
import { C, F, publisherColor } from '@/ui/theme';

/** Pops in when a list you were reading is finished, glows for a moment, and goes away by itself. */
export function FinishedCard({ title, publisher, issues, onOpen, onClose }: { title: string; publisher: string | null; issues: number; onOpen: () => void; onClose: () => void }) {
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
    const t = setTimeout(onClose, 12000);
    return () => {
      pulse.stop();
      clearTimeout(t);
    };
  }, [pop, glow, onClose]);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const ring = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] });
  return (
    <Animated.View style={[s.wrap, { opacity: pop, transform: [{ scale }] }]} accessibilityLiveRegion="polite">
      <Animated.View pointerEvents="none" style={[s.ring, { borderColor: color, opacity: ring }]} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Finished ${title}. Open it`} onPress={onOpen} style={s.card}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[T.label, { color }]}>FINISHED</Text>
          <Text style={s.title} numberOfLines={2}>{title}</Text>
          <Text style={T.tiny}>All {issues} issue{issues === 1 ? '' : 's'} read. Nice one.</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={s.close}>
          <Text style={[T.small, { color: C.text }]}>Close</Text>
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 8 },
  ring: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: 18, borderWidth: 3 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.borderStrong },
  title: { fontFamily: F.cond, fontSize: 21, lineHeight: 22, color: C.text },
  close: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center' },
});
