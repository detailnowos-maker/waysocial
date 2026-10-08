import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { MediaView } from '@/components/MediaView';
import { useToast } from '@/components/Toast';
import { Button, GradientButton, IconButton, Txt, haptic } from '@/components/ui';
import type { LocationPrecision, Place } from '@/domain/types';
import { getDraft, resetDraft, setDraft, useDraft } from '@/features/compose/draft';
import { type MediaSource, demoPhoto, pickMedia } from '@/features/compose/pickMedia';
import { getDevicePositionIfPermitted } from '@/features/trip/locationSources';
import type { CaptionSuggestion } from '@/services/ai';
import { useRepo, useServices, useSession } from '@/state/ServicesProvider';
import { useTripSession } from '@/state/TripSession';
import { useQuery } from '@/state/useQuery';
import { colors, radius, space, type } from '@/theme';

const MAX_CAPTION = 280;

function locationLabel(precision: LocationPrecision | null, place: Place | null | undefined): { title: string; sub: string; icon: 'location' | 'location-outline' | 'shield-checkmark' | 'locate'; tone: string } {
  if (precision === 'place' && place) return { title: place.name, sub: `${place.cityName} · usa as coordenadas do lugar`, icon: 'location', tone: colors.brand };
  if (precision === 'approx') return { title: 'Região aproximada', sub: 'Mostra só a área (~1 km), não o ponto exato', icon: 'shield-checkmark', tone: '#0E8F5C' };
  if (precision === 'exact') return { title: 'Localização exata', sub: 'Compartilha o ponto exato onde você está', icon: 'locate', tone: colors.info };
  return { title: 'Em que lugar você está?', sub: 'Sem localização — a publicação não aparece no mapa', icon: 'location-outline', tone: colors.inkMute };
}

