import { hashString } from '@/lib/random';

/** Digest de senha do MOCK. Não é segurança — o modo Supabase usa o Supabase Auth. */
export function mockDigest(email: string, password: string): string {
  return hashString(`${email.trim().toLowerCase()}::${password}`).toString(36);
}

export const DEMO_PASSWORD = 'waysocial';
