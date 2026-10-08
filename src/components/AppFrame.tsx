import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { APP_MAX_WIDTH } from '@/lib/layout';
import { colors } from '@/theme';

/** Em navegador largo (web), o app vira uma coluna de celular centralizada; no aparelho, é transparente. */
export function AppFrame({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={styles.outer}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center', backgroundColor: '#E6E7EC' },
  inner: { flex: 1, width: '100%', maxWidth: APP_MAX_WIDTH, backgroundColor: colors.bg, overflow: 'hidden' },
});
