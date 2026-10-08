import { useSyncExternalStore } from 'react';

import type { LocationPrecision, Media } from '@/domain/types';

export type DraftMedia = Omit<Media, 'id'>;

export interface PostDraft {
  media: DraftMedia[];
  placeId: string | null;
  /** Como a localização será gravada. `null` = ainda não escolhido (equivale a "sem localização"). */
  precision: LocationPrecision | null;
  /** Posição do aparelho — só é enviada quando `precision` é `exact`/`approx`. */
  deviceLocation: { lat: number; lng: number } | null;
}

const EMPTY: PostDraft = { media: [], placeId: null, precision: null, deviceLocation: null };
let draft: PostDraft = EMPTY;
const listeners = new Set<() => void>();

const emit = () => {
  for (const l of [...listeners]) l();
};

export function getDraft(): PostDraft {
  return draft;
}

export function setDraft(patch: Partial<PostDraft>) {
  draft = { ...draft, ...patch };
  emit();
}

export function resetDraft() {
  draft = EMPTY;
  emit();
}

export function useDraft(): PostDraft {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getDraft,
    getDraft,
  );
}
