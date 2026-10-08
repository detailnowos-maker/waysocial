import type { SupabaseClient } from '@supabase/supabase-js';

import type { AuthService, AuthSession, SignUpInput, SignUpResult } from '@/services/auth';

import type { SupabaseRepository } from './SupabaseRepository';

/** Traduz os erros mais comuns do Supabase Auth para mensagens claras em pt-BR. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Já existe uma conta com este e-mail.';
  if (m.includes('password') && m.includes('characters')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (m.includes('rate limit')) return 'Muitas tentativas. Aguarde um instante e tente de novo.';
  return message;
}

export class SupabaseAuth implements AuthService {
  readonly mode = 'supabase' as const;

  constructor(
    private readonly sb: SupabaseClient,
    private readonly repo: SupabaseRepository,
  ) {
    // mantém o repositório sincronizado com a sessão (login, logout, renovação de token)
    this.sb.auth.onAuthStateChange((_event, session) => this.repo.setViewer(session?.user.id ?? null));
  }

  async getSession(): Promise<AuthSession | null> {
    const { data } = await this.sb.auth.getSession();
    const id = data.session?.user.id ?? null;
    this.repo.setViewer(id);
    return id ? { userId: id } : null;
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) throw new Error(friendly(error?.message ?? 'Não foi possível entrar.'));
    this.repo.setViewer(data.user.id);
    return { userId: data.user.id };
  }

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    const { data, error } = await this.sb.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      // o trigger handle_new_user cria o perfil a partir destes metadados
      options: { data: { username: input.username.trim().toLowerCase(), display_name: input.displayName.trim() } },
    });
    if (error) throw new Error(friendly(error.message));
    if (data.session && data.user) {
      this.repo.setViewer(data.user.id);
      return { session: { userId: data.user.id }, needsConfirmation: false };
    }
    return { session: null, needsConfirmation: true };
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
    this.repo.setViewer(null);
  }

  onChange(cb: (session: AuthSession | null) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((_event, session) => cb(session ? { userId: session.user.id } : null));
    return () => data.subscription.unsubscribe();
  }
}
