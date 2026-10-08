import { approximate } from '@/lib/geo';

import type { ID, LocationPrecision, NewPostInput, Place, TripStatus, TripVisibility } from './types';

/**
 * Regras de privacidade — uma única fonte de verdade para o app.
 *
 * O backend Supabase reimplementa as mesmas regras em RLS (supabase/migrations/*_rls.sql);
 * qualquer mudança aqui precisa ser espelhada lá. Os testes em `privacy.test.ts` descrevem o contrato.
 */

export interface ViewerContext {
  viewerId: ID | null;
  /** IDs que o viewer segue com aprovação (status `accepted`). */
  following: ReadonlySet<ID>;
}

export interface OwnedByProfile {
  ownerId: ID;
  ownerIsPrivate: boolean;
}

/** Perfil privado: o conteúdo só aparece para o próprio dono e para seguidores aprovados. */
export function canSeeProfileContent(ctx: ViewerContext, owner: { id: ID; isPrivate: boolean }): boolean {
  if (ctx.viewerId && ctx.viewerId === owner.id) return true;
  if (!owner.isPrivate) return true;
  return ctx.following.has(owner.id);
}

/** Um perfil privado nunca expõe viagem "pública" para quem não o segue. */
export function effectiveTripVisibility(visibility: TripVisibility, ownerIsPrivate: boolean): TripVisibility {
  return ownerIsPrivate && visibility === 'public' ? 'followers' : visibility;
}

export function canSeeTrip(ctx: ViewerContext, trip: OwnedByProfile & { visibility: TripVisibility }): boolean {
  if (ctx.viewerId && ctx.viewerId === trip.ownerId) return true;
  const visibility = effectiveTripVisibility(trip.visibility, trip.ownerIsPrivate);
  if (visibility === 'public') return true;
  if (visibility === 'followers') return ctx.following.has(trip.ownerId);
  return false;
}

/**
 * Posição ao vivo no mapa: exige compartilhamento ligado, viagem em andamento
 * e permissão de ver a viagem. O dono sempre vê a si mesmo.
 */
export function canSeeLiveTrip(
  ctx: ViewerContext,
  trip: OwnedByProfile & { visibility: TripVisibility; shareLive: boolean; status: TripStatus },
): boolean {
  if (trip.status !== 'active') return false;
  if (ctx.viewerId && ctx.viewerId === trip.ownerId) return true;
  return trip.shareLive && canSeeTrip(ctx, trip);
}

export interface ResolvedPostLocation {
  placeId: ID | null;
  lat: number | null;
  lng: number | null;
  precision: LocationPrecision;
}

/**
 * Decide o que de fato é gravado como localização de uma publicação.
 *
 * Garantia central do produto: a posição do aparelho SÓ é gravada quando o usuário
 * escolhe `exact` ou `approx`. Escolher um lugar grava as coordenadas do lugar.
 */
export function resolvePostLocation(
  input: Pick<NewPostInput, 'precision' | 'deviceLocation' | 'placeId'>,
  place: Pick<Place, 'id' | 'lat' | 'lng'> | null,
): ResolvedPostLocation {
  const none: ResolvedPostLocation = { placeId: null, lat: null, lng: null, precision: 'none' };
  switch (input.precision) {
    case 'none':
      return none;
    case 'place':
      if (!place) return none;
      return { placeId: place.id, lat: place.lat, lng: place.lng, precision: 'place' };
    case 'exact':
    case 'approx': {
      const device = input.deviceLocation;
      if (!device) return place ? resolvePostLocation({ ...input, precision: 'place' }, place) : none;
      const p = input.precision === 'approx' ? approximate(device) : device;
      return { placeId: place?.id ?? null, lat: p.lat, lng: p.lng, precision: input.precision };
    }
  }
}
