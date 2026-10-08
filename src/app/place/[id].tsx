import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { PhotoGrid } from '@/components/PhotoGrid';
import { SceneArt } from '@/components/SceneArt';
import { useToast } from '@/components/Toast';
import { Button, EmptyState, IconButton, Loading, Pill, SectionHeader, Stars, Txt } from '@/components/ui';
import { useLauncher } from '@/features/compose/Launcher';
import { CATEGORY_LABEL } from '@/features/map/labels';
import { formatCount, formatDateShort, timeAgo } from '@/lib/format';
import { directionsUrl } from '@/lib/links';
import { useRepo } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors, radius, space } from '@/theme';

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const repo = useRepo();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { startPostAt } = useLauncher();
  const place = useQuery(() => repo.getPlace(id), [id]);
  const pulse = useQuery(() => repo.getPlacePulse(id), [id]);
  const posts = useQuery(() => repo.listPostsByPlace(id, 60), [id]);
  const visitors = useQuery(() => repo.listPlaceVisitors(id), [id]);
  const reviews = useQuery(() => repo.listPlaceReviews(id), [id]);
  const mine = useQuery(() => repo.getMyPlaceRating(id), [id]);
  const saved = useQuery(() => repo.isPlaceSaved(id), [id]);
  const popular = useQuery(() => (place.data?.kind === 'city' ? repo.listPlaces({ cityName: place.data.name, limit: 8 }) : Promise.resolve([])), [id, place.data?.kind]);
  const [rating, setRating] = useState<number | null>(null);

  const p = place.data;
  if (place.loading && !p) return <Loading />;
  if (!p) return <EmptyState icon="alert-circle-outline" title="Lugar não encontrado" />;

  const isCity = p.kind === 'city';
  const isEvent = p.kind === 'event';
  const myRating = rating ?? mine.data ?? 0;

  const rate = async (stars: number) => {
    setRating(stars);
    try {
      await repo.ratePlace(p.id, stars);
      toast.show('Obrigado pela avaliação!', { tone: 'success' });
    } catch (e) {
      setRating(null);
      toast.show(e instanceof Error ? e.message : 'Não foi possível avaliar.', { tone: 'error' });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxxl + insets.bottom }}>
        <View style={styles.hero}>
          <SceneArt scene={p.scene} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.5)']} style={StyleSheet.absoluteFill} />
          <View style={[styles.heroBar, { paddingTop: insets.top + space.xs }]}>
            <IconButton icon="chevron-back" label="Voltar" color="#fff" bg="rgba(0,0,0,0.35)" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="header-back" />
            <IconButton
              icon="share-outline"
              label="Compartilhar"
              color="#fff"
              bg="rgba(0,0,0,0.35)"
              onPress={() => void Share.share({ message: `${p.name} — ${p.cityName} no WaySocial` }).catch(() => toast.show('Compartilhar não está disponível aqui.', { tone: 'error' }))}
            />
          </View>
        </View>

        <View style={styles.info}>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Pill tone="neutral">{CATEGORY_LABEL[p.category] ?? 'Lugar'}</Pill>
            {isEvent ? <Pill tone="brand" icon="sparkles">Evento</Pill> : null}
            {pulse.data && pulse.data.peopleNow > 0 && !isCity ? <Pill tone="live" icon="people">{pulse.data.peopleNow} aqui agora</Pill> : null}
          </View>
          <Txt variant="display" testID="place-name">
            {p.name}
          </Txt>
          <Txt color={colors.inkSoft}>📍 {isCity ? 'Cidade' : p.cityName}</Txt>
          {!isCity && p.ratingCount > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} testID="place-rating">
              <Txt variant="title">⭐ {p.ratingAvg.toFixed(1).replace('.', ',')}</Txt>
              <Txt color={colors.inkMute}>({formatCount(p.ratingCount)} avaliações)</Txt>
            </View>
          ) : null}
          {isEvent && p.startsAt && p.endsAt ? (
            <Txt variant="caption" color={colors.inkSoft}>
              {formatDateShort(p.startsAt)} → {formatDateShort(p.endsAt)}
            </Txt>
          ) : null}
          {p.description ? <Txt color={colors.inkSoft}>{p.description}</Txt> : null}
          {!isCity && pulse.data ? (
            <Txt variant="caption" color={colors.inkMute}>
              {pulse.data.postsToday} publicações hoje
              {pulse.data.lastPost ? ` · última de ${pulse.data.lastPost.authorName} ${timeAgo(pulse.data.lastPost.createdAt)}` : ''}
            </Txt>
          ) : null}

          {!isCity ? (
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              <Button label="Como chegar" icon="navigate-outline" kind="primary" onPress={() => void Linking.openURL(directionsUrl(p))} style={{ flex: 1 }} testID="place-directions" />
              <Button label="Publicar aqui" icon="camera-outline" kind="brand" onPress={() => startPostAt(p.id)} style={{ flex: 1 }} testID="place-publish" />
              <Button
                label=""
                icon={saved.data ? 'bookmark' : 'bookmark-outline'}
                kind="secondary"
                style={{ width: 46, paddingHorizontal: 0 }}
                onPress={async () => {
                  const now = await repo.toggleSavePlace(p.id);
                  toast.show(now ? 'Lugar salvo' : 'Removido dos salvos', { icon: now ? 'bookmark' : 'bookmark-outline' });
                }}
                testID="place-save"
              />
            </View>
          ) : null}
        </View>

        {isCity && (popular.data?.length ?? 0) > 0 ? (
          <>
            <SectionHeader title="Lugares populares" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
              {popular.data!.map((pl) => (
                <Pressable key={pl.id} style={styles.popular} onPress={() => router.push({ pathname: '/place/[id]', params: { id: pl.id } })}>
                  <SceneArt scene={pl.scene} style={StyleSheet.absoluteFill} />
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={StyleSheet.absoluteFill} />
                  <View style={{ position: 'absolute', left: 10, right: 10, bottom: 10 }}>
                    <Txt variant="captionStrong" color="#fff" numberOfLines={2}>
                      {pl.name}
                    </Txt>
                    <Txt variant="micro" color="rgba(255,255,255,0.85)">
                      ⭐ {pl.ratingAvg.toFixed(1).replace('.', ',')}
                    </Txt>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        <SectionHeader title="Fotos recentes" />
        {posts.data && posts.data.length > 0 ? (
          <PhotoGrid posts={posts.data} />
        ) : (
          <Txt color={colors.inkMute} style={{ paddingHorizontal: space.lg }}>
            Ninguém publicou aqui ainda. {isCity ? '' : 'Seja o primeiro!'}
          </Txt>
        )}

        {!isCity ? (
          <>
            <SectionHeader title="Quem esteve aqui" />
            {visitors.data && visitors.data.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.lg }}>
                {visitors.data.map((v) => (
                  <Pressable key={v.profile.id} style={{ alignItems: 'center', gap: 4, width: 72 }} onPress={() => router.push({ pathname: '/user/[id]', params: { id: v.profile.id } })} testID={`visitor-${v.profile.id}`}>
                    <Avatar profile={v.profile} size={56} />
                    <Txt variant="captionStrong" numberOfLines={1}>
                      {v.profile.displayName.split(' ')[0]}
                    </Txt>
                    <Txt variant="micro" color={colors.inkMute}>
                      {timeAgo(v.at)}
                    </Txt>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Txt color={colors.inkMute} style={{ paddingHorizontal: space.lg }}>
                Nenhuma visita recente de pessoas que você pode ver.
              </Txt>
            )}

            <SectionHeader title="Avalie este lugar" />
            <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Stars value={myRating} size={30} onChange={(v) => void rate(v)} />
                <Txt variant="caption" color={colors.inkMute} testID="place-my-rating">
                  {myRating ? `Sua nota: ${myRating}` : 'Toque nas estrelas'}
                </Txt>
              </View>
              {(reviews.data ?? []).map((r) => (
                <View key={r.id} style={styles.review}>
                  <Avatar profile={r.author} size={32} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <Txt variant="captionStrong">{r.author.displayName}</Txt>
                      <Stars value={r.stars} size={11} />
                    </View>
                    {r.text ? <Txt variant="body">{r.text}</Txt> : null}
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 270, backgroundColor: colors.surfaceAlt },
  heroBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.sm },
  info: { padding: space.lg, gap: space.sm, marginTop: -space.xl, backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  popular: { width: 150, height: 190, borderRadius: radius.lg, overflow: 'hidden' },
  review: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
});
