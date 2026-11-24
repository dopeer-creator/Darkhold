import { Redirect, router, usePathname } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef, useEffect, useRef, useState, type ComponentRef, type ComponentType, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabaseConfigured } from '@/lib/supabase';
import { useStore } from '@/store/store';
import { ClockIcon, HomeIcon, LibraryIcon, PlusIcon, StarIcon } from '@/ui/icons';
import { C, F } from '@/ui/theme';

type IconType = ComponentType<{ color?: string }>;

const TabButton = forwardRef<ComponentRef<typeof View>, TabTriggerSlotProps & { icon: IconType; label: string }>(function TabButton(
  { icon: Icon, label, isFocused, ...props },
  ref,
) {
  const color = isFocused ? C.text : C.dim;
  return (
    <Pressable ref={ref} {...props} accessibilityRole="tab" accessibilityState={{ selected: isFocused }} style={s.tab}>
      <Icon color={color} />
      <Text style={[s.tabLabel, { color }, isFocused ? { fontFamily: F.medium } : null]}>{label}</Text>
    </Pressable>
  );
});

/** The tabs in the order a swipe moves through them (the + button isn't a tab). */
const ORDER = ['/', '/library', '/history', '/reviews'] as const;

/**
 * Swipe sideways anywhere on a tab to move to the next one, like turning pages: drag left for the tab to the
 * right (Home → Library → History → Reviews), right to go back. Things that scroll sideways themselves
 * (Continue reading, filter chips, the score slider) keep the swipe: the phone gives it to them first.
 */
function SwipeTabs({ children }: { children: ReactNode }) {
  const path = usePathname();
  const pathRef = useRef<string>(path);
  useEffect(() => {
    pathRef.current = path;
  }, [path]);
  const [x] = useState(() => new Animated.Value(0));
  // The handlers read the ref only while a finger is down, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const settle = () => Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
    return PanResponder.create({
      // Clearly sideways and far enough to mean it: up-and-down scrolling never turns the page.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderMove: (_e, g) => x.setValue(Math.max(-60, Math.min(60, g.dx * 0.35))),
      onPanResponderRelease: (_e, g) => {
        const at = ORDER.indexOf(pathRef.current as (typeof ORDER)[number]);
        const step = g.dx < -70 || g.vx < -0.6 ? 1 : g.dx > 70 || g.vx > 0.6 ? -1 : 0;
        const next = at >= 0 ? ORDER[at + step] : undefined;
        if (step && next) router.navigate(next);
        settle();
      },
      onPanResponderTerminate: settle,
      onPanResponderTerminationRequest: () => true,
    });
  });
  return (
    <Animated.View {...pan.panHandlers} style={{ flex: 1, transform: [{ translateX: x }] }}>
      {children}
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { session } = useStore();
  const insets = useSafeAreaInsets();
  if (supabaseConfigured && session === undefined) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  if (supabaseConfigured && session === null) return <Redirect href="/login" />;

  return (
    <Tabs style={{ flex: 1 }}>
      <SwipeTabs>
        <TabSlot style={{ flex: 1 }} />
      </SwipeTabs>
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="index" href="/" />
        <TabTrigger name="library" href="/library" />
        <TabTrigger name="history" href="/history" />
        <TabTrigger name="reviews" href="/reviews" />
      </TabList>
      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TabTrigger name="index" asChild>
          <TabButton icon={HomeIcon} label="Home" />
        </TabTrigger>
        <TabTrigger name="library" asChild>
          <TabButton icon={LibraryIcon} label="Library" />
        </TabTrigger>
        <View style={s.tab}>
          <Pressable accessibilityRole="button" accessibilityLabel="Add" onPress={() => router.push('/add')} style={s.plus}>
            <PlusIcon size={26} color={C.onLight} />
          </Pressable>
        </View>
        <TabTrigger name="history" asChild>
          <TabButton icon={ClockIcon} label="History" />
        </TabTrigger>
        <TabTrigger name="reviews" asChild>
          <TabButton icon={StarIcon} label="Reviews" />
        </TabTrigger>
      </View>
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: C.bar, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 50 },
  tabLabel: { fontFamily: F.sans, fontSize: 11 },
  plus: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center', marginTop: -20 },
});
