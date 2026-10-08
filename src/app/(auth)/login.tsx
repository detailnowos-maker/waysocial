import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field } from '@/components/Field';
import { Button, GradientButton, IconButton, Txt } from '@/components/ui';
import { useServices } from '@/state/ServicesProvider';
import { colors, space } from '@/theme';

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { auth, mode } = useServices();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passRef = useRef<TextInput>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await auth.signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.');
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + space.sm, gap: space.xl, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <IconButton icon="chevron-back" label="Voltar" onPress={() => router.back()} style={{ marginLeft: -10 }} />
        <View style={{ gap: space.sm }}>
          <Txt variant="display">Bem-vindo de volta</Txt>
          <Txt color={colors.inkSoft}>Entre para ver o que está acontecendo perto de você.</Txt>
        </View>
        <View style={{ gap: space.lg }}>
          <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} placeholder="voce@email.com" testID="login-email" />
          <Field ref={passRef} label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" returnKeyType="go" onSubmitEditing={submit} placeholder="••••••" testID="login-password" />
          {error ? (
            <Txt variant="caption" color={colors.danger} testID="login-error">
              {error}
            </Txt>
          ) : null}
        </View>
        <GradientButton label="Entrar" onPress={submit} loading={loading} testID="login-submit" />
        {mode === 'mock' ? (
          <View style={{ gap: space.sm }}>
            <Txt variant="caption" color={colors.inkMute} align="center">
              Modo demonstração: use lucas@waysocial.demo · senha waysocial
            </Txt>
            <Button label="Preencher conta de demonstração" kind="secondary" full onPress={() => { setEmail('lucas@waysocial.demo'); setPassword('waysocial'); }} testID="login-fill-demo" />
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.replace('/signup')} style={{ alignSelf: 'center', padding: space.md }}>
          <Txt color={colors.inkSoft}>
            Ainda não tem conta? <Txt variant="bodyStrong">Criar conta</Txt>
          </Txt>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
