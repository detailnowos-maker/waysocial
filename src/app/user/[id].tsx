import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { Header } from '@/components/Header';
import { ProfileBody } from '@/features/profile/ProfileBody';
import { useRepo } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors, space } from '@/theme';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repo = useRepo();
  const view = useQuery(() => repo.getProfileView(id), [id]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={view.data ? `@${view.data.profile.username}` : 'Perfil'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxxl }}>
        <ProfileBody userId={id} />
      </ScrollView>
    </View>
  );
}
