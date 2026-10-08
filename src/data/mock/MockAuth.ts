import type { AuthService, AuthSession, SignUpInput, SignUpResult } from '@/services/auth';

import { DEMO_EMAILS, U } from './seed';
import { DEMO_PASSWORD, mockDigest } from './digest';
import type { KeyValueStorage, MockRepository } from './MockRepository';

const SESSION_KEY = 'waysocial.mock.session.v1';

/** Autenticação do modo demonstração — a sessão é só o ID do usuário em AsyncStorage. */
export class MockAuth implements AuthService {
  readonly mode = 'mock' as const;
  private listeners = new Set<(s: AuthSession | null) => void>();

  constructor(
    private readonly repo: MockRepository,
    private readonly storage: KeyValueStorage,
  ) {}

  private async set(session: AuthSession | null) {
    if (session) await this.storage.setItem(SESSION_KEY, session.userId);
    else await this.storage.removeItem(SESSION_KEY);
    this.repo.setViewer(session?.userId ?? null);
    for (const l of [...this.listeners]) l(session);
  }

  async getSession(): Promise<AuthSession | null> {
    await this.repo.whenReady();
    const id = await this.storage.getItem(SESSION_KEY);
    if (!id) return null;
    const exists = await this.repo.getProfileView(id).catch(() => null);
    // getProfileView depende do viewer só para follow state; para existência basta o perfil
    if (!exists) {
      await this.storage.removeItem(SESSION_KEY);
      return null;
    }
    this.repo.setViewer(id);
    return { userId: id };
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const cred = await this.repo.findCredential(email);
    if (!cred || cred.digest !== mockDigest(email, password)) throw new Error('E-mail ou senha incorretos.');
    const session = { userId: cred.userId };
    await this.set(session);
    return session;
  }

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    if (await this.repo.findCredential(input.email)) throw new Error('Já existe uma conta com este e-mail.');
    if (await this.repo.isUsernameTaken(input.username)) throw new Error('Este @usuário já está em uso.');
    const userId = await this.repo.registerUser({
      email: input.email,
      digest: mockDigest(input.email, input.password),
      username: input.username,
      displayName: input.displayName,
    });
    const session = { userId };
    await this.set(session);
    return { session, needsConfirmation: false };
  }

  async signInDemo(): Promise<AuthSession> {
    return this.signIn(DEMO_EMAILS[U.lucas], DEMO_PASSWORD);
  }

  async signOut(): Promise<void> {
    await this.set(null);
  }

  onChange(cb: (s: AuthSession | null) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}
