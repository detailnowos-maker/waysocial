import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLauncher } from '@/features/compose/Launcher';
import { APP_MAX_WIDTH } from '@/lib/layout';
import { useTripSession } from '@/state/TripSession';
import { brandGradient, colors, shadow, TAB_BAR_HEIGHT } from '@/theme';

import { type IconName, haptic, Txt } from './ui';

const TABS: Record<string, { label: string; icon: IconName; iconOn: IconName; testID: string }> = {
  index: { label: 'Feed', icon: 'home-outline', iconOn: 'home', testID: 'tab-feed' },
  map: { label: 'Mapa', icon: 'map-outline', iconOn: 'map', testID: 'tab-map' },
  trips: { label: 'Viagens', icon: 'navigate-outline', iconOn: 'navigate', testID: 'tab-trips' },
  profile: { label: 'Perfil', icon: 'person-outline', iconOn: 'person', testID: 'tab-profile' },
};

/**
 * Feed | Mapa | + | Viagens | Perfil — o "+" é um botão elevado, com o gradiente de marca,
 * que abre o criador de publicação em vez de navegar para uma aba.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { openNew } = useLauncher();
  const { trip } = useTripSession();

  const order = ['index', 'map', 'create', 'trips', 'profile'];
  const routeByName = Object.fromEntries(state.routes.map((r, i) => [r.name, { route: r, index: i }]));

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom }]}>
      <View style={styles.bar}>
        {order.map((name) => {
          if (name === 'create') {
            return (
              <View key="create" style={styles.slot}>
                <Pressable
                  testID="tab-create"
                  accessibilityRole="button"
                  accessibilityLabel="Nova publicação"
                  onPress={() => {
                    haptic();
                    openNew();
                  }}
                  style={({ pressed }) => [styles.plusWrap, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
                  <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.plus, shadow.brand]}>
                    <Ionicons name="add" size={32} color="#fff" />
                  </LinearGradient>
                </Pressable>
              </View>
            );
          }
          const entry = routeByName[name];
          const meta = TABS[name];
          if (!entry || !meta) return null;
          const focused = state.index === entry.index;
          const live = name === 'trips' && trip;
          return (
            <Pressable
              key={name}
              testID={meta.testID}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: entry.route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(entry.route.name, entry.route.params);
              }}
              style={styles.slot}>
              <View>
                <Ionicons name={focused ? meta.iconOn : meta.icon} size={25} color={focused ? colors.ink : colors.inkMute} />
                {live ? <View style={styles.liveDot} /> : null}
              </View>
              <Txt variant="micro" color={focused ? colors.ink : colors.inkMute}>
                {meta.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, alignItems: 'center' },
  bar: { height: TAB_BAR_HEIGHT, flexDirection: 'row', width: '100%', maxWidth: APP_MAX_WIDTH, alignItems: 'center' },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: '100%' },
  plusWrap: { marginTop: -22 },
  plus: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg },
  liveDot: { position: 'absolute', top: -1, right: -3, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.live, borderWidth: 2, borderColor: colors.bg },
});
