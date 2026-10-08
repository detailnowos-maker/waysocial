import { Ionicons } from '@expo/vector-icons';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_MAX_WIDTH } from '@/lib/layout';
import { colors, radius, shadow, space } from '@/theme';

import { type IconName, Txt } from './ui';

type Tone = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  icon?: IconName;
  onPress?: () => void;
}

interface ToastApi {
  show: (message: string, opts?: { tone?: Tone; icon?: IconName; onPress?: () => void; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<ToastItem | null>(null);
  const [anim] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setItem(null));
  }, [anim]);

  const show = useCallback<ToastApi['show']>(
    (message, opts = {}) => {
      if (timer.current) clearTimeout(timer.current);
      setItem({ id: ++seq.current, message, tone: opts.tone ?? 'info', icon: opts.icon, onPress: opts.onPress });
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      timer.current = setTimeout(hide, opts.durationMs ?? 3200);
    },
    [anim, hide],
  );

  const api = useMemo(() => ({ show }), [show]);
  const iconFor: Record<Tone, IconName> = { info: 'information-circle', success: 'checkmark-circle', error: 'alert-circle' };
  const tint: Record<Tone, string> = { info: colors.ink, success: colors.live, error: colors.danger };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {item ? (
        <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + space.sm }]}>
          <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }}>
            <Pressable
              accessibilityRole="alert"
              testID="toast"
              onPress={() => {
                item.onPress?.();
                hide();
              }}
              style={[styles.toast, shadow.float]}>
              <Ionicons name={item.icon ?? iconFor[item.tone]} size={20} color={tint[item.tone] === colors.ink ? '#fff' : tint[item.tone]} />
              <Txt variant="captionStrong" color="#fff" style={{ flexShrink: 1 }}>
                {item.message}
              </Txt>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.lg, zIndex: 1000 },
  toast: { maxWidth: APP_MAX_WIDTH - space.lg * 2, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.ink, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.lg },
});
