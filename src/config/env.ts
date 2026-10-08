/**
 * Configuração em tempo de build. O Expo só inlina `process.env.EXPO_PUBLIC_*` quando a
 * variável é lida com o nome literal — por isso cada uma aparece escrita por extenso.
 * Todas são opcionais: sem nenhuma, o app roda 100% em modo demonstração.
 */
export type MapProviderName = 'demo' | 'tiles';

export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  mapProvider: (process.env.EXPO_PUBLIC_MAP_PROVIDER === 'tiles' ? 'tiles' : 'demo') as MapProviderName,
  mapTileUrl: process.env.EXPO_PUBLIC_MAP_TILE_URL ?? '',
  mapAttribution: process.env.EXPO_PUBLIC_MAP_ATTRIBUTION ?? '',
  aiEndpoint: process.env.EXPO_PUBLIC_AI_ENDPOINT ?? '',
};

export const dataMode: 'mock' | 'supabase' = env.supabaseUrl && env.supabaseAnonKey ? 'supabase' : 'mock';
