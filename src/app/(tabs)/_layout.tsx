import { Redirect, router } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef, type ComponentRef, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

export default function TabsLayout() {
  const { session } = useStore();
  const insets = useSafeAreaInsets();
  if (supabaseConfigured && session === undefined) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  if (supabaseConfigured && session === null) return <Redirect href="/login" />;

  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot style={{ flex: 1 }} />
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
