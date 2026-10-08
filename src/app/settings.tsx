import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Header } from '@/components/Header';
import { ActionSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Button, Segmented, Txt } from '@/components/ui';
import { dataMode, env } from '@/config/env';
import type { TripVisibility } from '@/domain/types';
import { useRepo, useServices, useSession } from '@/state/ServicesProvider';
import { colors, radius, space } from '@/theme';

function Card({ title, children, footer }: { title: string; children: ReactNode; footer?: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <Txt variant="micro" color={colors.inkMute} style={{ paddingHorizontal: space.xs }}>
        {title.toUpperCase()}
      </Txt>
      <View style={styles.card}>{children}</View>
      {footer ? (
        <Txt variant="caption" color={colors.inkMute} style={{ paddingHorizontal: space.xs }}>
          {footer}
        </Txt>
      ) : null}
    </View>
  );
}

function Row({ icon, title, subtitle, right, last }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle?: string; right?: ReactNode; last?: boolean }) {
  return (
    <View style={[styles.row, last ? null : styles.rowBorder]}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={19} color={colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        {subtitle ? (
          <Txt variant="caption" color={colors.inkSoft}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export default function Settings() {
  const router = useRouter();
  const repo = useRepo();
  const toast = useToast();
  const { auth, ai } = useServices();
  const { profile } = useSession();
  const [confirmReset, setConfirmReset] = useState(false);
  if (!profile) return null;

  const update = async (patch: Parameters<typeof repo.updateProfile>[0], message?: string) => {
    try {
      await repo.updateProfile(patch);
      if (message) toast.show(message, { tone: 'success' });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'error' });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Configurações" />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxxl * 2 }}>
        <Card title="Privacidade" footer="Seu perfil e suas viagens só aparecem para quem você permitir. A localização exata nunca é compartilhada sem você escolher.">
          <Row
            icon="lock-closed-outline"
            title="Perfil privado"
            subtitle="Só seguidores aprovados veem publicações, viagens e lugares."
            right={<Switch value={profile.isPrivate} onValueChange={(v) => void update({ isPrivate: v }, v ? 'Seu perfil agora é privado' : 'Seu perfil agora é público')} trackColor={{ true: colors.brand }} accessibilityLabel="Perfil privado" />}
          />
          <Row
            icon="navigate-outline"
            title="Quem vê minhas viagens"
            subtitle="Padrão ao começar uma viagem (você pode mudar em cada uma)."
            last
            right={undefined}
          />
          <View style={{ paddingHorizontal: space.md, paddingBottom: space.md }}>
            <Segmented<TripVisibility>
              testID="setting-trip-visibility"
              value={profile.defaultTripVisibility}
              onChange={(v) => void update({ defaultTripVisibility: v })}
              options={[
                { value: 'private', label: 'Só eu' },
                { value: 'followers', label: 'Seguidores' },
                { value: 'public', label: 'Público' },
              ]}
            />
          </View>
        </Card>

        <Card title="Publicações">
          <Row
            icon="shield-checkmark-outline"
            title="Sugerir região aproximada"
            subtitle="Ao publicar, preenche sua região (~1 km) se a permissão já foi dada. Você sempre pode trocar ou remover."
            last
            right={<Switch value={profile.shareLocationByDefault} onValueChange={(v) => void update({ shareLocationByDefault: v })} trackColor={{ true: colors.brand }} accessibilityLabel="Sugerir região aproximada" />}
          />
        </Card>

        <Card title="Atalhos">
          <Row icon="trophy-outline" title="Minhas conquistas" last right={<Button label="Abrir" size="sm" kind="secondary" onPress={() => router.push('/achievements')} />} />
        </Card>

        {dataMode === 'mock' ? (
          <Card title="Demonstração" footer="Os dados deste app são fictícios e ficam só neste aparelho.">
            <Row
              icon="notifications-outline"
              title="Simular interação"
              subtitle="Um dos usuários fictícios curte, comenta ou segue você."
              right={
                <Button
                  label="Simular"
                  size="sm"
                  kind="soft"
                  testID="demo-simulate"
                  onPress={async () => {
                    const msg = await repo.simulateIncomingActivity?.();
                    if (msg) toast.show(msg, { icon: 'notifications' });
                  }}
                />
              }
            />
            <Row icon="refresh-outline" title="Redefinir dados" subtitle="Volta ao conteúdo de demonstração original." last right={<Button label="Redefinir" size="sm" kind="danger" onPress={() => setConfirmReset(true)} testID="demo-reset" />} />
          </Card>
        ) : null}

        <Card title="Sobre este app">
          <Row icon="server-outline" title="Dados" subtitle={dataMode === 'mock' ? 'Demonstração local (AsyncStorage)' : 'Supabase'} />
          <Row icon="map-outline" title="Mapa" subtitle={env.mapProvider === 'tiles' && env.mapTileUrl ? 'Tiles raster configurados' : 'Mapa ilustrativo (sem provedor configurado)'} />
          <Row icon="sparkles-outline" title="IA" subtitle={ai.name === 'mock' ? 'Simulada por templates' : `Endpoint próprio (${ai.name})`} last />
        </Card>

        <Button
          label="Sair da conta"
          kind="danger"
          full
          icon="log-out-outline"
          testID="logout"
          onPress={async () => {
            await auth.signOut();
          }}
        />
      </ScrollView>

      <ActionSheet
        visible={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Redefinir dados de demonstração?"
        actions={[
          {
            label: 'Sim, redefinir',
            destructive: true,
            icon: 'refresh-outline',
            testID: 'demo-reset-confirm',
            onPress: async () => {
              await repo.resetDemoData?.();
              toast.show('Dados de demonstração restaurados', { tone: 'success' });
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 58 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
