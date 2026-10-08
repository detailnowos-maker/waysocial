import type { ID } from '@/domain/types';

export interface AuthSession {
  userId: ID;
}

export interface SignUpInput {
  email: string;
  password: string;
  username: string;
  displayName: string;
}

export interface SignUpResult {
  session: AuthSession | null;
  /** Supabase com confirmação de e-mail ligada: a conta existe, mas ainda não há sessão. */
  needsConfirmation: boolean;
}

/** Contrato de autenticação. Implementações: `MockAuth` (demo) e `SupabaseAuth`. */
export interface AuthService {
  readonly mode: 'mock' | 'supabase';
  getSession(): Promise<AuthSession | null>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  /** Entrar com a conta de demonstração (somente modo mock). */
  signInDemo?(): Promise<AuthSession>;
  signOut(): Promise<void>;
  onChange(cb: (session: AuthSession | null) => void): () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-z0-9._]{3,24}$/;

export interface SignUpErrors {
  email?: string;
  password?: string;
  username?: string;
  displayName?: string;
}

export function validateSignUp(input: SignUpInput): SignUpErrors {
  const errors: SignUpErrors = {};
  if (!EMAIL_RE.test(input.email.trim())) errors.email = 'Informe um e-mail válido.';
  if (input.password.length < 6) errors.password = 'Use pelo menos 6 caracteres.';
  if (!USERNAME_RE.test(input.username.trim().toLowerCase())) errors.username = 'Use 3 a 24 letras minúsculas, números, ponto ou _.';
  if (input.displayName.trim().length < 2) errors.displayName = 'Como devemos te chamar?';
  return errors;
}
