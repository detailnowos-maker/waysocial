import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SceneArt } from '@/components/SceneArt';
import { useToast } from '@/components/Toast';
import { Button, GradientButton, Txt } from '@/components/ui';
import { useServices } from '@/state/ServicesProvider';
import { brandGradient, radius, space } from '@/theme';

const CARDS = [
  { kind: 'beach', seed: 41, variant: 'golden', skyline: true, rot: -8, x: -14, y: 20, w: 150, h: 188 },
  { kind: 'viewpoint', seed: 7, variant: 'golden', rot: 7, x: 120, y: 0, w: 150, h: 186 },
  { kind: 'sunset', seed: 12, variant: 'dusk', rot: -3, x: 52, y: 128, w: 156, h: 180 },
] as const;

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { auth, mode } = useServices();
  const [loading, setLoading] = useState(false);

  const demo = async () => {
    setLoading(true);
    try {
      await auth.signInDemo?.();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível entrar.', { tone: 'error' });
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.brandRow}>
        <LinearGradient colors={brandGradient} style={styles.logo}>
          <Ionicons name="navigate" size={16} color="#fff" />
        </LinearGradient>
        <Txt variant="heading" color="#fff">
          WaySocial
        </Txt>
      </View>

      <View style={styles.collage}>
        {CARDS.map((c, i) => (
          <View key={i} style={[styles.card, { left: c.x + 24, top: c.y, width: c.w, height: c.h, transform: [{ rotate: `${c.rot}deg` }] }]}>
            <SceneArt scene={{ kind: c.kind, seed: c.seed, variant: c.variant, skyline: 'skyline' in c ? c.skyline : undefined }} style={StyleSheet.absoluteFill} />
            <View style={styles.cardPin}>
              <Ionicons name="location" size={11} color="#fff" />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.copy}>
        <Txt variant="display" color="#fff">
          Compartilhe o mundo enquanto você vive.
        </Txt>
        <Txt variant="body" color="rgba(255,255,255,0.72)">
          Feed, mapa e viagens num só lugar. Veja o que está acontecendo perto de você — e mostre o seu caminho, só quando quiser.
        </Txt>
      </View>

      <View style={{ gap: space.md }}>
        <GradientButton label="Criar conta" onPress={() => router.push('/signup')} testID="welcome-signup" />
        <Button label="Já tenho conta" kind="ghostLight" full onPress={() => router.push('/login')} testID="welcome-login" />
        {mode === 'mock' ? (
          <Button label="Explorar com a conta demo" kind="soft" full icon="sparkles" loading={loading} onPress={demo} testID="welcome-demo" />
        ) : null}
        <View style={styles.privacy}>
          <Ionicons name="lock-closed" size={13} color="rgba(255,255,255,0.6)" />
          <Txt variant="caption" color="rgba(255,255,255,0.6)" style={{ flexShrink: 1 }}>
            Sua localização exata nunca é compartilhada sem você escolher.
          </Txt>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E1116', paddingHorizontal: space.xl, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  collage: { height: 320, marginTop: space.md },
  card: { position: 'absolute', borderRadius: radius.lg, overflow: 'hidden', borderWidth: 3, borderColor: 'rgba(255,255,255,0.95)' },
  cardPin: { position: 'absolute', left: 8, bottom: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF3D77', alignItems: 'center', justifyContent: 'center' },
  copy: { gap: space.md },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: space.xs },
});
