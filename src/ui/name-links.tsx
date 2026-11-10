import { router } from 'expo-router';
import { Fragment } from 'react';
import { Text, type TextStyle } from 'react-native';

import type { Role } from '@/domain/people';
import { C } from '@/ui/theme';

/** Names as links, comma-separated: each one opens that writer's (or artist's) page. Use inside a <Text>. */
export function NameLinks({ names, role, style }: { names: string[]; role: Role; style?: TextStyle }) {
  return (
    <>
      {names.map((n, i) => (
        <Fragment key={n}>
          {i ? ', ' : ''}
          <Text accessibilityRole="link" onPress={() => router.push({ pathname: '/person/[name]', params: { name: n, role } })} style={[{ color: C.dc }, style]}>
            {n}
          </Text>
        </Fragment>
      ))}
    </>
  );
}
