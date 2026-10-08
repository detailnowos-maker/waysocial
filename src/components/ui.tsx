import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewStyle,
} from 'react-native';

import { brandGradient, colors, radius, shadow, space, type } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function haptic(kind: 'light' | 'success' = 'light') {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // sem háptico: segue
  }
}

// --- Texto ---------------------------------------------------------------------------------------

type Variant = keyof typeof type;

interface TxtProps extends TextProps {
  variant?: Variant;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

export function Txt({ variant = 'body', color = colors.ink, align, style, ...rest }: TxtProps) {
  return <Text {...rest} style={[type[variant], { color }, align ? { textAlign: align } : null, style]} />;
}

// --- Botões --------------------------------------------------------------------------------------

type ButtonKind = 'primary' | 'brand' | 'secondary' | 'ghost' | 'ghostLight' | 'danger' | 'soft';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  size?: 'md' | 'sm' | 'lg';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const BTN: Record<ButtonKind, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.ink, fg: colors.inkInverse },
  brand: { bg: colors.brand, fg: colors.inkInverse },
  secondary: { bg: colors.surface, fg: colors.ink },
  soft: { bg: colors.brandSoft, fg: colors.brand },
  ghost: { bg: 'transparent', fg: colors.ink, border: colors.line },
  ghostLight: { bg: 'transparent', fg: '#FFFFFF', border: 'rgba(255,255,255,0.32)' },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};

export function Button({ label, onPress, kind = 'primary', size = 'md', icon, loading, disabled, full, style, testID }: ButtonProps) {
  const palette = BTN[kind];
  const h = size === 'lg' ? 54 : size === 'sm' ? 36 : 46;
  const content = (
    <>
      {loading ? <ActivityIndicator color={palette.fg} size="small" /> : icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={palette.fg} /> : null}
      {label ? (
        <Txt variant={size === 'sm' ? 'captionStrong' : 'bodyStrong'} color={palette.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Txt>
      ) : null}
    </>
  );
  const base: ViewStyle = {
    height: h,
    borderRadius: radius.pill,
    paddingHorizontal: size === 'sm' ? space.md + 2 : space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    alignSelf: full ? 'stretch' : 'flex-start',
    opacity: disabled ? 0.45 : 1,
  };
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={({ pressed }) => [base, { backgroundColor: palette.bg, borderWidth: palette.border ? 1 : 0, borderColor: palette.border, transform: [{ scale: pressed ? 0.98 : 1 }] }, kind === 'brand' ? shadow.brand : null, style]}>
      {content}
    </Pressable>
  );
}

export function GradientButton({ label, onPress, icon, loading, disabled, full = true, size = 'lg', testID, style }: Omit<ButtonProps, 'kind'>) {
  const h = size === 'lg' ? 54 : size === 'sm' ? 38 : 46;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={({ pressed }) => [{ alignSelf: full ? 'stretch' : 'flex-start', borderRadius: radius.pill, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] }, shadow.brand, style]}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ height: h, borderRadius: radius.pill, paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : icon ? <Ionicons name={icon} size={20} color="#fff" /> : null}
        <Txt variant="heading" color="#fff">
          {label}
        </Txt>
      </LinearGradient>
    </Pressable>
  );
}

interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  label: string;
  size?: number;
  color?: string;
  bg?: string;
  badge?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({ icon, onPress, label, size = 24, color = colors.ink, bg, badge, style, testID }: IconButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={({ pressed }) => [{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: bg ?? 'transparent', opacity: pressed ? 0.6 : 1 }, style]}>
      <Ionicons name={icon} size={size} color={color} />
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// --- Chips & segmentos ---------------------------------------------------------------------------

interface ChipProps {
  label: string;
  selected?: boolean;
  icon?: IconName;
  onPress?: () => void;
  testID?: string;
  tone?: 'default' | 'dark';
}

export function Chip({ label, selected, icon, onPress, testID, tone = 'default' }: ChipProps) {
  const dark = tone === 'dark';
  const bg = selected ? colors.ink : dark ? 'rgba(255,255,255,0.92)' : colors.surface;
  const fg = selected ? colors.inkInverse : colors.ink;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={({ pressed }) => [styles.chip, { backgroundColor: bg, opacity: pressed ? 0.75 : 1 }, dark ? shadow.card : null]}>
      {icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <Txt variant="captionStrong" color={fg}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, onChange, options, testID }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; testID?: string }) {
  return (
    <View style={styles.segmented} testID={testID}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(o.value)} style={[styles.segment, active ? styles.segmentActive : null]}>
            <Txt variant="captionStrong" color={active ? colors.ink : colors.inkMute}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Abas de texto com sublinhado (perfil: Publicações | Viagens | Lugares). */
export function TabsBar<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: IconName }[] }) {
  return (
    <View style={styles.tabs}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(o.value)} style={[styles.tab, active ? styles.tabActive : null]}>
            {o.icon ? <Ionicons name={o.icon} size={17} color={active ? colors.ink : colors.inkMute} /> : null}
            <Txt variant="captionStrong" color={active ? colors.ink : colors.inkMute}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// --- Estruturais ---------------------------------------------------------------------------------

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }, style]} />;
}

export function Pill({ children, tone = 'neutral', icon }: { children: ReactNode; tone?: 'neutral' | 'live' | 'brand' | 'info'; icon?: IconName }) {
  const map = {
    neutral: { bg: colors.surface, fg: colors.inkSoft },
    live: { bg: colors.liveSoft, fg: '#0E8F5C' },
    brand: { bg: colors.brandSoft, fg: colors.brand },
    info: { bg: colors.infoSoft, fg: colors.info },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={map.fg} /> : null}
      <Txt variant="micro" color={map.fg}>
        {children}
      </Txt>
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.inkMute} />
      </View>
      <Txt variant="heading" align="center">
        {title}
      </Txt>
      {body ? (
        <Txt variant="body" color={colors.inkSoft} align="center" style={{ maxWidth: 300 }}>
          {body}
        </Txt>
      ) : null}
      {action}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.inkMute} />
      {label ? (
        <Txt variant="caption" color={colors.inkMute}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Txt variant="heading">{title}</Txt>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Txt variant="captionStrong" color={colors.brand}>
            {action}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const name: IconName = value >= i - 0.25 ? 'star' : value >= i - 0.75 ? 'star-half' : 'star-outline';
        const icon = <Ionicons key={i} name={name} size={size} color={colors.star} />;
        return onChange ? (
          <Pressable key={i} onPress={() => onChange(i)} hitSlop={6} accessibilityLabel={`${i} estrelas`}>
            {icon}
          </Pressable>
        ) : (
          icon
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.bg },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md + 2, height: 34, borderRadius: radius.pill },
  segmented: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 3 },
  segment: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.bg, ...shadow.card },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  tab: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', height: 46, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.ink },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 22, borderRadius: radius.pill, alignSelf: 'flex-start' },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl * 1.5, paddingHorizontal: space.xxl },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  loading: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, marginTop: space.xl, marginBottom: space.md },
});
