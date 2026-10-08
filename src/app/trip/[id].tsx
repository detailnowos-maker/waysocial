import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Header } from '@/components/Header';
import { MediaView } from '@/components/MediaView';
import { ActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Button, EmptyState, IconButton, Loading, Pill, SectionHeader, Segmented, Txt } from '@/components/ui';
import type { TripVisibility } from '@/domain/types';
import { TripRouteMap } from '@/features/trip/TripRouteMap';
import { formatClock, formatDateTime, formatDistance, formatDuration, timeAgo } from '@/lib/format';
import type { MapMarker } from '@/map';
import { useRepo, useServices, useSession } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors, radius, space } from '@/theme';

function Stat({ icon, value, label, testID }: { icon: React.ComponentProps<typeof Ionicons>['name']; value: string; label: string; testID?: string }) {
  return (
    <View style={styles.stat} testID={testID}>
      <Ionicons name={icon} size={20} color={colors.brand} />
      <Txt variant="title">{value}</Txt>
      <Txt variant="micro" color={colors.inkMute}>
        {label}
      </Txt>
    </View>
  );
}

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const repo = useRepo();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { ai } = useServices();
  const { userId } = useSession();
  const trip = useQuery(() => repo.getTrip(id), [id], { pollMs: 15_000 });
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  const t = trip.data;
  const route = useMemo(() => (t?.points ?? []).map((p) => ({ lat: p.lat, lng: p.lng })), [t?.points]);
  const markers = useMemo<MapMarker[]>(() => {
    if (!t) return [];
    const ms: MapMarker[] = [];
    for (const [i, p] of t.points.entries()) if (p.kind === 'stop') ms.push({ id: `stop-${i}`, kind: 'stop', lat: p.lat, lng: p.lng });
    for (const m of t.moments) ms.push({ id: m.id, kind: 'moment', lat: m.lat, lng: m.lng, media: m.media });
    if (t.status === 'active' && t.lastLat != null && t.lastLng != null) ms.push({ id: 'live', kind: 'live', lat: t.lastLat, lng: t.lastLng, avatar: t.owner, pinned: true });
    return ms;
  }, [t]);

  if (trip.loading && !t) return <Loading />;
  if (!t) return <EmptyState icon="lock-closed-outline" title="Viagem indisponível" body="Ela pode ser privada, ter sido removida ou o perfil exige que você siga a pessoa." />;

  const mine = t.owner.id === userId;
  const live = t.status === 'active';
  const title = mine && !live ? 'Minha viagem' : live ? 'Viagem ao vivo' : 'Viagem';

  const generateSummary = async () => {
    setSummarizing(true);
    try {
      const text = await ai.summarizeTrip({ origin: t.originName, destination: t.destinationName, distanceM: t.distanceM, durationS: t.durationS, stopCount: t.stopCount, momentCount: t.photoCount + t.videoCount });
      await repo.updateTrip(t.id, { summary: text });
    } catch {
      toast.show('Não foi possível gerar o resumo agora.', { tone: 'error' });
    } finally {
      setSummarizing(false);
    }
  };

  const share = async () => {
    const url = Linking.createURL(`/trip/${t.id}`);
    try {
      await Share.share({ message: `${t.title} — ${formatDistance(t.distanceM)} em ${formatDuration(t.durationS)} no WaySocial ${url}`, url });
    } catch {
      toast.show('Compartilhar não está disponível aqui.', { tone: 'error' });
    }
  };

  const visibilityNote: Record<TripVisibility, string> = {
    private: 'Só você vê esta viagem.',
    followers: 'Visível para quem segue você.',
    public: 'Visível para todos.',
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title={title}
        subtitle={live ? 'Ao vivo' : formatDateTime(t.startedAt)}
        right={mine ? <IconButton icon="ellipsis-horizontal" label="Mais opções" onPress={() => setMenu(true)} testID="trip-menu" /> : <IconButton icon="paper-plane-outline" label="Compartilhar" onPress={() => void share()} />}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxxl }} showsVerticalScrollIndicator={false}>
        <View style={styles.map} testID="trip-map">
          <TripRouteMap route={route} markers={markers} interactive controls selectedId={selected} onMarkerPress={(m) => setSelected(m.id)} padding={{ top: 36, bottom: 36, left: 36, right: 60 }} />
        </View>

        <View style={{ padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Avatar profile={t.owner} size={30} ring={live ? 'live' : 'none'} />
            <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: t.owner.id } })}>
              <Txt variant="captionStrong">{t.owner.displayName}</Txt>
            </Pressable>
            {live ? (
              <Pill tone="live" icon="radio">
                AO VIVO
              </Pill>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pill tone="neutral" icon={t.visibility === 'private' ? 'lock-closed' : t.visibility === 'followers' ? 'people' : 'earth'}>
              {t.visibility === 'private' ? 'Só eu' : t.visibility === 'followers' ? 'Seguidores' : 'Público'}
            </Pill>
          </View>

          <Txt variant="display" testID="trip-title">
            {t.title}
          </Txt>

          <View style={styles.endpoints}>
            <View style={styles.endpoint}>
              <Ionicons name="radio-button-on" size={16} color={colors.ink} />
              <View>
                <Txt variant="micro" color={colors.inkMute}>
                  ORIGEM
                </Txt>
                <Txt variant="bodyStrong">{t.originName}</Txt>
              </View>
            </View>
            <View style={styles.connector} />
            <View style={styles.endpoint}>
              <Ionicons name="flag" size={16} color={colors.brand} />
              <View>
                <Txt variant="micro" color={colors.inkMute}>
                  {live ? 'DESTINO PLANEJADO' : 'DESTINO'}
                </Txt>
                <Txt variant="bodyStrong">{(live ? t.plannedDestination : t.destinationName) ?? 'Livre'}</Txt>
              </View>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <Stat icon="speedometer-outline" value={formatDistance(t.distanceM)} label="Distância" testID="trip-stat-distance" />
            <Stat icon="time-outline" value={live ? formatClock(t.durationS) : formatDuration(t.durationS)} label="Tempo" testID="trip-stat-time" />
            <Stat icon="pause-circle-outline" value={String(t.stopCount)} label="Paradas" testID="trip-stat-stops" />
          </View>
          <View style={styles.statsGrid}>
            <Stat icon="camera-outline" value={String(t.photoCount)} label="Fotos" testID="trip-stat-photos" />
            <Stat icon="videocam-outline" value={String(t.videoCount)} label="Vídeos" testID="trip-stat-videos" />
            <Stat icon="calendar-outline" value={new Date(t.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} label={live ? 'Saída' : 'Início'} />
          </View>

          <View style={styles.summary} testID="trip-summary">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles" size={16} color={colors.brand} />
              <Txt variant="captionStrong" color={colors.brand}>
                Resumo da viagem
              </Txt>
            </View>
            {t.summary ? (
              <Txt variant="body" testID="trip-summary-text">
                {t.summary}
              </Txt>
            ) : mine && !live ? (
              <Button label="Gerar resumo" icon="sparkles-outline" kind="soft" size="sm" loading={summarizing} onPress={generateSummary} />
            ) : (
              <Txt color={colors.inkMute}>{live ? 'O resumo é criado quando a viagem terminar.' : 'Sem resumo.'}</Txt>
            )}
          </View>
        </View>

        {t.moments.length > 0 ? (
          <>
            <SectionHeader title={`Momentos (${t.moments.length})`} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
              {t.moments.map((m) => (
                <Pressable key={m.id} onPress={() => setSelected(m.id)} style={[styles.moment, selected === m.id ? { borderColor: colors.brand } : null]} testID={`moment-${m.id}`}>
                  <MediaView media={m.media} style={StyleSheet.absoluteFill} />
                  <View style={styles.momentTime}>
                    <Txt variant="micro" color="#fff">
                      {timeAgo(m.takenAt)}
                    </Txt>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {mine && !live ? (
          <View style={{ padding: space.lg, gap: space.md, marginTop: space.lg }}>
            <Txt variant="captionStrong" color={colors.inkSoft}>
              Quem pode ver
            </Txt>
            <Segmented<TripVisibility>
              testID="trip-edit-visibility"
              value={t.visibility}
              onChange={async (v) => {
                await repo.updateTrip(t.id, { visibility: v });
                toast.show(visibilityNote[v], { icon: v === 'private' ? 'lock-closed' : 'people' });
              }}
              options={[
                { value: 'private', label: 'Só eu' },
                { value: 'followers', label: 'Seguidores' },
                { value: 'public', label: 'Público' },
              ]}
            />
            <Txt variant="caption" color={colors.inkMute}>
              {visibilityNote[t.visibility]}
            </Txt>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              <Button label="Compartilhar viagem" icon="paper-plane-outline" kind="primary" onPress={() => void share()} style={{ flex: 1 }} testID="trip-share" />
              <Button
                label="Vídeo (em breve)"
                icon="film-outline"
                kind="secondary"
                onPress={async () => {
                  const job = await ai.createTripVideo({ tripId: t.id });
                  toast.show(job.status === 'unavailable' ? job.reason : 'Vídeo em produção', { icon: 'film' });
                }}
                style={{ flex: 1 }}
                testID="trip-video"
              />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title="Sua viagem"
        actions={[
          { label: 'Compartilhar', icon: 'paper-plane-outline', onPress: () => void share() },
          { label: 'Excluir viagem', icon: 'trash-outline', destructive: true, testID: 'trip-delete', onPress: () => setConfirmDelete(true) },
        ]}
      />
      <ActionSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Excluir esta viagem?"
        actions={[
          {
            label: 'Excluir definitivamente',
            destructive: true,
            icon: 'trash-outline',
            testID: 'trip-delete-confirm',
            onPress: async () => {
              await repo.deleteTrip(t.id);
              toast.show('Viagem excluída');
              router.replace('/trips');
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 300 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  statsGrid: { flexDirection: 'row', gap: space.sm },
  endpoints: { padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, gap: 4 },
  endpoint: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  connector: { width: 2, height: 14, backgroundColor: colors.line, marginLeft: 7 },
  summary: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.brandSoft },
  moment: { width: 108, height: 140, borderRadius: radius.md, overflow: 'hidden', borderWidth: 2.5, borderColor: 'transparent' },
  momentTime: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, borderRadius: 6 },
});
