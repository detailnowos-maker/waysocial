import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { SceneKind } from '@/domain/types';

import type { DraftMedia } from './draft';

export type MediaSource = 'camera-photo' | 'camera-video' | 'library';

/**
 * No web, URIs `blob:` morrem ao recarregar a página. Para o modo demonstração (que persiste em
 * localStorage) reduzimos a imagem para ≤1080px e guardamos como data URL.
 * No aparelho a URI do arquivo é usada direto — em produção ela é enviada ao Supabase Storage.
 */
async function persistableOnWeb(uri: string): Promise<string> {
  if (Platform.OS !== 'web' || !uri.startsWith('blob:')) return uri;
  try {
    const blob = await (await fetch(uri)).blob();
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, 1080 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return uri;
  }
}

/** Abre câmera/galeria. Devolve `null` se o usuário cancelar; lança com mensagem amigável se faltar permissão. */
export async function pickMedia(source: MediaSource): Promise<DraftMedia[] | null> {
  let result: ImagePicker.ImagePickerResult;
  if (source === 'library') {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.85,
    });
  } else {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Permissão da câmera negada. Ative-a nos ajustes do aparelho.');
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: source === 'camera-video' ? ['videos'] : ['images'],
      quality: 0.85,
      videoMaxDuration: 60,
    });
  }
  if (result.canceled || result.assets.length === 0) return null;
  return Promise.all(
    result.assets.map(async (a): Promise<DraftMedia> => {
      const isVideo = a.type === 'video';
      return {
        type: isVideo ? 'video' : 'image',
        uri: isVideo ? a.uri : await persistableOnWeb(a.uri),
        width: a.width,
        height: a.height,
        durationMs: isVideo ? (a.duration ?? null) : null,
      };
    }),
  );
}

const DEMO_KINDS: SceneKind[] = ['beach', 'viewpoint', 'sunset', 'park', 'city', 'food', 'mountain'];

/** "Foto de demonstração": ilustração gerada, para testar o fluxo sem câmera (ex.: no navegador). */
export function demoPhoto(): DraftMedia {
  const seed = Math.floor(Math.random() * 100000);
  return {
    type: 'image',
    scene: { kind: DEMO_KINDS[seed % DEMO_KINDS.length], seed, variant: seed % 3 === 0 ? 'golden' : 'day' },
    width: 1080,
    height: 1350,
  };
}
