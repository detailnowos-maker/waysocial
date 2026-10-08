import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/TabBar';
import { colors } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, lazy: true, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Feed' }} />
      <Tabs.Screen name="map" options={{ title: 'Mapa' }} />
      <Tabs.Screen name="trips" options={{ title: 'Viagens' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
