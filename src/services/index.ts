import AsyncStorage from '@react-native-async-storage/async-storage';

import { dataMode, env } from '@/config/env';
import { MockAuth } from '@/data/mock/MockAuth';
import { MockRepository } from '@/data/mock/MockRepository';
import type { WayRepository } from '@/data/repository';

import { type AiProvider, HttpAiProvider, MockAiProvider } from './ai';
import type { AuthService } from './auth';
import { DemoGeocoder, type GeocodingProvider } from './geocoding';

export interface Services {
  mode: 'mock' | 'supabase';
  repo: WayRepository;
  auth: AuthService;
  ai: AiProvider;
  geocoder: GeocodingProvider;
}

/**
 * Monta os serviços do app. Sem `EXPO_PUBLIC_SUPABASE_*` tudo roda em modo demonstração;
 * com as variáveis, a MESMA UI passa a usar Supabase (Auth + Postgres + Storage).
 */
export function createServices(): Services {
  let repo: WayRepository;
  let auth: AuthService;

  if (dataMode === 'supabase') {
    // import tardio: o modo demonstração nem carrega o cliente do Supabase
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSupabaseServices } = require('@/data/supabase/createSupabaseServices') as typeof import('@/data/supabase/createSupabaseServices');
    ({ repo, auth } = createSupabaseServices());
  } else {
    const mock = new MockRepository({ storage: AsyncStorage });
    repo = mock;
    auth = new MockAuth(mock, AsyncStorage);
  }

  const ai: AiProvider = env.aiEndpoint ? new HttpAiProvider(env.aiEndpoint, new MockAiProvider(0)) : new MockAiProvider();
  return { mode: dataMode, repo, auth, ai, geocoder: new DemoGeocoder() };
}
