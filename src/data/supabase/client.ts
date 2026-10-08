import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from '@/config/env';

let client: SupabaseClient | null = null;

/** Cliente único do Supabase (sessão persistida em AsyncStorage no celular e em localStorage no web). */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new Error('Supabase não configurado (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY).');
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  // recomendação do Supabase para React Native: só renovar o token com o app em primeiro plano
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void client?.auth.startAutoRefresh();
      else void client?.auth.stopAutoRefresh();
    });
  }
  return client;
}
