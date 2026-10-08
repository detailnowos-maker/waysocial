import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/Header';
import { TripCard } from '@/components/TripCard';
import { EmptyState, GradientButton, Loading, Segmented, Txt } from '@/components/ui';
import { formatClock, formatDistance } from '@/lib/format';
import { useMe, useRepo } from '@/state/ServicesProvider';
import { useTripSession } from '@/state/TripSession';
import { useQuery } from '@/state/useQuery';
import { brandGradient, colors, radius, shadow, space } from '@/theme';

type Tab = 'mine' | 'community';

export default function TripsTab() {
  const router = useRouter();
  const repo = useRepo();
  const { userId } = useMe();
  const { trip, elapsedS, distanceM, stopCount } = useTripSession();
  const [tab, setTab] = useState<Tab>('mine');
  const mine = useQuery(() => repo.listTrips(userId), [userId]);
  const community = useQuery(() => repo.listTripFeed(), []);

  const list = tab === 'mine' ? mine : community;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar left={<Txt variant="title">Viagens</Txt>} />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxxl }} showsVerticalScrollIndicator={false}>
        {trip ? (
          <Pressable onPress={() => router.push('/trip/live')} style={[styles.active, shadow.card]} testID="trip-active-card" accessibilityRole="button">
            <View style={styles.activeTop}>
              <View style={styles.dot} />
              <Txt variant="captionStrong" color="#0B6B45">
                Viagem ativa{trip.shareLive ? ' · compartilhando' : ''}
              </Txt>
              <View style={{ flex: 1 }} />
              <Ionicons name="chevron-forward" size={18} color="#0B6B45" />
            </View>
            <Txt variant="title">{trip.title}</Txt>
            <View style={{ flexDirection: 'row', gap: space.xl }}>
              <View>
                <Txt variant="micro" color={colors.inkMute}>
                  TEMPO
                </Txt>
                <Txt variant="heading">{formatClock(elapsedS)}</Txt>
              </View>
              <View>
                <Txt variant="micro" color={colors.inkMute}>
                  DISTÂNCIA
                </Txt>
                <Txt variant="heading">{formatDistance(distanceM)}</Txt>
              </View>
              <View>
                <Txt variant="micro" color={colors.inkMute}>
                  PARADAS
                </Txt>
                <Txt variant="heading">{stopCount}</Txt>
              </View>
            </View>
          </Pressable>
        ) : (
          <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, shadow.brand]}>
            <Txt variant="micro" color="rgba(255,255,255,0.85)">
              COMPARTILHAR VIAGEM
            </Txt>
            <Txt variant="title" color="#fff">
              Mostre o caminho, não só o destino.
            </Txt>
            <Txt variant="body" color="rgba(255,255,255,0.9)">
              Registramos a rota, as paradas e os momentos — e montamos o resumo quando você chegar.
            </Txt>
            <View style={{ marginTop: space.sm }}>
              <Pressable onPress={() => router.push('/trip/new')} style={styles.heroBtn} accessibilityRole="button" testID="trip-start">
                <Ionicons name="navigate" size={18} color={colors.ink} />
                <Txt variant="bodyStrong">Começar viagem</Txt>
              </Pressable>
            </View>
          </LinearGradient>
        )}

        <View style={{ paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.lg }}>
          <Segmented
            testID="trips-tab"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'mine', label: 'Minhas viagens' },
              { value: 'community', label: 'Comunidade' },
            ]}
          />
        </View>

        {list.loading && !list.data ? (
          <Loading />
        ) : (list.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon="navigate-outline"
            title={tab === 'mine' ? 'Você ainda não fez viagens' : 'Nenhuma viagem por aqui'}
            body={tab === 'mine' ? 'Comece uma viagem e o WaySocial monta o resumo quando você chegar.' : 'As viagens públicas e de quem você segue aparecem aqui.'}
            action={tab === 'mine' && !trip ? <GradientButton label="Começar viagem" full={false} size="md" onPress={() => router.push('/trip/new')} /> : undefined}
          />
        ) : (
          list.data!.map((t) => <TripCard key={t.id} trip={t} showOwner={tab === 'community'} />)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  active: { marginHorizontal: space.lg, marginTop: space.sm, padding: space.lg, gap: space.md, borderRadius: radius.xl, backgroundColor: colors.liveSoft, borderWidth: 1.5, borderColor: colors.live },
  activeTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.live },
  hero: { marginHorizontal: space.lg, marginTop: space.sm, padding: space.xl, gap: space.sm, borderRadius: radius.xl },
  heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: '#fff', paddingHorizontal: space.xl, height: 46, borderRadius: radius.pill },
});
