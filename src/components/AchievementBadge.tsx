import { StyleSheet, View } from 'react-native';

import type { AchievementProgress } from '@/domain/types';
import { colors, radius, space } from '@/theme';

import { Txt } from './ui';

export function AchievementBadge({ a, size = 56, label = true }: { a: AchievementProgress; size?: number; label?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 6, width: size + 18 }} testID={`achievement-${a.id}`} accessibilityLabel={`${a.title}${a.unlocked ? ' (conquistada)' : ` (${a.progress} de ${a.goal})`}`}>
      <View
        style={[
          styles.badge,
          { width: size, height: size, borderRadius: size / 2 },
          a.unlocked ? { backgroundColor: colors.brandSoft, borderColor: colors.brand } : { backgroundColor: colors.surface, borderColor: colors.line },
        ]}>
        <Txt style={{ fontSize: size * 0.46, lineHeight: size * 0.58, opacity: a.unlocked ? 1 : 0.28 }}>{a.emoji}</Txt>
        {!a.unlocked ? (
          <View style={[styles.progress, { width: size - 14 }]}>
            <View style={{ height: 4, width: `${Math.round((a.progress / a.goal) * 100)}%`, backgroundColor: colors.brand, borderRadius: 2 }} />
          </View>
        ) : null}
      </View>
      {label ? (
        <Txt variant="micro" align="center" color={a.unlocked ? colors.ink : colors.inkMute} numberOfLines={2} style={{ fontWeight: '600' }}>
          {a.title}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  progress: { position: 'absolute', bottom: 7, height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' },
});

export const BADGE_GAP = space.lg;
export const BADGE_RADIUS = radius.lg;
