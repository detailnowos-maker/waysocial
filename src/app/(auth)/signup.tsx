import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { GradientButton, IconButton, Txt } from '@/components/ui';
import { type SignUpErrors, validateSignUp } from '@/services/auth';
import { useServices } from '@/state/ServicesProvider';
import { colors, radius, space } from '@/theme';

export default function SignUp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { auth } = useServices();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const input = { displayName, username: username.trim().toLowerCase(), email: email.trim(), password };
    const found = validateSignUp(input);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    setLoading(true);
    try {
      const res = await auth.signUp(input);
      if (res.needsConfirmation) {
        toast.show('Conta criada! Confirme seu e-mail para entrar.', { tone: 'success', durationMs: 5000 });
        router.replace('/login');
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Não foi possível criar a conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
        <IconButton icon="chevron-back" label="Voltar" onPress={() => router.back()} style={{ marginLeft: -10 }} />
        <View style={{ gap: space.sm }}>
          <Txt variant="display">Crie sua conta</Txt>
          <Txt color={colors.inkSoft}>Em menos de um minuto você já está no mapa.</Txt>
        </View>
        <View style={{ gap: space.lg }}>
          <Field label="Nome" value={displayName} onChangeText={setDisplayName} autoComplete="name" placeholder="Como quer ser chamado" error={errors.displayName} testID="signup-name" />
          <Field label="@usuário" value={username} onChangeText={(t) => setUsername(t.toLowerCase())} autoCapitalize="none" placeholder="seu.usuario" error={errors.username} testID="signup-username" />
          <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="voce@email.com" error={errors.email} testID="signup-email" />
          <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="Mínimo de 6 caracteres" error={errors.password} testID="signup-password" />
        </View>
        <View style={{ flexDirection: 'row', gap: space.md, backgroundColor: colors.liveSoft, padding: space.lg, borderRadius: radius.lg }}>
          <Ionicons name="shield-checkmark" size={22} color="#0E8F5C" />
          <Txt variant="caption" color="#0B6B45" style={{ flex: 1 }}>
            Sua privacidade vem primeiro: nenhuma localização é compartilhada até você escolher — e suas viagens começam privadas.
          </Txt>
        </View>
        {formError ? (
          <Txt variant="caption" color={colors.danger} testID="signup-error">
            {formError}
          </Txt>
        ) : null}
        <GradientButton label="Criar conta" onPress={submit} loading={loading} testID="signup-submit" />
        <Pressable onPress={() => router.replace('/login')} style={{ alignSelf: 'center', padding: space.md }}>
          <Txt color={colors.inkSoft}>
            Já tem conta? <Txt variant="bodyStrong">Entrar</Txt>
          </Txt>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
