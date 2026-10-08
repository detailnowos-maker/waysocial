import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AchievementBadge } from '@/components/AchievementBadge';
import { Avatar } from '@/components/Avatar';
import { PhotoGrid } from '@/components/PhotoGrid';
import { TripCard } from '@/components/TripCard';
import { useToast } from '@/components/Toast';
import { Button, Divider, EmptyState, Loading, SectionHeader, TabsBar, Txt } from '@/components/ui';
import type { FollowState } from '@/domain/types';
import { CATEGORY_STYLE } from '@/map';
import { SocialMap, type MapMarker } from '@/map';
import { formatCount } from '@/lib/format';
import { useRepo } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors, radius, space } from '@/theme';

type Tab = 'posts' | 'trips' | 'places';

function Stat({ value, label, onPress, testID }: { value: number; label: string; onPress?: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1, alignItems: 'center', gap: 1 }} testID={testID}>
      <Txt variant="heading">{formatCount(value)}</Txt>
      <Txt variant="micro" color={colors.inkMute} numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Corpo do perfil (usado pela aba "Perfil" e por "user/[id]"). */
export function ProfileBody({ userId, header }: { userId: string; header?: React.ReactNode }) {
  const router = useRouter();
  const repo = useRepo();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('posts');
  const view = useQuery(() => repo.getProfileView(userId), [userId]);
  const posts = useQuery(() => repo.listPostsByUser(userId), [userId]);
  const trips = useQuery(() => repo.listTrips(userId), [userId]);
  const places = useQuery(() => repo.listVisitedPlaces(userId), [userId]);
  const achievements = useQuery(() => repo.listAchievements(userId), [userId]);
  const [busy, setBusy] = useState(false);

  const markers = useMemo<MapMarker[]>(
    () => (places.data ?? []).map((p) => ({ id: p.id, kind: 'place', lat: p.lat, lng: p.lng, category: p.category, label: p.name })),
    [places.data],
  );

  if (view.loading && !view.data) return <Loading />;
  const v = view.data;
  if (!v) return <EmptyState icon="person-outline" title="Perfil não encontrado" />;
  const { profile, stats, followState, isMe, canViewContent } = v;

  const toggleFollow = async () => {
    setBusy(true);
    try {
      if (followState === 'none') {
        const next = await repo.follow(profile.id);
        toast.show(next === 'requested' ? 'Pedido enviado. Aguarde a aprovação.' : `Você começou a seguir ${profile.displayName.split(' ')[0]}`, { tone: 'success' });
      } else {
        await repo.unfollow(profile.id);
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Algo deu errado.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const followLabel: Record<FollowState, string> = { none: 'Seguir', following: 'Seguindo', requested: 'Solicitado' };
  const unlocked = (achievements.data ?? []).filter((a) => a.unlocked);

  return (
    <View testID="profile-body">
      {header}
      <View style={styles.top}>
        <Avatar profile={profile} size={84} />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Stat value={stats.posts} label="Publicações" testID="stat-posts" />
          <Stat value={stats.followers} label="Seguidores" onPress={() => router.push({ pathname: '/user/connections', params: { id: profile.id, kind: 'followers' } })} testID="stat-followers" />
          <Stat value={stats.following} label="Seguindo" onPress={() => router.push({ pathname: '/user/connections', params: { id: profile.id, kind: 'following' } })} testID="stat-following" />
        </View>
      </View>

      <View style={{ paddingHorizontal: space.lg, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt variant="title" testID="profile-name">
            {profile.displayName}
          </Txt>
          {profile.isPrivate ? <Ionicons name="lock-closed" size={15} color={colors.inkMute} /> : null}
        </View>
        <Txt variant="caption" color={colors.inkMute} testID="profile-username">
          @{profile.username}
          {profile.homeCity ? ` · ${profile.homeCity}` : ''}
        </Txt>
        {profile.bio ? <Txt style={{ marginTop: 4 }}>{profile.bio}</Txt> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, marginTop: space.lg }}>
        {isMe ? (
          <>
            <Button label="Editar perfil" kind="secondary" onPress={() => router.push('/edit-profile')} style={{ flex: 1 }} testID="profile-edit" />
            <Button label="Salvos" icon="bookmark-outline" kind="secondary" onPress={() => router.push('/saved')} style={{ flex: 1 }} testID="profile-saved" />
          </>
        ) : (
          <Button
            label={followLabel[followState]}
            kind={followState === 'none' ? 'primary' : 'secondary'}
            icon={followState === 'following' ? 'checkmark' : followState === 'requested' ? 'time-outline' : 'person-add-outline'}
            loading={busy}
            onPress={toggleFollow}
            style={{ flex: 1 }}
            testID="follow-button"
          />
        )}
      </View>

      <View style={styles.statsRow}>
        <Stat value={stats.trips} label="Viagens" />
        <View style={styles.vline} />
        <Stat value={stats.places} label="Lugares visitados" />
        <View style={styles.vline} />
        <Stat value={unlocked.length} label="Conquistas" onPress={canViewContent ? () => router.push({ pathname: '/achievements', params: { id: profile.id } }) : undefined} />
      </View>

      {canViewContent && (achievements.data?.length ?? 0) > 0 ? (
        <>
          <SectionHeader title="Conquistas" action="Ver todas" onAction={() => router.push({ pathname: '/achievements', params: { id: profile.id } })} />
          <View style={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, flexWrap: 'wrap' }} testID="achievements-row">
            {[...(achievements.data ?? [])]
              .sort((a, b) => Number(b.unlocked) - Number(a.unlocked))
              .slice(0, 4)
              .map((a) => (
                <AchievementBadge key={a.id} a={a} size={52} />
              ))}
          </View>
        </>
      ) : null}

      <View style={{ marginTop: space.lg }}>
        <TabsBar
          value={tab}
          onChange={setTab}
          options={[
            { value: 'posts', label: 'Publicações', icon: 'grid-outline' },
            { value: 'trips', label: 'Viagens', icon: 'navigate-outline' },
            { value: 'places', label: 'Lugares', icon: 'location-outline' },
          ]}
        />
      </View>

      {!canViewContent ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Esta conta é privada"
          body={followState === 'requested' ? 'Seu pedido foi enviado. Quando for aprovado, você verá publicações, viagens e lugares.' : 'Siga para ver as publicações, viagens e lugares de ' + profile.displayName.split(' ')[0] + '.'}
        />
      ) : tab === 'posts' ? (
        posts.data && posts.data.length > 0 ? (
          <PhotoGrid posts={posts.data} />
        ) : (
          <EmptyState icon="images-outline" title="Nenhuma publicação ainda" body={isMe ? 'Toque no + para compartilhar seu primeiro momento.' : undefined} />
        )
      ) : tab === 'trips' ? (
        <View style={{ paddingTop: space.lg }}>
          {trips.data && trips.data.length > 0 ? (
            trips.data.map((t) => <TripCard key={t.id} trip={t} showOwner={false} />)
          ) : (
            <EmptyState icon="navigate-outline" title="Nenhuma viagem ainda" body={isMe ? 'Comece uma viagem para registrar o caminho e os momentos.' : 'As viagens públicas aparecem aqui.'} />
          )}
        </View>
      ) : (
        <View>
          {places.data && places.data.length > 0 ? (
            <>
              <View style={styles.miniMap} testID="profile-places-map">
                <SocialMap
                  markers={markers}
                  initial={{ fit: places.data.map((p) => ({ lat: p.lat, lng: p.lng })) }}
                  interactive={false}
                  controls={false}
                  padding={{ top: 40, bottom: 40, left: 40, right: 40 }}
                  onMarkerPress={(m) => router.push({ pathname: '/place/[id]', params: { id: m.id } })}
                />
              </View>
              {places.data.map((p, i) => {
                const st = CATEGORY_STYLE[p.category];
                return (
                  <View key={p.id}>
                    {i > 0 ? <Divider style={{ marginLeft: 72 }} /> : null}
                    <Pressable style={styles.placeRow} onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })} testID={`profile-place-${p.id}`}>
                      <View style={[styles.placeIcon]}>
                        <Ionicons name={st.icon} size={20} color={st.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>
                          {p.name}
                        </Txt>
                        <Txt variant="caption" color={colors.inkSoft}>
                          {p.cityName}
                        </Txt>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
                    </Pressable>
                  </View>
                );
              })}
            </>
          ) : (
            <EmptyState icon="location-outline" title="Nenhum lugar visitado" body="Os lugares aparecem aqui quando as publicações têm um local marcado." />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: space.xl, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: space.lg, marginTop: space.lg, paddingVertical: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  vline: { width: StyleSheet.hairlineWidth, height: 26, backgroundColor: colors.line },
  miniMap: { height: 260, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  placeIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
