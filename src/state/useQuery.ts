import { useCallback, useEffect, useRef, useState } from 'react';

import { useRepo, useSession } from './ServicesProvider';

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Consulta ao repositório com "stale-while-revalidate": mantém o dado anterior enquanto
 * recarrega, e recarrega sozinha sempre que o repositório sinaliza uma mutação.
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: readonly unknown[], opts: { enabled?: boolean; pollMs?: number } = {}): QueryState<T> {
  const repo = useRepo();
  const { userId } = useSession();
  const enabled = opts.enabled ?? true;
  const [data, setData] = useState<T | undefined>(undefined);
  const [loadingState, setLoading] = useState(enabled);
  const loading = enabled && loadingState;
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  const seq = useRef(0);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const run = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const result = await fetcherRef.current();
      if (mine !== seq.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (mine !== seq.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  const depKey = JSON.stringify(deps);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect -- recomeça o ciclo de carregamento quando as dependências mudam
    void run();
    let pending: ReturnType<typeof setTimeout> | null = null;
    const off = repo.subscribe(() => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => void run(), 0);
    });
    const poll = opts.pollMs ? setInterval(() => void run(), opts.pollMs) : null;
    return () => {
      off();
      if (pending) clearTimeout(pending);
      if (poll) clearInterval(poll);
      seq.current += 1; // invalida respostas em voo
    };
  }, [repo, run, enabled, depKey, userId, opts.pollMs]);

  return { data, loading, error, refresh: run };
}
