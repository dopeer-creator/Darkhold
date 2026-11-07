import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/store/store';
import { T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/**
 * The running Comic Vine job, on every screen: what it's doing and a Stop button. When it finishes,
 * the result stays for a few seconds (or until closed). Covers appear in the lists as they're found.
 */
export function JobBanner() {
  const { job, stopJob, clearJob } = useStore();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!job || job.busy) return;
    const t = setTimeout(clearJob, 12000);
    return () => clearTimeout(t);
  }, [job, clearJob]);

  if (!job) return null;
  const what = job.kind === 'covers' ? 'Finding covers' : 'Getting details';
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: insets.bottom + 72 }]}>
      <View style={s.bar} accessibilityLiveRegion="polite">
        {job.busy ? <ActivityIndicator size="small" color={C.dim} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={[T.tiny, { color: C.text, fontFamily: F.semibold }]}>{job.busy ? what : `${what} · done`}</Text>
          <Text style={[T.tiny, { color: C.muted }]} numberOfLines={2}>
            {job.status}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={job.busy ? `Stop ${what.toLowerCase()}` : 'Close'} onPress={job.busy ? stopJob : clearJob} hitSlop={8} style={s.btn}>
          <Text style={[T.small, { color: C.text }]}>{job.busy ? 'Stop' : 'Close'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.borderStrong },
  btn: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center' },
});
