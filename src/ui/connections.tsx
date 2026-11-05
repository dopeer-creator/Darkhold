import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { CONNECTION_TITLE, connections, issueTitle, progress, type ConnectionGroup } from '@/domain/library';
import { removeLink } from '@/store/repo';
import { useStore } from '@/store/store';
import { ChevronRight } from './icons';
import { SectionTitle, T } from './parts';
import { C, KIND_COLOR, kindLabel } from './theme';

const ORDER: ConnectionGroup[] = ['before', 'next', 'background', 'tie_in_of', 'tie_ins', 'background_for'];

/**
 * "Before this · Armageddon", "What's next · Avengers by Chip Zdarsky", "Background · Spider-Man #10":
 * a list's or issue's connections that aren't inside it. Tap one to open it; hold to remove it.
 */
export function ConnectionsBlock({ collectionId, issueId }: { collectionId?: string; issueId?: string }) {
  const { lib, act } = useStore();
  const groups = connections(lib, { collectionId, issueId });
  const add = () => router.push({ pathname: '/connect', params: collectionId ? { collection: collectionId } : { issue: issueId! } });

  if (groups.size === 0) {
    // Nothing connected yet: one quiet line instead of a whole section.
    return (
      <Pressable accessibilityRole="button" onPress={add} style={{ minHeight: 40, justifyContent: 'center' }}>
        <Text style={T.small}>
          <Text style={{ color: C.dc }}>＋ Connect</Text> what comes before or after this, background, or the event it ties into
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <SectionTitle
        right={
          <Pressable accessibilityRole="button" onPress={add} style={{ minHeight: 36, justifyContent: 'center' }}>
            <Text style={[T.small, { color: C.dc }]}>＋ Connect</Text>
          </Pressable>
        }>
        Connections
      </SectionTitle>
      {ORDER.filter((g) => groups.has(g)).map((g) =>
        groups.get(g)!.map(({ link, collectionId: cid, issueId: iid }) => {
          const c = cid ? lib.collections.get(cid) : undefined;
          const title = c ? c.title : iid ? issueTitle(lib, iid) : '';
          const p = c ? progress(lib, c.id) : null;
          const done = iid ? lib.issues.get(iid)?.status === 'read' : !!p && p.total > 0 && p.read === p.total;
          return (
            <Pressable
              key={`${g}:${link.id}`}
              accessibilityRole="link"
              accessibilityHint="Hold to remove this connection"
              onPress={() => (c ? router.push(`/collection/${c.id}`) : iid ? router.push({ pathname: '/issue/[id]', params: { id: iid } }) : undefined)}
              onLongPress={() =>
                Alert.alert('Remove this connection?', `${CONNECTION_TITLE[g]}: ${title}`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => act((db) => removeLink(db, link.id)) },
                ])
              }
              style={s.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[T.label, { fontSize: 10, color: c ? KIND_COLOR[c.kind] : KIND_COLOR.issue }]}>
                  {CONNECTION_TITLE[g].toUpperCase()} · {c ? kindLabel(c) : 'ISSUE'}
                  {done ? ' · READ' : ''}
                </Text>
                <Text style={T.bodyMedium} numberOfLines={2}>{title}</Text>
                {link.note ? <Text style={T.tiny} numberOfLines={3}>{link.note}</Text> : null}
              </View>
              {p?.total ? <Text style={[T.small, T.num]}>{p.read} / {p.total}</Text> : null}
              <ChevronRight size={16} color={C.dim} />
            </Pressable>
          );
        }),
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
});
