import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_MAX_WIDTH } from '@/lib/layout';
import { colors, radius, shadow, space } from '@/theme';

import { type IconName, Txt } from './ui';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  testID?: string;
}

/** Bottom sheet sobre `Modal` (funciona igual no iOS, Android e web — `Alert` não funciona no web). */
export function Sheet({ visible, onClose, children, title, testID }: SheetProps) {
  const insets = useSafeAreaInsets();
  const [y] = useState(() => new Animated.Value(40));
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    y.setValue(40);
    fade.setValue(0);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [visible, y, fade]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root} testID={testID}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityLabel="Fechar" />
        </Animated.View>
        <Animated.View style={[styles.sheet, shadow.float, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm, opacity: fade, transform: [{ translateY: y }] }]}>
          <View style={styles.grab} />
          {title ? (
            <Txt variant="heading" style={{ paddingHorizontal: space.xl, paddingBottom: space.md }}>
              {title}
            </Txt>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

export interface SheetAction {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  subtitle?: string;
  onPress: () => void;
  testID?: string;
}

export function ActionSheet({ visible, onClose, title, actions, cancelLabel = 'Cancelar' }: { visible: boolean; onClose: () => void; title?: string; actions: SheetAction[]; cancelLabel?: string }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ paddingHorizontal: space.lg, gap: 2 }}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            testID={a.testID}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              // dá tempo do Modal fechar antes de navegar/abrir outro
              setTimeout(a.onPress, 60);
            }}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surface : 'transparent' }]}>
            {a.icon ? (
              <View style={[styles.rowIcon, a.destructive ? { backgroundColor: colors.dangerSoft } : null]}>
                <Ionicons name={a.icon} size={20} color={a.destructive ? colors.danger : colors.ink} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong" color={a.destructive ? colors.danger : colors.ink}>
                {a.label}
              </Txt>
              {a.subtitle ? (
                <Txt variant="caption" color={colors.inkMute}>
                  {a.subtitle}
                </Txt>
              ) : null}
            </View>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.row, { justifyContent: 'center', marginTop: space.sm }]}>
          <Txt variant="bodyStrong" color={colors.inkMute}>
            {cancelLabel}
          </Txt>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: APP_MAX_WIDTH, backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.sm },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md, borderRadius: radius.md },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
