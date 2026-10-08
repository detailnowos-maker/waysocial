import type { WayRepository } from '@/data/repository';
import type { AuthService } from '@/services/auth';

import { getSupabase } from './client';
import { SupabaseAuth } from './SupabaseAuth';
import { SupabaseRepository } from './SupabaseRepository';

export function createSupabaseServices(): { repo: WayRepository; auth: AuthService } {
  const sb = getSupabase();
  const repo = new SupabaseRepository(sb);
  return { repo, auth: new SupabaseAuth(sb, repo) };
}
