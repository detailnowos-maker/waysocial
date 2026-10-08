import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppFrame } from '@/components/AppFrame';
import { ToastProvider } from '@/components/Toast';
import { LauncherProvider } from '@/features/compose/Launcher';
import { TripSessionProvider } from '@/state/TripSession';
import { ServicesProvider, useSession } from '@/state/ServicesProvider';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { status } = useSession();
  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);
  if (status === 'loading') return null;
  const signedIn = status === 'signedIn';

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
        <Stack.Screen name="place-picker" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trip/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trip/live" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="trip/[id]" />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="place/[id]" />
        <Stack.Screen name="user/[id]" />
        <Stack.Screen name="user/connections" />
        <Stack.Screen name="search" options={{ animation: 'fade' }} />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="achievements" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="saved" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppFrame>
          <ServicesProvider>
            <ToastProvider>
              <TripSessionProvider>
                <LauncherProvider>
                  <StatusBar style="dark" />
                  <RootStack />
                </LauncherProvider>
              </TripSessionProvider>
            </ToastProvider>
          </ServicesProvider>
        </AppFrame>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
