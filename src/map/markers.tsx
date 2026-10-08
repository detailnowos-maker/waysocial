import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { MediaView } from '@/components/MediaView';
import { type IconName, Txt } from '@/components/ui';
import type { PlaceCategory } from '@/domain/types';
import { brandGradient, colors, radius, shadow } from '@/theme';

import type { MapMarker } from './types';

export const CATEGORY_STYLE: Record<PlaceCategory, { icon: IconName; color: string }> = {
  city: { icon: 'business', color: '#4B5262' },
  beach: { icon: 'sunny', color: '#0EA5C6' },
  restaurant: { icon: 'restaurant', color: '#F2603D' },
  cafe: { icon: 'cafe', color: '#A66A3F' },
  bar: { icon: 'beer', color: '#E8A21A' },
  park: { icon: 'leaf', color: '#2F9E5B' },
  viewpoint: { icon: 'triangle', color: '#7A5CFF' },
  landmark: { icon: 'flag', color: '#2F6BFF' },
  shop: { icon: 'bag-handle', color: '#D94A8C' },
  event: { icon: 'sparkles', color: '#FF3D77' },
};

/** Tamanho "de caixa" de cada marcador (px) — usado para ancorar pelo centro. */
export function markerSize(kind: MapMarker['kind'], selected: boolean): { w: number; h: number } {
  const bump = selected ? 8 : 0;
  switch (kind) {
    case 'post':
      return { w: 58 + bump, h: 58 + bump };
    case 'cluster':
      return { w: 46, h: 46 };
    case 'event':
      return { w: 52 + bump, h: 52 + bump };
    case 'live':
      return { w: 58 + bump, h: 58 + bump };
    case 'moment':
      return { w: 32 + bump, h: 32 + bump };
    case 'stop':
      return { w: 26, h: 26 };
    case 'origin':
    case 'destination':
      return { w: 30, h: 30 };
    default:
      return { w: 38 + bump, h: 38 + bump };
  }
}

function Pulse({ color, size }: { color: string; size: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }] }} />;
}

export function MarkerView({ marker, selected, showLabel }: { marker: MapMarker; selected: boolean; showLabel: boolean }) {
  const { w, h } = markerSize(marker.kind, selected);
  switch (marker.kind) {
    case 'post':
      return (
        <View style={{ width: w, height: h }}>
          <View style={[styles.postFrame, shadow.card, { borderColor: selected ? colors.brand : '#fff', borderWidth: selected ? 3.5 : 3 }]}>
            {marker.media ? <MediaView media={marker.media} showBadge={false} style={StyleSheet.absoluteFill} /> : null}
          </View>
          {marker.count && marker.count > 1 ? (
            <View style={styles.countBadge}>
              <Txt variant="micro" color="#fff">
                {marker.count}
              </Txt>
            </View>
          ) : null}
        </View>
      );
    case 'place': {
      const style = CATEGORY_STYLE[marker.category ?? 'landmark'];
      return (
        <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
          <View style={[styles.placeDot, shadow.card, { width: w - 6, height: h - 6, borderRadius: (h - 6) / 2, borderColor: selected ? colors.brand : '#fff' }]}>
            <Ionicons name={style.icon} size={selected ? 20 : 17} color={style.color} />
          </View>
          {showLabel && marker.label ? (
            <View style={styles.labelWrap} pointerEvents="none">
              <Txt variant="micro" color={colors.ink} numberOfLines={1} style={styles.labelText}>
                {marker.label}
              </Txt>
            </View>
          ) : null}
        </View>
      );
    }
    case 'event':
      return (
        <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
          <Pulse color={colors.brand} size={w} />
          <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.event, shadow.brand, { width: w - 6, height: h - 6, borderRadius: (h - 6) / 2 }]}>
            <Ionicons name="sparkles" size={22} color="#fff" />
          </LinearGradient>
          {marker.count ? (
            <View style={styles.tagRow} pointerEvents="none">
              <View style={styles.eventBadge}>
                <Ionicons name="people" size={10} color="#fff" />
                <Txt variant="micro" color="#fff" numberOfLines={1}>
                  {marker.count}
                </Txt>
              </View>
            </View>
          ) : null}
        </View>
      );
    case 'live':
      return (
        <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
          <Pulse color={colors.live} size={w - 8} />
          {marker.avatar ? <Avatar profile={marker.avatar} size={w - 4} ring="live" /> : null}
          <View style={styles.tagRow} pointerEvents="none">
            <View style={styles.liveTag}>
              <View style={styles.liveDot} />
              <Txt variant="micro" color="#fff" numberOfLines={1}>
                AO VIVO
              </Txt>
            </View>
          </View>
        </View>
      );
    case 'moment':
      return (
        <View style={{ width: w, height: h }}>
          <View style={[styles.momentFrame, shadow.card, { borderColor: selected ? colors.brand : '#fff' }]}>
            {marker.media ? <MediaView media={marker.media} showBadge={false} style={StyleSheet.absoluteFill} /> : null}
          </View>
        </View>
      );
    case 'stop':
      return (
        <View style={[styles.stop, shadow.card]}>
          <Ionicons name="pause" size={12} color="#fff" />
        </View>
      );
    case 'origin':
    case 'destination':
      return (
        <View style={[styles.endpoint, shadow.card, { backgroundColor: marker.kind === 'origin' ? colors.ink : colors.brand }]}>
          <Ionicons name={marker.kind === 'origin' ? 'radio-button-on' : 'flag'} size={14} color="#fff" />
        </View>
      );
    case 'cluster':
      return (
        <LinearGradient colors={['#2B2F3A', '#0E1116']} style={[styles.cluster, shadow.float]}>
          <Txt variant="bodyStrong" color="#fff">
            {marker.count}
          </Txt>
        </LinearGradient>
      );
  }
}

/** Ponto azul "você está aqui" com halo pulsante. */
export function UserDot() {
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <Pulse color="#2F6BFF" size={22} />
      <View style={styles.userDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  postFrame: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  countBadge: { position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: '#fff' },
  placeDot: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  labelWrap: { position: 'absolute', top: '100%', marginTop: 2, maxWidth: 120 },
  labelText: { textShadowColor: '#fff', textShadowRadius: 4, textShadowOffset: { width: 0, height: 0 }, textAlign: 'center' },
  event: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  tagRow: { position: 'absolute', bottom: -8, left: -20, right: -20, alignItems: 'center' },
  eventBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.ink, paddingHorizontal: 7, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff' },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.live, paddingHorizontal: 6, height: 16, borderRadius: radius.pill, borderWidth: 2, borderColor: '#fff' },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
  momentFrame: { flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 2.5, backgroundColor: colors.surfaceAlt },
  stop: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E8A21A', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  endpoint: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff' },
  cluster: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  userDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#2F6BFF', borderWidth: 3, borderColor: '#fff' },
});
