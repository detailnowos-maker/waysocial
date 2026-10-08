import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { TopBar } from '@/components/Header';
import { PostCard } from '@/components/PostCard';
import { Button, EmptyState, IconButton, Loading, Segmented, Txt } from '@/components/ui';
import type { FeedScope } from '@/data/repository';
import type { MapItem } from '@/domain/types';
import { CITY_COORDS } from '@/lib/demoGeography';
import { useRepo } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors, space } from '@/theme';

type LiveItem = Extract<MapItem, { type: 'live' }>;

function LiveStrip({ items }: { items: LiveItem[] }) {
  const router = useRouter();
  if (items.length === 0) return null;
  return (
    <View style={{ paddingBottom: space.lg }}>
      <Txt variant="micro" color={colors.inkMute} style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        VIAJANDO AGORA
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.lg }}>
        {items.map(({ trip }) => (
          <Pressable key={trip.id} style={{ alignItems: 'center', gap: 4, width: 92 }} onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })} testID={`live-${trip.id}`}>
            <Avatar profile={trip.owner} size={64} ring="live" />
            <Txt variant="captionStrong" numberOfLines={1}>
              {trip.owner.displayName.split(' ')[0]}
            </Txt>
            <Txt variant="micro" color="#0E8F5C" numberOfLines={1}>
              → {trip.plannedDestination ?? 'em viagem'}
            </Txt>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function FeedScreen() {
  const router = useRouter();
  const repo = useRepo();
  const [scope, setScope] = useState<FeedScope>('following');
  const feed = useQuery(() => repo.getFeed(scope), [scope]);
  const live = useQuery(() => repo.getMapItems({ center: CITY_COORDS.bc, radiusM: 1_500_000, filter: 'trips' }), [], { pollMs: 20_000 });
  const unread = useQuery(() => repo.unreadNotificationCount(), []);
  const [refreshing, setRefreshing] = useState(false);

  const liveItems = (live.data ?? []).filter((i): i is LiveItem => i.type === 'live');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        right={
          <>
            <IconButton icon="search-outline" label="Buscar" onPress={() => router.push('/search')} testID="feed-search" />
            <IconButton icon="notifications-outline" label="Notificações" badge={unread.data ?? 0} onPress={() => router.push('/notifications')} testID="feed-bell" />
          </>
        }
      />
      <FlatList
        data={feed.data ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PostCard post={item} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([feed.refresh(), live.refresh()]);
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
              <Segmented
                testID="feed-scope"
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'following', label: 'Seguindo' },
                  { value: 'explore', label: 'Explorar' },
                ]}
              />
            </View>
            <LiveStrip items={liveItems} />
          </View>
        }
        ListEmptyComponent={
          feed.loading ? (
            <Loading label="Carregando publicações" />
          ) : (
            <EmptyState
              icon="images-outline"
              title={scope === 'following' ? 'Seu feed está vazio' : 'Nada por aqui ainda'}
              body={scope === 'following' ? 'Siga pessoas para ver o que elas estão vivendo — ou explore o que acontece ao redor.' : 'Seja o primeiro a publicar.'}
              action={scope === 'following' ? <Button label="Explorar publicações" kind="primary" onPress={() => setScope('explore')} /> : undefined}
            />
          )
        }
        contentContainerStyle={{ paddingBottom: space.xxxl }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        initialNumToRender={3}
        windowSize={7}
      />
    </View>
  );
}
