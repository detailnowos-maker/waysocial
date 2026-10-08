import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MediaView } from '@/components/MediaView';
import { ActionSheet, Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Button, GradientButton, Txt, haptic } from '@/components/ui';
import { type DraftMedia } from '@/features/compose/draft';
import { demoPhoto, pickMedia } from '@/features/compose/pickMedia';
import { formatClock, formatDistance } from '@/lib/format';
import { type MapFocus, type MapMarker, SocialMap } from '@/map';
import { SIM_TIME_SCALE, useTripSession } from '@/state/TripSession';
import { useSession } from '@/state/ServicesProvider';
import { colors, radius, shadow, space, type } from '@/theme';

export default function LiveTrip() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { profile } = useSession();
  const t = useTripSession();
  const { trip, position, points } = t;

  const [follow, setFollow] = useState(true);
  const [momentMenu, setMomentMenu] = useState(false);
  const [captured, setCaptured] = useState<DraftMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [toFeed, setToFeed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // sem viagem ativa não há o que mostrar aqui
  useEffect(() => {
    if (!trip && !finishing) router.replace('/trips');
  }, [trip, finishing, router]);

  // acompanha a posição enquanto "seguir" estiver ligado
  const posKey = position ? `${position.lat.toFixed(4)},${position.lng.toFixed(4)}` : null;
  const focus = useMemo<MapFocus | undefined>(
    () => (follow && position ? { key: `follow-${posKey}`, center: position, zoom: t.simulated ? 10.2 : 15 } : undefined),
    [follow, posKey, t.simulated], // eslint-disable-line react-hooks/exhaustive-deps -- `position` é resumida por posKey
  );

  const route = useMemo(() => points.map((p) => ({ lat: p.lat, lng: p.lng })), [points]);
  const lines = useMemo(() => (route.length > 1 ? [{ id: 'route', coords: route, color: colors.brand, width: 6 }] : []), [route]);

  const markers = useMemo<MapMarker[]>(() => {
    const ms: MapMarker[] = [];
    if (route.length) ms.push({ id: 'origin', kind: 'origin', lat: route[0].lat, lng: route[0].lng, pinned: true });
    for (const [i, p] of points.entries()) if (p.kind === 'stop') ms.push({ id: `stop-${i}`, kind: 'stop', lat: p.lat, lng: p.lng, pinned: true });
    for (const m of trip?.moments ?? []) ms.push({ id: m.id, kind: 'moment', lat: m.lat, lng: m.lng, media: m.media, pinned: true });
    if (position && profile) ms.push({ id: 'me', kind: 'live', lat: position.lat, lng: position.lng, avatar: profile, pinned: true });
    return ms;
  }, [route, points, trip?.moments, position, profile]);

  if (!trip) return null;
  const sharing = trip.shareLive;
  const visibilityLabel = trip.visibility === 'private' ? 'Só você vê esta viagem' : trip.visibility === 'followers' ? 'Seguidores' : 'Público';

  const capture = async (source: 'camera-photo' | 'camera-video' | 'demo') => {
    try {
      if (source === 'demo') {
        setCaptured(demoPhoto());
        return;
      }
      const res = await pickMedia(source);
      if (res?.[0]) setCaptured(res[0]);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível abrir a câmera.', { tone: 'error' });
    }
  };

  const saveMoment = async () => {
    if (!captured) return;
    setSaving(true);
    try {
      await t.addMoment(captured, { caption: caption.trim() || undefined, publishToFeed: toFeed });
      haptic('success');
      toast.show(toFeed ? 'Momento salvo e publicado (localização aproximada)' : 'Momento registrado neste ponto do caminho', { tone: 'success', icon: 'camera' });
      setCaptured(null);
      setCaption('');
      setToFeed(false);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível salvar o momento.', { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    try {
      const done = await t.finish();
      haptic('success');
      router.replace({ pathname: '/trip/[id]', params: { id: done.id } });
    } catch (e) {
      setFinishing(false);
      toast.show(e instanceof Error ? e.message : 'Não foi possível finalizar.', { tone: 'error' });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SocialMap
        testID="live-map"
        markers={markers}
        lines={lines}
        initial={{ center: position ?? { lat: trip.lastLat ?? -26.9, lng: trip.lastLng ?? -48.7 }, zoom: t.simulated ? 10.2 : 15 }}
        focus={focus}
        padding={{ top: 140, bottom: 330, left: 40, right: 40 }}
        onGestureStart={() => setFollow(false)}
        onLocatePress={() => setFollow(true)}
      />

      <View style={[styles.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <View style={styles.statusRow}>
          <Pressable onPress={() => router.back()} style={[styles.round, shadow.card]} accessibilityLabel="Minimizar viagem" testID="live-minimize">
            <Ionicons name="chevron-down" size={22} color={colors.ink} />
          </Pressable>
          <View style={[styles.statusPill, shadow.card]} testID="live-status">
            <View style={styles.liveDot} />
            <View style={{ flexShrink: 1 }}>
              <Txt variant="captionStrong" color="#0B6B45">
                Viagem ativa
              </Txt>
              <Txt variant="micro" color={sharing ? '#0B6B45' : colors.inkMute} numberOfLines={1} testID="live-sharing-label">
                {sharing ? `Compartilhando posição · ${visibilityLabel}` : visibilityLabel}
              </Txt>
            </View>
          </View>
        </View>
        {t.simulated ? (
          <View style={styles.simTag}>
            <Ionicons name="flask" size={12} color="#fff" />
            <Txt variant="micro" color="#fff">
              SIMULAÇÃO ×{SIM_TIME_SCALE}
            </Txt>
          </View>
        ) : null}
      </View>

      <View style={[styles.panel, shadow.float, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
        <View style={styles.grab} />
        {t.arrived ? (
          <View style={styles.arrived}>
            <Ionicons name="flag" size={18} color={colors.brand} />
            <Txt variant="captionStrong" color={colors.brand}>
              Você chegou! Finalize a viagem para gerar o resumo.
            </Txt>
          </View>
        ) : null}
        <Txt variant="caption" color={colors.inkSoft} numberOfLines={1}>
          {trip.originName} → {trip.plannedDestination ?? 'destino livre'}
        </Txt>
        <View style={styles.stats}>
          <View style={styles.statBig}>
            <Txt variant="micro" color={colors.inkMute}>
              TEMPO
            </Txt>
            <Txt style={styles.statValue} numberOfLines={1} testID="live-time">
              {formatClock(t.elapsedS)}
            </Txt>
          </View>
          <View style={styles.statBig}>
            <Txt variant="micro" color={colors.inkMute}>
              DISTÂNCIA
            </Txt>
            <Txt style={styles.statValue} numberOfLines={1} testID="live-distance">
              {formatDistance(t.distanceM)}
            </Txt>
          </View>
          <View style={styles.statBig}>
            <Txt variant="micro" color={colors.inkMute}>
              PARADAS
            </Txt>
            <Txt style={styles.statValue} testID="live-stops">
              {t.stopCount}
            </Txt>
          </View>
        </View>

        <GradientButton label="Registrar momento" icon="camera" onPress={() => setMomentMenu(true)} testID="live-moment" />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            label="Marcar parada"
            icon="pause-circle-outline"
            kind="secondary"
            size="sm"
            style={{ flex: 1 }}
            testID="live-stop"
            onPress={async () => {
              try {
                await t.markStop();
                toast.show('Parada registrada', { icon: 'pause-circle' });
              } catch (e) {
                toast.show(e instanceof Error ? e.message : 'Erro ao marcar parada.', { tone: 'error' });
              }
            }}
          />
          {trip.visibility !== 'private' ? (
            <Button
              label={sharing ? 'Parar de compartilhar' : 'Compartilhar ao vivo'}
              icon={sharing ? 'eye-off-outline' : 'radio-outline'}
              kind={sharing ? 'soft' : 'secondary'}
              size="sm"
              style={{ flex: 1.3 }}
              testID="live-toggle-share"
              onPress={async () => {
                await t.setShareLive(!sharing);
                toast.show(sharing ? 'Compartilhamento parado — só você vê sua posição' : 'Compartilhando sua posição ao vivo', { icon: sharing ? 'eye-off' : 'radio' });
              }}
            />
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button label="Finalizar viagem" icon="flag-outline" kind="primary" full style={{ flex: 1 }} testID="live-finish" onPress={() => setConfirmFinish(true)} />
          <Button label="" icon="trash-outline" kind="danger" style={{ width: 46, paddingHorizontal: 0 }} onPress={() => setConfirmCancel(true)} testID="live-cancel" />
        </View>
      </View>

      <ActionSheet
        visible={momentMenu}
        onClose={() => setMomentMenu(false)}
        title="Registrar momento"
        actions={[
          { label: 'Tirar foto', icon: 'camera-outline', testID: 'moment-photo', onPress: () => void capture('camera-photo') },
          { label: 'Gravar vídeo', icon: 'videocam-outline', testID: 'moment-video', onPress: () => void capture('camera-video') },
          { label: 'Foto de demonstração', subtitle: 'Para testar sem câmera', icon: 'sparkles-outline', testID: 'moment-demo', onPress: () => void capture('demo') },
        ]}
      />

      <Sheet visible={!!captured} onClose={() => !saving && setCaptured(null)} title="Novo momento">
        <View style={{ paddingHorizontal: space.xl, gap: space.md }}>
          {captured ? <MediaView media={captured} style={{ height: 180, borderRadius: radius.lg }} /> : null}
          <Txt variant="caption" color={colors.inkSoft}>
            📍 Vinculado ao ponto do caminho em que você está agora.
          </Txt>
          <TextInput value={caption} onChangeText={setCaption} placeholder="Legenda (opcional)" placeholderTextColor={colors.inkMute} style={styles.input} testID="moment-caption" />
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">Publicar também no feed</Txt>
              <Txt variant="caption" color={colors.inkSoft}>
                Vai só com a região aproximada (~1 km), nunca o ponto exato.
              </Txt>
            </View>
            <Switch value={toFeed} onValueChange={setToFeed} trackColor={{ true: colors.brand }} testID="moment-feed-switch" />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="Cancelar" kind="secondary" onPress={() => setCaptured(null)} style={{ flex: 1 }} />
            <Button label="Salvar momento" kind="brand" loading={saving} onPress={saveMoment} style={{ flex: 2 }} testID="moment-save" />
          </View>
        </View>
      </Sheet>

      <ActionSheet
        visible={confirmFinish}
        onClose={() => setConfirmFinish(false)}
        title="Finalizar a viagem?"
        actions={[{ label: 'Finalizar e ver o resumo', icon: 'flag', testID: 'live-finish-confirm', onPress: () => void finish() }]}
        cancelLabel="Continuar viajando"
      />
      <ActionSheet
        visible={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Descartar esta viagem?"
        actions={[
          {
            label: 'Descartar viagem',
            subtitle: 'Apaga trajeto e momentos registrados',
            destructive: true,
            icon: 'trash-outline',
            testID: 'live-cancel-confirm',
            onPress: async () => {
              setFinishing(true);
              await t.cancel();
              router.replace('/trips');
            },
          },
        ]}
        cancelLabel="Voltar"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.md, gap: space.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  statusPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: space.lg, height: 48, borderWidth: 1.5, borderColor: colors.live },
  liveDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.live },
  simTag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.info, paddingHorizontal: 10, height: 22, borderRadius: radius.pill, marginLeft: 52 },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line },
  arrived: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: space.md, borderRadius: radius.md, backgroundColor: colors.brandSoft },
  stats: { flexDirection: 'row', gap: space.sm },
  statBig: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: space.md, paddingHorizontal: space.md, gap: 2 },
  statValue: { ...type.title, fontSize: 20, lineHeight: 26, color: colors.ink, fontVariant: ['tabular-nums'] },
  input: { ...type.body, height: 48, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: space.lg, color: colors.ink, outlineStyle: 'none' } as never,
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
});
