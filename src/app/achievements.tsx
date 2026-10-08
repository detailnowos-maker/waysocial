import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { AchievementBadge } from '@/components/AchievementBadge';
import { Header } from '@/components/Header';
import { EmptyState, Loading, Txt } from '@/components/ui';
import { useRepo, useSession } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors, radius, space } from '@/theme';

export default function Achievements() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { userId } = useSession();
  const repo = useRepo();
  const target = id ?? userId ?? '';
  const list = useQuery(() => repo.listAchievements(target), [target]);
  const unlocked = (list.data ?? []).filter((a) => a.unlocked).length;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Conquistas" subtitle={list.data ? `${unlocked} de ${list.data.length}` : undefined} />
      {list.loading && !list.data ? (
        <Loading />
      ) : (list.data?.length ?? 0) === 0 ? (
        <EmptyState icon="trophy-outline" title="Conquistas indisponíveis" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
          {list.data!.map((a) => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, padding: space.md, borderRadius: radius.lg, backgroundColor: a.unlocked ? colors.brandSoft : colors.surface }} testID={`ach-row-${a.id}`}>
              <AchievementBadge a={a} size={56} label={false} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="bodyStrong">{a.title}</Txt>
                <Txt variant="caption" color={colors.inkSoft}>
                  {a.description}
                </Txt>
                <Txt variant="micro" color={a.unlocked ? colors.brand : colors.inkMute}>
                  {a.unlocked ? 'CONQUISTADA' : `${a.progress} / ${a.goal}`}
                </Txt>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