export default function Compose() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const repo = useRepo();
  const { ai } = useServices();
  const { profile } = useSession();
  const { trip } = useTripSession();
  const draft = useDraft();
  const [caption, setCaption] = useState('');
  const [suggestions, setSuggestions] = useState<CaptionSuggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [linkTrip, setLinkTrip] = useState(true);
  const [index, setIndex] = useState(0);

  const place = useQuery(() => (draft.placeId ? repo.getPlace(draft.placeId) : Promise.resolve(null)), [draft.placeId]);

  // Sem escolha explícita, não há localização.
  const precision: LocationPrecision = draft.precision ?? 'none';
  const loc = locationLabel(precision, place.data);
  const canPublish = draft.media.length > 0 && !publishing;

  // Preferência "região aproximada por padrão": só usa o GPS se a permissão JÁ foi concedida (nunca pergunta sozinho).
  useEffect(() => {
    if (!profile?.shareLocationByDefault || getDraft().precision !== null) return;
    let alive = true;
    void getDevicePositionIfPermitted().then((p) => {
      if (alive && p && getDraft().precision === null) setDraft({ precision: 'approx', deviceLocation: p, placeId: null });
    });
    return () => {
      alive = false;
    };
  }, [profile?.shareLocationByDefault]);

  const pick = async (source: MediaSource) => {
    try {
      const media = await pickMedia(source);
      if (media) setDraft({ media: [...draft.media, ...media].slice(0, 6) });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível abrir a câmera.', { tone: 'error' });
    }
  };

  const suggest = async () => {
    setSuggesting(true);
    try {
      const p = place.data;
      const res = await ai.suggestCaptions({ placeName: p?.name ?? null, cityName: p?.cityName ?? null, category: p?.category ?? null, mediaType: draft.media[0]?.type ?? 'image', takenAt: new Date() });
      setSuggestions(res);
    } catch {
      toast.show('A sugestão de legenda falhou. Escreva a sua!', { tone: 'error' });
    } finally {
      setSuggesting(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const post = await repo.createPost({
        media: draft.media,
        caption,
        placeId: precision === 'none' ? null : draft.placeId,
        deviceLocation: draft.deviceLocation,
        precision,
        tripId: trip && linkTrip ? trip.id : null,
      });
      haptic('success');
      resetDraft();
      const unlocked = await repo.popNewAchievements();
      router.back();
      toast.show(unlocked.length ? `${unlocked[0].emoji} Conquista: ${unlocked[0].title}` : 'Publicado!', {
        tone: 'success',
        durationMs: 4200,
        onPress: () => router.push({ pathname: '/post/[id]', params: { id: post.id } }),
      });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível publicar.', { tone: 'error' });
      setPublishing(false);
    }
  };

  const close = () => {
    resetDraft();
    router.back();
  };

  const media = draft.media;
  const current = media[Math.min(index, Math.max(0, media.length - 1))];
  const privacyText = useMemo(() => {
    if (precision === 'none') return 'Sem localização: só quem segue você verá a publicação no feed.';
    if (precision === 'place') return 'Somente o lugar escolhido é compartilhado — nunca a sua posição.';
    if (precision === 'approx') return 'Sua posição será arredondada (~1 km) antes de ser salva.';
    return 'Atenção: o ponto exato onde você está será compartilhado.';
  }, [precision]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: (Platform.OS === 'ios' ? space.lg : insets.top) + space.xs }]}>
        <IconButton icon="close" label="Fechar" onPress={close} testID="compose-close" />
        <Txt variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          Nova publicação
        </Txt>
        <Button label="Publicar" size="sm" kind="brand" disabled={!canPublish} loading={publishing} onPress={publish} testID="compose-publish" />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: insets.bottom + space.xxxl }} keyboardShouldPersistTaps="handled">
        {current ? (
          <View style={{ gap: space.sm }}>
            <MediaView media={current} playable style={styles.preview} />
            {media.length > 1 ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {media.map((m, i) => (
                  <Pressable key={i} onPress={() => setIndex(i)} style={[styles.thumb, i === index ? styles.thumbActive : null]}>
                    <MediaView media={m} style={StyleSheet.absoluteFill} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button label="Adicionar foto" icon="camera-outline" kind="secondary" size="sm" onPress={() => void pick('camera-photo')} />
              <Button label="Galeria" icon="images-outline" kind="secondary" size="sm" onPress={() => void pick('library')} />
              <Button
                label="Remover"
                icon="trash-outline"
                kind="danger"
                size="sm"
                onPress={() => {
                  const next = media.filter((_, i) => i !== index);
                  setDraft({ media: next });
                  setIndex(0);
                }}
              />
            </View>
          </View>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="image-outline" size={36} color={colors.inkMute} />
            <Txt color={colors.inkSoft} align="center">
              Escolha uma foto ou vídeo para publicar{place.data ? ` em ${place.data.name}` : ''}.
            </Txt>
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button label="Tirar foto" icon="camera-outline" kind="primary" size="sm" onPress={() => void pick('camera-photo')} testID="compose-camera" />
              <Button label="Gravar vídeo" icon="videocam-outline" kind="secondary" size="sm" onPress={() => void pick('camera-video')} />
              <Button label="Galeria" icon="images-outline" kind="secondary" size="sm" onPress={() => void pick('library')} testID="compose-library" />
              <Button label="Foto de demonstração" icon="sparkles-outline" kind="soft" size="sm" onPress={() => setDraft({ media: [demoPhoto()] })} testID="compose-demo" />
            </View>
          </View>
        )}

        <Pressable style={styles.locationRow} onPress={() => router.push('/place-picker')} accessibilityRole="button" testID="compose-location">
          <View style={[styles.locationIcon, { backgroundColor: precision === 'none' ? colors.surface : `${loc.tone}1A` }]}>
            <Ionicons name={loc.icon} size={22} color={loc.tone} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong" numberOfLines={1} testID="compose-location-title">
              {loc.title}
            </Txt>
            <Txt variant="caption" color={colors.inkSoft} numberOfLines={2}>
              {loc.sub}
            </Txt>
          </View>
          {precision !== 'none' ? (
            <Pressable
              hitSlop={10}
              accessibilityLabel="Remover localização"
              onPress={() => setDraft({ placeId: null, precision: 'none', deviceLocation: null })}
              testID="compose-location-clear">
              <Ionicons name="close-circle" size={22} color={colors.inkMute} />
            </Pressable>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
          )}
        </Pressable>

        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            {profile ? <Avatar profile={profile} size={28} /> : null}
            <Txt variant="captionStrong" color={colors.inkSoft} style={{ flex: 1 }}>
              Legenda
            </Txt>
            <Txt variant="caption" color={colors.inkMute}>
              {caption.length}/{MAX_CAPTION}
            </Txt>
          </View>
          <TextInput
            value={caption}
            onChangeText={(t) => setCaption(t.slice(0, MAX_CAPTION))}
            placeholder="Esse lugar é absurdo de bonito."
            placeholderTextColor={colors.inkMute}
            multiline
            style={styles.caption}
            accessibilityLabel="Legenda"
            testID="compose-caption"
          />
          <Pressable style={styles.aiBtn} onPress={() => void suggest()} disabled={suggesting || media.length === 0} accessibilityRole="button" testID="compose-ai">
            <Ionicons name="sparkles" size={16} color={colors.brand} />
            <Txt variant="captionStrong" color={colors.brand}>
              {suggesting ? 'Pensando numa legenda…' : suggestions ? 'Sugerir outras legendas' : 'Sugerir legenda com IA'}
            </Txt>
          </Pressable>
          {suggestions ? (
            <View style={{ gap: space.sm }}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.tone}
                  style={styles.suggestion}
                  onPress={() => {
                    haptic();
                    setCaption(s.text.slice(0, MAX_CAPTION));
                  }}
                  accessibilityRole="button"
                  testID={`ai-${s.tone}`}>
                  <Txt variant="micro" color={colors.brand}>
                    {s.label.toUpperCase()}
                  </Txt>
                  <Txt variant="body">{s.text}</Txt>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {trip ? (
          <View style={styles.switchRow}>
            <Ionicons name="navigate" size={20} color="#0E8F5C" />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">Vincular à viagem ativa</Txt>
              <Txt variant="caption" color={colors.inkSoft}>
                A publicação aparece no resumo da viagem.
              </Txt>
            </View>
            <Switch value={linkTrip} onValueChange={setLinkTrip} trackColor={{ true: colors.live }} />
          </View>
        ) : null}

        <View style={styles.privacy}>
          <Ionicons name="lock-closed" size={16} color={colors.inkSoft} />
          <Txt variant="caption" color={colors.inkSoft} style={{ flex: 1 }}>
            {privacyText}
          </Txt>
        </View>

        <GradientButton label="Publicar" onPress={publish} loading={publishing} disabled={!canPublish} testID="compose-publish-bottom" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  preview: { width: '100%', aspectRatio: 1, maxHeight: 380, borderRadius: radius.lg },
  thumb: { width: 54, height: 54, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbActive: { borderColor: colors.brand },
  empty: { alignItems: 'center', gap: space.md, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  locationIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  caption: { ...type.body, minHeight: 96, textAlignVertical: 'top', backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg, color: colors.ink, outlineStyle: 'none' } as never,
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: space.md, height: 34, borderRadius: radius.pill, backgroundColor: colors.brandSoft },
  suggestion: { gap: 2, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.liveSoft },
  privacy: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});
