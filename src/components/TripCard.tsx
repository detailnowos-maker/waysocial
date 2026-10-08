import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Trip } from '@/domain/types';
import { TripRouteMap } from '@/features/trip/TripRouteMap';
import { formatDistance, formatDuration, formatDateShort } from '@/lib/format';
import { colors, radius, shadow, space } from '@/theme';

import { Avatar } from './Avatar';
import { Pill, Txt } from './ui';

export function TripStat({ icon, value, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Ionicons name={icon} size={16} color={colors.inkMute} />
      <Txt variant="bodyStrong">{value}</Txt>
      <Txt variant="micro" color={colors.inkMute}>
        {label}
      </Txt>
    </View>
  );
}

export function TripCard({ trip, showOwner = true }: { trip: Trip; showOwner?: boolean }) {
  const router = useRouter();
  const live = trip.status === 'active';
  return (
    <Pressable
      testID={`trip-${trip.id}`}
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
      style={({ pressed }) => [styles.card, shadow.card, { transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
      <View style={styles.map} pointerEvents="none">
        <TripRouteMap route={trip.routePreview ?? []} style={{ flex: 1 }} />
        <View style={styles.badges}>
          {live ? (
            <Pill tone="live" icon="radio">
              AO VIVO
            </Pill>
          ) : null}
          {trip.visibility !== 'public' ? (
            <Pill tone="neutral" icon={trip.visibility === 'private' ? 'lock-closed' : 'people'}>
              {trip.visibility === 'private' ? 'Só eu' : 'Seguidores'}
            </Pill>
          ) : null}
        </View>
      </View>
      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={{ gap: 2 }}>
          <Txt variant="heading" numberOfLines={2}>
            {trip.title}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {showOwner ? <Avatar profile={trip.owner} size={18} /> : null}
            <Txt variant="caption" color={colors.inkSoft}>
              {showOwner ? `${trip.owner.displayName} · ` : ''}
              {formatDateShort(trip.startedAt)}
            </Txt>
          </View>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <TripStat icon="speedometer-outline" value={formatDistance(trip.distanceM)} label="distância" />
          <TripStat icon="time-outline" value={formatDuration(trip.durationS)} label="tempo" />
          <TripStat icon="camera-outline" value={String(trip.photoCount)} label="fotos" />
          <TripStat icon="videocam-outline" value={String(trip.videoCount)} label="vídeos" />
          <TripStat icon="pause-circle-outline" value={String(trip.stopCount)} label="paradas" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bg, borderRadius: radius.xl, overflow: 'hidden', marginHorizontal: space.lg, marginBottom: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  map: { height: 160 },
  badges: { position: 'absolute', top: space.md, left: space.md, flexDirection: 'row', gap: space.xs },
});
