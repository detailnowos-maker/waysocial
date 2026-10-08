import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Header } from '@/components/Header';
import { EmptyState, Loading, Txt } from '@/components/ui';
import { useRepo } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors, space } from '@/theme';

export default function Connections() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: 'followers' | 'following' }>();
  const router = useRouter();
  const repo = useRepo();
  const list = useQuery(() => (kind === 'following' ? repo.listFollowing(id) : repo.listFollowers(id)), [id, kind]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={kind === 'following' ? 'Seguindo' : 'Seguidores'} />
      <FlatList
        data={list.data ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg }} onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })} testID={`connection-${item.id}`}>
            <Avatar profile={item} size={48} />
            <View>
              <Txt variant="bodyStrong">{item.displayName}</Txt>
              <Txt variant="caption" color={colors.inkMute}>
                @{item.username}
              </Txt>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={list.loading ? <Loading /> : <EmptyState icon="people-outline" title="Ninguém por aqui ainda" body="As listas de contas privadas só aparecem para seguidores aprovados." />}
      />
    </View>
  );
}
