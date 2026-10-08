import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Field } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { Button, IconButton, Txt } from '@/components/ui';
import { useRepo, useSession } from '@/state/ServicesProvider';
import { colors, space } from '@/theme';

export default function EditProfile() {
  const router = useRouter();
  const repo = useRepo();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [homeCity, setHomeCity] = useState(profile?.homeCity ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (displayName.trim().length < 2) {
      toast.show('Informe seu nome.', { tone: 'error' });
      return;
    }
    setSaving(true);
    try {
      await repo.updateProfile({ displayName: displayName.trim(), bio: bio.trim().slice(0, 160), homeCity: homeCity.trim() || null });
      toast.show('Perfil atualizado', { tone: 'success' });
      router.back();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível salvar.', { tone: 'error' });
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingTop: (Platform.OS === 'ios' ? space.lg : insets.top) + space.xs, paddingBottom: space.sm }}>
        <IconButton icon="close" label="Fechar" onPress={() => router.back()} />
        <Txt variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          Editar perfil
        </Txt>
        <Button label="Salvar" size="sm" kind="brand" loading={saving} onPress={save} testID="edit-save" />
      </View>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
        {profile ? (
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <Avatar profile={{ ...profile, displayName: displayName || profile.displayName }} size={96} />
            <Txt variant="caption" color={colors.inkMute}>
              @{profile.username}
            </Txt>
          </View>
        ) : null}
        <Field label="Nome" value={displayName} onChangeText={setDisplayName} testID="edit-name" />
        <Field label="Bio" value={bio} onChangeText={setBio} multiline style={{ height: 96, paddingTop: 14, textAlignVertical: 'top' }} hint={`${bio.length}/160`} testID="edit-bio" />
        <Field label="Cidade" value={homeCity} onChangeText={setHomeCity} placeholder="Onde você mora" testID="edit-city" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
