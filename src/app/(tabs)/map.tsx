import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/components/Toast';
import { type IconName, Chip, Txt } from '@/components/ui';
import type { MapFilter } from '@/domain/types';
import { MapCard } from '@/features/map/MapCard';
import { buildActivityCards, itemToMarker } from '@/features/map/mapItems';
import { getDevicePosition } from '@/features/trip/locationSources';
import { CITY_COORDS } from '@/lib/demoGeography';
import type { LatLng } from '@/lib/geo';
import { type MapFocus, type MapMarker, type MapViewport, SocialMap } from '@/map';
import { useRepo } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors, radius, shadow, space } from '@/theme';

const FILTERS: { value: MapFilter; label: string; icon: IconName }[] = [
  { value: 'all', label: 'Tudo', icon: 'apps' },
  { value: 'posts', label: 'Fotos', icon: 'camera' },
  { value: 'places', label: 'Lugares', icon: 'location' },
  { value: 'food', label: 'Comida', icon: 'restaurant' },
  { value: 'events', label: 'Eventos', icon: 'sparkles' },
  { value: 'trips', label: 'Viagens', icon: 'navigate' },
];

/** Primeira abertura: Blumenau ↔ Balneário Camboriú ↔ Itajaí, onde há mais gente publicando (afaste para ver toda a região). */
const INITIAL = { center: { lat: -26.86, lng: -48.86 } as LatLng, zoom: 9 };

export default function MapScreen() {
  const router = useRouter();
  const repo = useRepo();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<MapFilter>('all');
  const [vp, setVp] = useState<MapViewport | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [focus, setFocus] = useState<MapFocus | undefined>();
  const focusSeq = useRef(0);

  // localização (só se o usuário permitir); nunca bloqueia o mapa
  useEffect(() => {
    let alive = true;
    void getDevicePosition().then((p) => alive && p && setUserLocation(p));
    return () => {
      alive = false;
    };
  }, []);

  const center = vp?.center ?? CITY_COORDS.bc;
  const radiusM = Math.max(150_000, (vp?.radiusM ?? 0) * 1.6);
  const items = useQuery(() => repo.getMapItems({ center, radiusM, filter }), [filter, Math.round(center.lat * 5), Math.round(center.lng * 5), Math.round(radiusM / 50_000)], { pollMs: 15_000 });

  const list = useMemo(() => items.data ?? [], [items.data]);
  const markers = useMemo(() => list.map(itemToMarker), [list]);
  const selected = selectedId ? list.find((i) => i.id === selectedId) : undefined;
  const activity = useMemo(() => buildActivityCards(list), [list]);

  const flyTo = useCallback((center: LatLng, zoom?: number) => {
    focusSeq.current += 1;
    setFocus({ key: focusSeq.current, center, zoom });
  }, []);

  const onMarkerPress = (m: MapMarker) => {
    setSelectedId(m.id);
    flyTo({ lat: m.lat, lng: m.lng }, Math.max(vp?.zoom ?? 9, 10));
  };

  const locate = async () => {
    const p = userLocation ?? (await getDevicePosition());
    if (!p) {
      toast.show('Não conseguimos sua localização. Ative o GPS e a permissão.', { tone: 'error' });
      return;
    }
    setUserLocation(p);
    flyTo(p, 12);
  };

  return (
    <View style={{ flex: 1 }}>
      <SocialMap
        testID="map"
        markers={markers}
        selectedId={selectedId}
        userLocation={userLocation}
        initial={INITIAL}
        focus={focus}
        padding={{ top: 150, bottom: 210, left: 30, right: 30 }}
        onMarkerPress={onMarkerPress}
        onMapPress={() => setSelectedId(null)}
        onViewportChange={setVp}
        onLocatePress={locate}
      />

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <Pressable onPress={() => router.push('/search')} style={[styles.search, shadow.card]} accessibilityRole="search" testID="map-search">
          <Ionicons name="search" size={18} color={colors.inkMute} />
          <Txt color={colors.inkMute} style={{ flex: 1 }}>
            Buscar lugares, pessoas, cidades
          </Txt>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm }}>
          {FILTERS.map((f) => (
            <Chip
              key={f.value}
              tone="dark"
              label={f.label}
              icon={f.icon}
              selected={filter === f.value}
              testID={`map-filter-${f.value}`}
              onPress={() => {
                setFilter(f.value);
                setSelectedId(null);
              }}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.bottom} pointerEvents="box-none">
        {selected ? (
          <MapCard item={selected} onClose={() => setSelectedId(null)} />
        ) : activity.length ? (
          <View>
            <View style={styles.nowHeader}>
              <View style={styles.nowDot} />
              <Txt variant="captionStrong" color={colors.ink}>
                Acontecendo agora
              </Txt>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md }}>
              {activity.map((a) => {
                const item = list.find((i) => i.id === a.itemId);
                const tint = a.tone === 'live' ? '#0E8F5C' : a.tone === 'brand' ? colors.brand : colors.inkSoft;
                const tintBg = a.tone === 'live' ? colors.liveSoft : a.tone === 'brand' ? colors.brandSoft : colors.surface;
                return (
                  <Pressable
                    key={a.id}
                    testID="activity-card"
                    style={[styles.activity, shadow.card]}
                    onPress={() => {
                      if (!item) return;
                      setSelectedId(item.id);
                      flyTo({ lat: item.lat, lng: item.lng }, Math.max(vp?.zoom ?? 9, 10.5));
                    }}>
                    <View style={[styles.activityIcon, { backgroundColor: tintBg }]}>
                      <Ionicons name={a.icon} size={18} color={tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="captionStrong" numberOfLines={1}>
                        {a.title}
                      </Txt>
                      <Txt variant="caption" color={colors.inkSoft} numberOfLines={2}>
                        {a.text}
                      </Txt>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  search: { marginHorizontal: space.md, height: 48, borderRadius: radius.pill, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: space.sm },
  nowHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: space.lg, marginBottom: space.sm, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 10, height: 26, borderRadius: radius.pill },
  nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.live },
  activity: { width: 252, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: '#fff', borderRadius: radius.lg, padding: space.md },
  activityIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
