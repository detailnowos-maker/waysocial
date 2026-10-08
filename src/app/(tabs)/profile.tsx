import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { TopBar } from '@/components/Header';
import { IconButton, Txt } from '@/components/ui';
import { ProfileBody } from '@/features/profile/ProfileBody';
import { useMe, useRepo } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { space } from '@/theme';

export default function ProfileTab() {
  const router = useRouter();
  const repo = useRepo();
  const { userId, profile } = useMe();
  const unread = useQuery(() => repo.unreadNotificationCount(), []);
  return (
    <View style={{ flex: 1 }}>
      <TopBar
        left={
          <Txt variant="title" testID="profile-title">
            @{profile?.username ?? ''}
          </Txt>
        }
        right={
          <>
            <IconButton icon="notifications-outline" label="Notificações" badge={unread.data ?? 0} onPress={() => router.push('/notifications')} testID="profile-bell" />
            <IconButton icon="settings-outline" label="Configurações" onPress={() => router.push('/settings')} testID="profile-settings" />
          </>
        }
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxxl }}>
        <ProfileBody userId={userId} />
      </ScrollView>
    </View>
  );
}
