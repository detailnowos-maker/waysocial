import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { Chip, GradientButton, IconButton, Segmented, Txt } from '@/components/ui';
import { dataMode } from '@/config/env';
import type { TripVisibility } from '@/domain/types';
import { SIM_TIME_SCALE, useTripSession } from '@/state/TripSession';
import { simulatedRoutePresets } from '@/features/trip/locationSources';
import { useSession } from '@/state/ServicesProvider';
import { colors, radius, space } from '@/theme';

type Mode = 'gps' | 'sim';

const VISIBILITY_COPY: Record<TripVisibility, string> = {
  private: 'Só você vê. Nada é compartilhado — o resumo fica guardado no seu perfil.',
  followers: 'Quem segue você pode ver a viagem e, se você deixar, sua posição ao vivo no mapa.',
  public: 'Qualquer pessoa pode ver a viagem e, se você deixar, sua posição ao vivo no mapa.',
};

export default function NewTrip() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { profile } = useSession();
  const { start, trip } = useTripSession();
  const presets = simulatedRoutePresets();
  const [destination, setDestination] = useState('');
  const [visibility, setVisibility] = useState<TripVisibility>(profile?.defaultTripVisibility ?? 'private');
  const [shareLive, setShareLive] = useState((profile?.defaultTripVisibility ?? 'private') !== 'private');
  const [mode, setMode] = useState<Mode>(dataMode === 'mock' ? 'sim' : 'gps');
  const [presetId, setPresetId] = useState(presets[0].id);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (trip) router.replace('/trip/live');
  }, [trip, router]);

  const begin = async () => {
    setLoading(true);
    try {
      await start({
        plannedDestination: destination.trim() || null,
        visibility,
        shareLive: shareLive && visibility !== 'private',
        simulatePresetId: mode === 'sim' ? presetId : null,
      });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível começar a viagem.', { tone: 'error', durationMs: 5000 });
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: (Platform.OS === 'ios' ? space.lg : insets.top) + space.xs }]}>
        <IconButton icon="close" label="Fechar" onPress={() => router.back()} testID="trip-new-close" />
        <Txt variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          Começar viagem
        </Txt>
        <View style={{ width: 42 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl, paddingBottom: insets.bottom + space.xxxl }} keyboardShouldPersistTaps="handled">
        <Field label="Destino (opcional)" value={destination} onChangeText={setDestination} placeholder={mode === 'sim' ? (presets.find((p) => p.id === presetId)?.destination ?? 'Para onde?') : 'Para onde você vai?'} testID="trip-destination" />

        <View style={{ gap: space.sm }}>
          <Txt variant="captionStrong" color={colors.inkSoft}>
            Quem pode ver esta viagem
          </Txt>
          <Segmented<TripVisibility>
            testID="trip-visibility"
            value={visibility}
            onChange={(v) => {
              setVisibility(v);
              if (v === 'private') setShareLive(false);
            }}
            options={[
              { value: 'private', label: 'Só eu' },
              { value: 'followers', label: 'Seguidores' },
              { value: 'public', label: 'Público' },
            ]}
          />
          <Txt variant="caption" color={colors.inkSoft} testID="trip-visibility-copy">
            {VISIBILITY_COPY[visibility]}
          </Txt>
        </View>

        <View style={[styles.liveBox, { opacity: visibility === 'private' ? 0.5 : 1 }]}>
          <Ionicons name="radio" size={22} color={shareLive && visibility !== 'private' ? '#0E8F5C' : colors.inkMute} />
          <View style={{ flex: 1 }}>
            <Txt variant="bodyStrong">Compartilhar posição ao vivo</Txt>
            <Txt variant="caption" color={colors.inkSoft}>
              Aparece no mapa enquanto a viagem estiver ativa. Você pode parar a qualquer momento.
            </Txt>
          </View>
          <Switch value={shareLive && visibility !== 'private'} disabled={visibility === 'private'} onValueChange={setShareLive} trackColor={{ true: colors.live }} accessibilityLabel="Compartilhar posição ao vivo" testID="trip-share-live" />
        </View>

        <View style={{ gap: space.sm }}>
          <Txt variant="captionStrong" color={colors.inkSoft}>
            Origem do deslocamento
          </Txt>
          <Segmented<Mode>
            testID="trip-mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'gps', label: 'GPS do aparelho' },
              { value: 'sim', label: 'Simulação (demo)' },
            ]}
          />
          {mode === 'sim' ? (
            <View style={{ gap: space.sm }}>
              <Txt variant="caption" color={colors.inkSoft}>
                Simula um deslocamento pelas estradas do mapa (1 segundo real ≈ {SIM_TIME_SCALE / 60} minuto de viagem), ótimo para ver tudo funcionando sem sair de casa.
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {presets.map((p) => (
                  <Chip key={p.id} label={p.label} selected={presetId === p.id} onPress={() => setPresetId(p.id)} testID={`trip-preset-${p.id}`} />
                ))}
              </View>
            </View>
          ) : (
            <Txt variant="caption" color={colors.inkSoft}>
              Usa a localização do aparelho (permissão pedida só agora). Mantenha o app aberto durante a viagem.
            </Txt>
          )}
        </View>

        <Pressable style={styles.notice} accessibilityRole="text">
          <Ionicons name="shield-checkmark" size={18} color="#0E8F5C" />
          <Txt variant="caption" color="#0B6B45" style={{ flex: 1 }}>
            Enquanto a viagem estiver ativa, o app mostra um aviso claro de que o compartilhamento está ligado.
          </Txt>
        </Pressable>

        <GradientButton label="Começar viagem" icon="navigate" onPress={begin} loading={loading} testID="trip-begin" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingBottom: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  liveBox: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.liveSoft },
});
