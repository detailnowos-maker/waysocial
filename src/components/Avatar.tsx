import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import type { ProfilePreview } from '@/domain/types';
import { initials } from '@/lib/format';
import { brandGradient, colors } from '@/theme';

import { Txt } from './ui';

const PAIRS: [string, string][] = [
  ['#FF9A3D', '#FF3D77'],
  ['#33C6FF', '#7A5CFF'],
  ['#16C47F', '#33C6FF'],
  ['#FFB03D', '#FF6B6B'],
  ['#7A5CFF', '#FF3D77'],
  ['#2F6BFF', '#16C47F'],
  ['#FF6B9A', '#FFB03D'],
  ['#0EA5A4', '#2F6BFF'],
];

type AvatarProfile = Pick<ProfilePreview, 'displayName' | 'avatarSeed' | 'avatarUrl'>;

interface AvatarProps {
  profile: AvatarProfile;
  size?: number;
  /** `story` = anel de marca; `live` = anel verde (viagem ao vivo). */
  ring?: 'none' | 'story' | 'live';
}

export function Avatar({ profile, size = 40, ring = 'none' }: AvatarProps) {
  const pair = PAIRS[profile.avatarSeed % PAIRS.length];
  const inner = ring === 'none' ? size : size - 6;
  const face = (
    <View style={{ width: inner, height: inner, borderRadius: inner / 2, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
      {profile.avatarUrl ? (
        <Image source={{ uri: profile.avatarUrl }} style={{ width: inner, height: inner }} contentFit="cover" accessibilityLabel={`Foto de ${profile.displayName}`} />
      ) : (
        <LinearGradient colors={pair} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="bodyStrong" color="#fff" style={{ fontSize: Math.max(11, inner * 0.38), lineHeight: Math.max(13, inner * 0.46) }}>
            {initials(profile.displayName)}
          </Txt>
        </LinearGradient>
      )}
    </View>
  );
  if (ring === 'none') return face;
  return (
    <LinearGradient colors={ring === 'live' ? ['#16C47F', '#33E0A1'] : brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size - 3, height: size - 3, borderRadius: (size - 3) / 2, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>{face}</View>
    </LinearGradient>
  );
}
