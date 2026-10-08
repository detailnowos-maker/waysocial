import type { SupabaseClient } from '@supabase/supabase-js';

import type { Media } from '@/domain/types';

export const MEDIA_BUCKET = 'media';
const ABSOLUTE = /^(https?:|data:|file:|blob:|content:|ph:|assets-library:)/i;
const SIGN_TTL_S = 60 * 60;

/** Envio e leitura de mídia. Em produção é o Supabase Storage (bucket privado + URL assinada). */
export interface MediaUploader {
  /** Envia mídia LOCAL e devolve a mesma mídia apontando para o caminho no Storage. Mídias sem `uri` local passam direto. */
  upload(userId: string, media: Omit<Media, 'id'>): Promise<Omit<Media, 'id'>>;
  /** Troca, em lugar, `url` (caminho no Storage) por uma URL assinada temporária. */
  resolve(items: { url?: string | null }[]): Promise<void>;
}

function extensionOf(uri: string, type: 'image' | 'video'): string {
  const m = /\.([a-z0-9]{2,4})(?:\?|#|$)/i.exec(uri);
  if (m) return m[1].toLowerCase();
  return type === 'video' ? 'mp4' : 'jpg';
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4' };

export class SupabaseMediaUploader implements MediaUploader {
  private readonly cache = new Map<string, { url: string; exp: number }>();

  constructor(private readonly sb: SupabaseClient) {}

  async upload(userId: string, media: Omit<Media, 'id'>): Promise<Omit<Media, 'id'>> {
    // demonstração (scene) ou mídia já hospedada: nada a enviar
    if (!media.uri || (ABSOLUTE.test(media.uri) && !/^(file:|blob:|content:|ph:|assets-library:|data:)/i.test(media.uri))) return media;
    const ext = extensionOf(media.uri, media.type);
    const path = `${userId}/${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}.${ext}`;
    const body = await (await fetch(media.uri)).arrayBuffer();
    const { error } = await this.sb.storage.from(MEDIA_BUCKET).upload(path, body, { contentType: MIME[ext] ?? 'application/octet-stream', upsert: false });
    if (error) throw new Error(`Falha ao enviar a mídia: ${error.message}`);
    return { ...media, uri: path };
  }

  async resolve(items: { url?: string | null }[]): Promise<void> {
    const now = Date.now();
    const pending = new Set<string>();
    for (const it of items) {
      if (!it.url || ABSOLUTE.test(it.url)) continue;
      const hit = this.cache.get(it.url);
      if (!hit || hit.exp < now) pending.add(it.url);
    }
    if (pending.size) {
      const { data, error } = await this.sb.storage.from(MEDIA_BUCKET).createSignedUrls([...pending], SIGN_TTL_S);
      if (!error && data) for (const d of data as any[]) if (d.signedUrl && d.path) this.cache.set(d.path, { url: d.signedUrl, exp: now + (SIGN_TTL_S - 120) * 1000 });
    }
    for (const it of items) {
      if (!it.url || ABSOLUTE.test(it.url)) continue;
      const hit = this.cache.get(it.url);
      it.url = hit?.url ?? null;
    }
  }
}
