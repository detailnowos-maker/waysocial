import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Field } from '@/components/Field';
import { Header } from '@/components/Header';
import { useToast } from '@/components/Toast';
import { Divider, EmptyState, Loading, Txt } from '@/components/ui';
import type { Place } from '@/domain/types';
import { setDraft } from '@/features/compose/draft';
import { getDevicePosition } from '@/features/trip/locationSources';
import { formatDistance, normalize } from '@/lib/format';
import { type LatLng, haversine } from '@/lib/geo';
import { CATEGORY_STYLE } from '@/map';
import { useRepo } from '@/state/ServicesProvider';
import { useQuery } from '@/state/useQuery';
import { colors, radius, space } from '@/theme';

export default function PlacePicker() {
  const router = useRouter();
  const repo = useRepo();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [here, setHere] = useState<LatLng | null>(null);
  const places = useQuery(() => repo.listPlaces({}), []);

  useEffect(() => {
    let alive = true;
    void getDevicePosition().then((p) => alive && setHere(p));
    return () => {
      alive = false;
    };
  }, []);

  const list = useMemo(() => {
    const all = (places.data ?? []).filter((p) => p.kind !== 'city');
    const needle = normalize(q);
    const filtered = needle ? all.filter((p) => normalize(`${p.name} ${p.cityName}`).includes(needle)) : all;
    const withDist = filtered.map((p) => ({ p, d: here ? haversine(here, p) : null }));
    return withDist.sort((a, b) => (a.d != null && b.d != null ? a.d - b.d : (b.p.ratingCount ?? 0) - (a.p.ratingCount ?? 0)));
  }, [places.data, q, here]);

  const choose = (p: Place) => {
    setDraft({ placeId: p.id, precision: 'place', deviceLocation: null });
    router.back();
  };

  const chooseMyLocation = async (precision: 'approx' | 'exact') => {
    const pos = here ?? (await getDevicePosition());
    if (!pos) {
      toast.show('Não conseguimos sua localização. Ative o GPS e a permissão — ou escolha um lugar da lista.', { tone: 'error' });
      return;
    }
    setDraft({ placeId: null, precision, deviceLocation: pos });
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Em que lugar você está?" />
      <View style={{ padding: space.lg, gap: space.md }}>
        <Field value={q} onChangeText={setQ} placeholder="Buscar praia, restaurante, parque, cidade…" autoFocus={false} testID="picker-search" />
      </View>
      <FlatList
        data={list}
        keyExtractor={(i) => i.p.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.md }}>
            <Txt variant="micro" color={colors.inkMute}>
              SUA LOCALIZAÇÃO (VOCÊ ESCOLHE A PRECISÃO)
            </Txt>
            <Pressable style={styles.option} onPress={() => void chooseMyLocation('approx')} testID="picker-approx">
              <View style={[styles.optionIcon, { backgroundColor: colors.liveSoft }]}>
                <Ionicons name="shield-checkmark" size={20} color="#0E8F5C" />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">Região aproximada</Txt>
                <Txt variant="caption" color={colors.inkSoft}>
                  Mostra só a área (~1 km), não o ponto exato. Recomendado.
                </Txt>
              </View>
            </Pressable>
            <Pressable style={styles.option} onPress={() => void chooseMyLocation('exact')} testID="picker-exact">
              <View style={[styles.optionIcon, { backgroundColor: colors.infoSoft }]}>
                <Ionicons name="locate" size={20} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">Localização exata</Txt>
                <Txt variant="caption" color={colors.inkSoft}>
                  Compartilha o ponto exato onde você está agora.
                </Txt>
              </View>
            </Pressable>
            <Pressable
              style={styles.option}
              onPress={() => {
                setDraft({ placeId: null, precision: 'none', deviceLocation: null });
                router.back();
              }}
              testID="picker-none">
              <View style={styles.optionIcon}>
                <Ionicons name="location-outline" size={20} color={colors.inkSoft} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">Sem localização</Txt>
                <Txt variant="caption" color={colors.inkSoft}>
                  A publicação não aparece no mapa.
                </Txt>
              </View>
            </Pressable>
            <Txt variant="micro" color={colors.inkMute} style={{ marginTop: space.md }}>
              {here ? 'LUGARES PERTO DE VOCÊ' : 'LUGARES POPULARES'}
            </Txt>
          </View>
        }
        ItemSeparatorComponent={() => <Divider style={{ marginLeft: 72 }} />}
        renderItem={({ item: { p, d } }) => {
          const style = CATEGORY_STYLE[p.category];
          return (
            <Pressable style={styles.place} onPress={() => choose(p)} testID={`picker-place-${p.id}`}>
              <View style={[styles.optionIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name={style.icon} size={20} color={style.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>
                  {p.name}
                </Txt>
                <Txt variant="caption" color={colors.inkSoft}>
                  {p.cityName}
                  {d != null ? ` · ${formatDistance(d)}` : ''}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkMute} />
            </Pressable>
          );
        }}
        ListEmptyComponent={places.loading ? <Loading /> : <EmptyState icon="search" title="Nenhum lugar encontrado" body="Tente outro nome ou use sua localização." />}
        contentContainerStyle={{ paddingBottom: space.xxxl }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  optionIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  place: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
});
