import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { MediaView } from '@/components/MediaView';
import { SceneArt } from '@/components/SceneArt';
import { Button, Pill, Stars, Txt } from '@/components/ui';
import type { MapItem } from '@/domain/types';
import { formatDateTime, formatDistance, formatDuration, timeAgo } from '@/lib/format';
import { directionsUrl } from '@/lib/links';

import { CATEGORY_LABEL } from './labels';
import { colors, radius, shadow, space } from '@/theme';

/** Cartão que abre ao tocar num marcador do mapa. */
export function MapCard({ item, onClose }: { item: MapItem; onClose: () => void }) {
  const router = useRouter();

  const shell = (children: React.ReactNode, onPress: () => void, testID: string) => (
    <Pressable onPress={onPress} style={[styles.card, shadow.float]} testID={testID}>
      {children}
      <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="Fechar cartão" testID="map-card-close">
        <Ionicons name="close" size={18} color={colors.inkSoft} />
      </Pressable>
    </Pressable>
  );

  if (item.type === 'post') {
    const p = item.post;
    return shell(
      <View style={styles.row}>
        <MediaView media={p.media[0]} style={styles.thumb} showBadge />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.userRow}>
            <Avatar profile={p.author} size={22} />
            <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
              {p.author.displayName}
            </Txt>
            <Txt variant="caption" color={colors.inkMute}>
              · {timeAgo(p.createdAt)}
            </Txt>
          </View>
          {p.place ? (
            <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
              📍 {p.place.name}, {p.place.cityName}
            </Txt>
          ) : null}
          <Txt variant="caption" color={colors.inkMute}>
            {formatDateTime(p.createdAt)}
          </Txt>
          {p.caption ? (
            <Txt variant="body" numberOfLines={2} style={{ marginTop: 2 }}>
              {p.caption}
            </Txt>
          ) : null}
          <View style={[styles.userRow, { marginTop: 4 }]}>
            <Ionicons name="heart" size={14} color={colors.like} />
            <Txt variant="captionStrong">{p.likeCount}</Txt>
            <Ionicons name="chatbubble" size={13} color={colors.inkMute} style={{ marginLeft: 6 }} />
            <Txt variant="captionStrong">{p.commentCount}</Txt>
            {item.count > 1 ? <Pill tone="brand">+{item.count - 1} aqui</Pill> : null}
            <View style={{ flex: 1 }} />
            <Txt variant="captionStrong" color={colors.brand}>
              Abrir →
            </Txt>
          </View>
        </View>
      </View>,
      () => router.push({ pathname: '/post/[id]', params: { id: p.id } }),
      'map-card-post',
    );
  }

  if (item.type === 'place' || item.type === 'event') {
    const pl = item.place;
    const isEvent = item.type === 'event';
    return shell(
      <View style={styles.row}>
        <View style={styles.thumb}>
          <SceneArt scene={pl.scene} style={StyleSheet.absoluteFill} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="heading" numberOfLines={2}>
            {pl.name}
          </Txt>
          <Txt variant="caption" color={colors.inkSoft}>
            {CATEGORY_LABEL[pl.category] ?? 'Lugar'} · {pl.cityName}
          </Txt>
          <View style={styles.userRow}>
            {pl.ratingCount > 0 ? (
              <>
                <Stars value={pl.ratingAvg} size={12} />
                <Txt variant="captionStrong">{pl.ratingAvg.toFixed(1).replace('.', ',')}</Txt>
              </>
            ) : null}
            {item.pulse.peopleNow > 0 ? <Pill tone={isEvent ? 'brand' : 'live'} icon="people">{item.pulse.peopleNow} aqui agora</Pill> : null}
          </View>
          {isEvent && pl.endsAt ? (
            <Txt variant="caption" color={colors.inkMute}>
              Até {formatDateTime(pl.endsAt)}
            </Txt>
          ) : null}
          <View style={[styles.userRow, { marginTop: 4 }]}>
            <Button label="Como chegar" size="sm" kind="secondary" icon="navigate-outline" onPress={() => void Linking.openURL(directionsUrl(pl))} />
            <Txt variant="captionStrong" color={colors.brand} style={{ marginLeft: 'auto' }}>
              Abrir →
            </Txt>
          </View>
        </View>
      </View>,
      () => router.push({ pathname: '/place/[id]', params: { id: pl.id } }),
      'map-card-place',
    );
  }

  const t = item.trip;
  return shell(
    <View style={styles.row}>
      <Avatar profile={t.owner} size={64} ring="live" />
      <View style={{ flex: 1, gap: 4 }}>
        <Pill tone="live" icon="radio">
          AO VIVO
        </Pill>
        <Txt variant="heading" numberOfLines={2}>
          {t.owner.displayName.split(' ')[0]} está viajando{t.plannedDestination ? ` para ${t.plannedDestination}` : ''}
        </Txt>
        <Txt variant="caption" color={colors.inkSoft}>
          Saiu de {t.originName} · {formatDistance(t.distanceM)} · {formatDuration(t.durationS)}
        </Txt>
        <Txt variant="captionStrong" color={colors.brand}>
          Ver viagem →
        </Txt>
      </View>
    </View>,
    () => router.push({ pathname: '/trip/[id]', params: { id: t.id } }),
    'map-card-live',
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: radius.xl, padding: space.md, marginHorizontal: space.md },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center', paddingRight: space.lg },
  thumb: { width: 92, height: 112, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  close: { position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
