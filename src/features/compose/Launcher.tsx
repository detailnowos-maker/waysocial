import { useRouter } from 'expo-router';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { ActionSheet, type SheetAction } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { useTripSession } from '@/state/TripSession';

import { resetDraft, setDraft } from './draft';
import { demoPhoto, type MediaSource, pickMedia } from './pickMedia';

interface LauncherValue {
  /** Abre o menu do botão "+". */
  openNew: () => void;
  /** Abre a câmera/galeria e segue para o criador de publicação. */
  startPost: (source: MediaSource, placeId?: string | null) => Promise<void>;
  /** Abre o criador de publicação já com um lugar escolhido (sem mídia ainda). */
  startPostAt: (placeId: string) => void;
}

const LauncherContext = createContext<LauncherValue>({ openNew: () => undefined, startPost: async () => undefined, startPostAt: () => undefined });
export const useLauncher = () => useContext(LauncherContext);

export function LauncherProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const { trip } = useTripSession();
  const [open, setOpen] = useState(false);

  const startPost = useCallback(
    async (source: MediaSource, placeId: string | null = null) => {
      try {
        const media = await pickMedia(source);
        if (!media) return;
        resetDraft();
        setDraft({ media, placeId, precision: placeId ? 'place' : null });
        router.push('/compose');
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'Não foi possível abrir a câmera.', { tone: 'error' });
      }
    },
    [router, toast],
  );

  const startPostAt = useCallback(
    (placeId: string) => {
      resetDraft();
      setDraft({ placeId, precision: 'place' });
      router.push('/compose');
    },
    [router],
  );

  const actions: SheetAction[] = [
    { label: 'Tirar foto', icon: 'camera-outline', testID: 'new-photo', onPress: () => void startPost('camera-photo') },
    { label: 'Gravar vídeo', icon: 'videocam-outline', testID: 'new-video', onPress: () => void startPost('camera-video') },
    { label: 'Escolher da galeria', icon: 'images-outline', testID: 'new-library', onPress: () => void startPost('library') },
    ...(__DEV__ || Platform.OS === 'web'
      ? [
          {
            label: 'Foto de demonstração',
            subtitle: 'Gera uma imagem de exemplo para testar o fluxo',
            icon: 'sparkles-outline' as const,
            testID: 'new-demo',
            onPress: () => {
              resetDraft();
              setDraft({ media: [demoPhoto()] });
              router.push('/compose');
            },
          },
        ]
      : []),
    trip
      ? { label: 'Voltar à viagem ativa', subtitle: 'Viagem em andamento', icon: 'navigate' as const, testID: 'new-trip-active', onPress: () => router.push('/trip/live') }
      : { label: 'Começar viagem', subtitle: 'Registre seu trajeto e momentos', icon: 'navigate-outline' as const, testID: 'new-trip', onPress: () => router.push('/trip/new') },
  ];

  const value = useMemo<LauncherValue>(() => ({ openNew: () => setOpen(true), startPost, startPostAt }), [startPost, startPostAt]);

  return (
    <LauncherContext.Provider value={value}>
      {children}
      <ActionSheet visible={open} onClose={() => setOpen(false)} title="Nova publicação" actions={actions} />
    </LauncherContext.Provider>
  );
}
