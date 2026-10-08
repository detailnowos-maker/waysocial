import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { WayRepository } from '@/data/repository';
import type { Profile } from '@/domain/types';
import { createServices, type Services } from '@/services';
import type { AuthSession } from '@/services/auth';

const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('useServices fora do ServicesProvider');
  return s;
}

export const useRepo = (): WayRepository => useServices().repo;

// --- Sessão ------------------------------------------------------------------------------------

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionValue {
  status: SessionStatus;
  userId: string | null;
  profile: Profile | null;
}

const SessionContext = createContext<SessionValue>({ status: 'loading', userId: null, profile: null });

export const useSession = () => useContext(SessionContext);

/** Usuário logado (lança se não houver — use apenas em telas protegidas). */
export function useMe(): { userId: string; profile: Profile | null } {
  const { userId, profile } = useSession();
  if (!userId) throw new Error('useMe fora de uma tela autenticada');
  return { userId, profile };
}

export function ServicesProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => createServices(), []);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [loadedProfile, setProfile] = useState<Profile | null>(null);
  const profile = session ? loadedProfile : null;
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    services.auth
      .getSession()
      .then((s) => {
        if (!alive.current) return;
        setSession(s);
        setStatus(s ? 'signedIn' : 'signedOut');
      })
      .catch(() => alive.current && setStatus('signedOut'));
    const off = services.auth.onChange((s) => {
      setSession(s);
      setStatus(s ? 'signedIn' : 'signedOut');
    });
    return () => {
      alive.current = false;
      off();
    };
  }, [services]);

  // grava o que estiver pendente quando o app vai para segundo plano ou a aba é fechada
  useEffect(() => {
    const flush = () => void services.repo.flush?.();
    const sub = AppState.addEventListener('change', (s) => s !== 'active' && flush());
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('pagehide', flush);
    return () => {
      sub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('pagehide', flush);
    };
  }, [services]);

  // perfil do usuário logado, sempre atualizado
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const load = () =>
      services.repo.getMyProfile().then((p) => {
        if (!cancelled) setProfile(p);
      });
    void load();
    const off = services.repo.subscribe(() => void load());
    return () => {
      cancelled = true;
      off();
    };
  }, [services, session]);

  const value = useMemo<SessionValue>(() => ({ status, userId: session?.userId ?? null, profile }), [status, session, profile]);

  return (
    <ServicesContext.Provider value={services}>
      <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
    </ServicesContext.Provider>
  );
}
