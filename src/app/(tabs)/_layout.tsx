import { Redirect, router, usePathname } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger, type TabSlotProps, type TabTriggerSlotProps, useTabTrigger } from 'expo-router/ui';
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ComponentRef, type ComponentType } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
/** The same tabs by their route names. */
const NAMES = ['index', 'library', 'history', 'reviews'] as const;

/**
 * The tabs as pages side by side, like a phone's home screens: drag sideways and the next tab slides in with
 * your finger, already showing its content (Home → Library → History → Reviews). Let go past a third of the
 * way, or flick, and it carries on to that tab; otherwise it slides back. Things that scroll sideways
 * themselves (Continue reading, filter chips, the score slider) keep the swipe: the phone gives it to them first.
 * The tabs next to the one you're on are drawn shortly after it opens, so they're there when you swipe.
 */
function PagedTabs() {
  const path = usePathname();
  const focused = Math.max(0, ORDER.indexOf(path as (typeof ORDER)[number]));
  // The pages' own width (the app can sit in a narrower column than the window, on a computer).
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const width = measured || window.width;
  const [pos] = useState(() => new Animated.Value(0));
  const now = useRef({ focused, width });
  useEffect(() => {
    now.current = { focused, width };
  }, [focused, width]);
  // A finished swipe leaves the pages one width along; once the new tab is in place they're back at rest.
  useLayoutEffect(() => {
    pos.setValue(0);
  }, [focused, pos]);
  // A tab's page only exists once it's been opened. Shortly after the app starts, open each one and come
  // straight back (one update, so nothing flickers), so every page is there to slide in. Back still goes to Home.
  const { switchTab } = useTabTrigger({ name: 'index' });
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      const here = NAMES[now.current.focused];
      for (const name of NAMES) if (name !== here) switchTab(name, { resetOnFocus: false });
      switchTab(here, { resetOnFocus: false });
      setWarm(true);
    }, 900);
    return () => clearTimeout(t);
    // Once, when the tabs first appear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The handlers read the ref only while a finger is down, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const settle = () => Animated.spring(pos, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
    return PanResponder.create({
      // Clearly sideways and far enough to mean it: up-and-down scrolling never turns the page.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderGrant: () => pos.stopAnimation(),
      onPanResponderMove: (_e, g) => {
        const at = now.current.focused;
        // Past the first or last tab it only gives a little, so you can feel the end.
        const end = (g.dx > 0 && at === 0) || (g.dx < 0 && at === ORDER.length - 1);
        pos.setValue(end ? g.dx * 0.2 : g.dx);
      },
      onPanResponderRelease: (_e, g) => {
        const { focused: at, width: w } = now.current;
        const step = g.dx < -w / 3 || (g.vx < -0.4 && g.dx < 0) ? 1 : g.dx > w / 3 || (g.vx > 0.4 && g.dx > 0) ? -1 : 0;
        const next = ORDER[at + step];
        if (!step || !next) return settle();
        Animated.timing(pos, { toValue: -step * w, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
          if (finished) router.navigate(next);
        });
      },
      onPanResponderTerminate: settle,
      onPanResponderTerminationRequest: () => true,
    });
  });

  const render = (descriptor: Parameters<NonNullable<TabSlotProps['renderFn']>>[0], { index, isFocused, loaded }: { index: number; isFocused: boolean; loaded: boolean }) => {
    if (!isFocused && !loaded && !warm) return null;
    return (
      <Animated.View
        key={descriptor.route.key}
        pointerEvents={isFocused ? 'auto' : 'none'}
        accessibilityElementsHidden={!isFocused}
        importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}
        style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, transform: [{ translateX: Animated.add(pos, (index - focused) * width) }] }]}
      >
        {descriptor.render()}
      </Animated.View>
    );
  };

  return (
    <View {...pan.panHandlers} onLayout={(e) => setMeasured(Math.round(e.nativeEvent.layout.width))} style={{ flex: 1, overflow: 'hidden' }}>
      <TabSlot detachInactiveScreens={false} renderFn={render} style={{ flex: 1 }} />
    </View>
  );
}

export default function TabsLayout() {
  const { session } = useStore();
  const insets = useSafeAreaInsets();
  if (supabaseConfigured && session === undefined) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  if (supabaseConfigured && session === null) return <Redirect href="/login" />;

  return (
    <Tabs style={{ flex: 1 }}>
      <PagedTabs />
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
