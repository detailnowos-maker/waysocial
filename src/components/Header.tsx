import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { brandGradient, colors, space } from '@/theme';

import { IconButton, Txt } from './ui';

export function Wordmark() {
  return (
    <View style={styles.wordmark}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
        <Ionicons name="navigate" size={14} color="#fff" />
      </LinearGradient>
      <Txt variant="title" style={{ letterSpacing: -0.6 }}>
        WaySocial
      </Txt>
    </View>
  );
}

/** Barra superior das abas (marca à esquerda, ações à direita). */
export function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.top, { paddingTop: insets.top + space.xs }]}>
      <View style={{ flex: 1 }}>{left ?? <Wordmark />}</View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>{right}</View>
    </View>
  );
}

/** Cabeçalho de telas empilhadas: voltar + título + ações. */
export function Header({ title, subtitle, right, onBack, transparent }: { title?: string; subtitle?: string; right?: ReactNode; onBack?: () => void; transparent?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.xs }, transparent ? null : styles.headerBorder]}>
      <IconButton icon="chevron-back" label="Voltar" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} testID="header-back" />
      <View style={{ flex: 1 }}>
        {title ? (
          <Txt variant="heading" numberOfLines={1}>
            {title}
          </Txt>
        ) : null}
        {subtitle ? (
          <Txt variant="caption" color={colors.inkMute} numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm, backgroundColor: colors.bg },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingBottom: space.sm, backgroundColor: colors.bg },
  headerBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
});
