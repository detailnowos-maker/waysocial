import { canSeeLiveTrip, canSeeProfileContent, canSeeTrip, effectiveTripVisibility, resolvePostLocation, type ViewerContext } from './privacy';

const ctx = (viewerId: string | null, following: string[] = []): ViewerContext => ({ viewerId, following: new Set(following) });
const trip = (visibility: 'public' | 'followers' | 'private', ownerIsPrivate = false) => ({ ownerId: 'owner', ownerIsPrivate, visibility });

describe('privacidade de perfil', () => {
  it('perfil público é visível para todos', () => {
    expect(canSeeProfileContent(ctx('x'), { id: 'owner', isPrivate: false })).toBe(true);
  });
  it('perfil privado só para o dono e seguidores aprovados', () => {
    const owner = { id: 'owner', isPrivate: true };
    expect(canSeeProfileContent(ctx('stranger'), owner)).toBe(false);
    expect(canSeeProfileContent(ctx(null), owner)).toBe(false);
    expect(canSeeProfileContent(ctx('owner'), owner)).toBe(true);
    expect(canSeeProfileContent(ctx('fan', ['owner']), owner)).toBe(true);
  });
});

describe('visibilidade de viagem', () => {
  it('privada: só o dono', () => {
    expect(canSeeTrip(ctx('owner'), trip('private'))).toBe(true);
    expect(canSeeTrip(ctx('fan', ['owner']), trip('private'))).toBe(false);
  });
  it('seguidores: dono + quem segue', () => {
    expect(canSeeTrip(ctx('fan', ['owner']), trip('followers'))).toBe(true);
    expect(canSeeTrip(ctx('stranger'), trip('followers'))).toBe(false);
  });
  it('pública: todos — exceto que conta privada vira "seguidores"', () => {
    expect(canSeeTrip(ctx('stranger'), trip('public'))).toBe(true);
    expect(effectiveTripVisibility('public', true)).toBe('followers');
    expect(canSeeTrip(ctx('stranger'), trip('public', true))).toBe(false);
    expect(canSeeTrip(ctx('fan', ['owner']), trip('public', true))).toBe(true);
  });
  it('posição ao vivo exige viagem ativa + compartilhamento ligado + permissão de ver', () => {
    const base = { ...trip('followers'), shareLive: true, status: 'active' as const };
    expect(canSeeLiveTrip(ctx('fan', ['owner']), base)).toBe(true);
    expect(canSeeLiveTrip(ctx('fan', ['owner']), { ...base, shareLive: false })).toBe(false);
    expect(canSeeLiveTrip(ctx('fan', ['owner']), { ...base, status: 'finished' })).toBe(false);
    expect(canSeeLiveTrip(ctx('stranger'), base)).toBe(false);
    expect(canSeeLiveTrip(ctx('owner'), { ...base, shareLive: false })).toBe(true);
  });
});

describe('localização da publicação', () => {
  const place = { id: 'p', lat: -26.99, lng: -48.63 };
  const device = { lat: -26.99306, lng: -48.62714 };
  it('"place" usa o lugar, nunca o aparelho', () => {
    expect(resolvePostLocation({ precision: 'place', placeId: 'p', deviceLocation: device }, place)).toEqual({ placeId: 'p', lat: -26.99, lng: -48.63, precision: 'place' });
  });
  it('"none" descarta tudo', () => {
    expect(resolvePostLocation({ precision: 'none', placeId: 'p', deviceLocation: device }, place)).toEqual({ placeId: null, lat: null, lng: null, precision: 'none' });
  });
  it('"approx" arredonda e "exact" preserva', () => {
    expect(resolvePostLocation({ precision: 'approx', placeId: null, deviceLocation: device }, null)).toMatchObject({ lat: -26.99, lng: -48.63, precision: 'approx' });
    expect(resolvePostLocation({ precision: 'exact', placeId: null, deviceLocation: device }, null)).toMatchObject({ lat: device.lat, lng: device.lng, precision: 'exact' });
  });
  it('sem aparelho, "exact/approx" cai para o lugar (ou para nada) — nunca inventa posição', () => {
    expect(resolvePostLocation({ precision: 'exact', placeId: 'p', deviceLocation: null }, place).precision).toBe('place');
    expect(resolvePostLocation({ precision: 'exact', placeId: null, deviceLocation: null }, null).precision).toBe('none');
  });
});
