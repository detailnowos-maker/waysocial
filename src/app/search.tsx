import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { PhotoGrid } from '@/components/PhotoGrid';
import { SceneArt } from '@/components/SceneArt';
import { Chip, Divider, EmptyState, IconButton, Loading, SectionHeader, Stars, Txt } from '@/components/ui';
import type { Place, ProfilePreview, SearchResults } from '@/domain/types';
import { CATEGORY_LABEL } from '@/features/map/labels';
import { type MapMarker, CATEGORY_STYLE, SocialMap } from '@/map';
import { useRepo } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors, radius, space, type } from '@/theme';

type Tab = 'all' | 'people' | 'places' | 'posts' | 'cities';
const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'people', label: 'Pessoas' },
  { value: 'places', label: 'Lugares' },
  { value: 'posts', label: 'Publicações' },
  { value: 'cities', label: 'Cidades' },
];

function PersonRow({ p, onPress }: { p: ProfilePreview; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} testID={`person-${p.id}`}>
      <Avatar profile={p} size={46} />
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{p.displayName}</Txt>
        <Txt variant="caption" color={colors.inkMute}>
          @{p.username}
          {p.isPrivate ? ' · conta privada' : ''}
        </Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
    </Pressable>
  );
}

function PlaceRow({ p, onPress }: { p: Place; onPress: () => void }) {
  const st = CATEGORY_STYLE[p.category];
  return (
    <Pressable style={styles.row} onPress={onPress} testID={`place-${p.id}`}>
      <View style={[styles.placeIcon, { backgroundColor: colors.surface }]}>
        <Ionicons name={st.icon} size={20} color={st.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {p.name}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt variant="caption" color={colors.inkSoft}>
            {CATEGORY_LABEL[p.category]} · {p.cityName}
          </Txt>
          {p.ratingCount > 0 ? <Stars value={p.ratingAvg} size={11} /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
    </Pressable>
  );
}

export default function Search() {
  const router = useRouter();
  const repo = useRepo();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    const t = setTimeout(() => setQuery(text), 220);
    return () => clearTimeout(t);
  }, [text]);

  const results = useQuery<SearchResults>(() => repo.search(query), [query], { enabled: query.trim().length >= 2 });
  const suggestedPeople = useQuery(() => repo.suggestedProfiles(), []);
  const popularPlaces = useQuery(() => repo.listPlaces({ limit: 6 }), []);
  const popularCities = useQuery(async () => {
    const names = ['Balneário Camboriú', 'Florianópolis', 'Joinville', 'Blumenau', 'Curitiba', 'Jaraguá do Sul'];
    const found = await Promise.all(names.map((n) => repo.search(n).then((r) => r.cities[0])));
    return found.filter(Boolean) as Place[];
  }, []);

  const r = results.data;
  const hub = r?.cityHub;
  const searching = query.trim().length >= 2;
  const empty = !!r && !r.cities.length && !r.places.length && !r.people.length && !r.posts.length;

  const hubMarkers = useMemo<MapMarker[]>(() => {
    if (!hub) return [];
    const ms: MapMarker[] = hub.topPlaces.map((p) => ({ id: p.id, kind: 'place', lat: p.lat, lng: p.lng, category: p.category, label: p.name }));
    for (const post of hub.recentPosts) if (post.lat != null && post.lng != null && post.place) ms.push({ id: `post-${post.id}`, kind: 'post', lat: post.lat, lng: post.lng, media: post.media[0] });
    return ms;
  }, [hub]);

  const show = (t: Tab) => tab === 'all' || tab === t;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.bar, { paddingTop: insets.top + space.xs }]}>
        <IconButton icon="chevron-back" label="Voltar" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="header-back" />
        <View style={styles.input}>
          <Ionicons name="search" size={18} color={colors.inkMute} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Buscar pessoas, lugares, cidades"
            placeholderTextColor={colors.inkMute}
            style={styles.textInput}
            autoFocus
            returnKeyType="search"
            autoCapitalize="none"
            accessibilityLabel="Buscar"
            testID="search-input"
          />
          {text ? (
            <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel="Limpar">
              <Ionicons name="close-circle" size={18} color={colors.inkMute} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {searching ? (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
            {TABS.map((t) => (
              <Chip key={t.value} label={t.label} selected={tab === t.value} onPress={() => setTab(t.value)} testID={`search-tab-${t.value}`} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.xxxl * 2 }}>
        {!searching ? (
          <View>
            <SectionHeader title="Cidades para explorar" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
              {(popularCities.data ?? []).map((c) => (
                <Pressable key={c.id} style={styles.cityCard} onPress={() => setText(c.name)} testID={`suggest-city-${c.id}`}>
                  <SceneArt scene={c.scene} style={StyleSheet.absoluteFill} />
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFill} />
                  <Txt variant="captionStrong" color="#fff" style={{ position: 'absolute', left: 10, bottom: 10, right: 10 }}>
                    {c.name}
                  </Txt>
                </Pressable>
              ))}
            </ScrollView>
            {(suggestedPeople.data?.length ?? 0) > 0 ? (
              <>
                <SectionHeader title="Pessoas para seguir" />
                {suggestedPeople.data!.map((p) => (
                  <PersonRow key={p.id} p={p} onPress={() => router.push({ pathname: '/user/[id]', params: { id: p.id } })} />
                ))}
              </>
            ) : null}
            <SectionHeader title="Lugares populares" />
            {(popularPlaces.data ?? []).map((p) => (
              <PlaceRow key={p.id} p={p} onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })} />
            ))}
          </View>
        ) : results.loading && !r ? (
          <Loading label="Buscando…" />
        ) : empty ? (
          <EmptyState icon="search-outline" title={`Nada encontrado para “${query}”`} body="Confira a grafia ou tente uma cidade, um lugar ou @usuário." />
        ) : r ? (
          <View>
            {hub && (tab === 'all' || tab === 'cities') ? (
              <View testID="city-hub">
                <Pressable style={styles.hubHeader} onPress={() => router.push({ pathname: '/place/[id]', params: { id: hub.city.id } })}>
                  <SceneArt scene={hub.city.scene} style={StyleSheet.absoluteFill} />
                  <LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />
                  <View style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg }}>
                    <Txt variant="micro" color="rgba(255,255,255,0.8)">
                      CIDADE
                    </Txt>
                    <Txt variant="display" color="#fff">
                      {hub.city.name}
                    </Txt>
                  </View>
                </Pressable>

                <SectionHeader title="📍 Lugares populares" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
                  {hub.topPlaces.map((p) => (
                    <Pressable key={p.id} style={styles.cityCard} onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })} testID={`hub-place-${p.id}`}>
                      <SceneArt scene={p.scene} style={StyleSheet.absoluteFill} />
                      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />
                      <View style={{ position: 'absolute', left: 10, right: 10, bottom: 10 }}>
                        <Txt variant="captionStrong" color="#fff" numberOfLines={2}>
                          {p.name}
                        </Txt>
                        <Txt variant="micro" color="rgba(255,255,255,0.85)">
                          ⭐ {p.ratingAvg.toFixed(1).replace('.', ',')}
                        </Txt>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>

                <SectionHeader title="📸 Publicações recentes" />
                <PhotoGrid posts={hub.recentPosts} />

                <SectionHeader title="👥 Pessoas" />
                {hub.people.slice(0, 6).map((p) => (
                  <PersonRow key={p.id} p={p} onPress={() => router.push({ pathname: '/user/[id]', params: { id: p.id } })} />
                ))}

                <SectionHeader title="🗺️ Mapa" />
                <View style={styles.hubMap} testID="city-hub-map">
                  <SocialMap
                    markers={hubMarkers}
                    initial={{ fit: [...hubMarkers.map((m) => ({ lat: m.lat, lng: m.lng })), { lat: hub.city.lat, lng: hub.city.lng }] }}
                    interactive={false}
                    controls={false}
                    padding={{ top: 40, bottom: 40, left: 40, right: 40 }}
                    onMarkerPress={(m) => router.push(m.id.startsWith('post-') ? { pathname: '/post/[id]', params: { id: m.id.slice(5) } } : { pathname: '/place/[id]', params: { id: m.id } })}
                  />
                </View>
                <Divider style={{ marginTop: space.xl }} />
              </View>
            ) : null}

            {!hub && show('cities') && r.cities.length > 0 ? (
              <>
                <SectionHeader title="Cidades" />
                {r.cities.map((c) => (
                  <PlaceRow key={c.id} p={c} onPress={() => router.push({ pathname: '/place/[id]', params: { id: c.id } })} />
                ))}
              </>
            ) : null}

            {show('people') && r.people.length > 0 && !(hub && tab === 'all') ? (
              <>
                <SectionHeader title="Pessoas" />
                {r.people.map((p) => (
                  <PersonRow key={p.id} p={p} onPress={() => router.push({ pathname: '/user/[id]', params: { id: p.id } })} />
                ))}
              </>
            ) : null}

            {show('places') && r.places.length > 0 ? (
              <>
                <SectionHeader title="Lugares" />
                {r.places.map((p) => (
                  <PlaceRow key={p.id} p={p} onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })} />
                ))}
              </>
            ) : null}

            {show('posts') && r.posts.length > 0 && !(hub && tab === 'all') ? (
              <>
                <SectionHeader title="Publicações" />
                <PhotoGrid posts={r.posts} />
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingBottom: space.sm },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, height: 44, borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: space.lg },
  textInput: { ...type.body, flex: 1, color: colors.ink, outlineStyle: 'none' } as never,
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  placeIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  cityCard: { width: 140, height: 180, borderRadius: radius.lg, overflow: 'hidden' },
  hubHeader: { height: 150, marginHorizontal: space.lg, borderRadius: radius.xl, overflow: 'hidden', marginTop: space.sm },
  hubMap: { height: 240, marginHorizontal: space.lg, borderRadius: radius.xl, overflow: 'hidden' },
});
