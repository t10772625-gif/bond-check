import type { CloudSession } from './types';

export class SupabaseApi {
  session: CloudSession | null = null;
  onSession: ((session: CloudSession | null) => Promise<void>) | null = null;
  private refreshing: Promise<void> | null = null;
  constructor(readonly url: string, readonly key: string) {}
  private async send(path: string, init: RequestInit, token?: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(this.url + path, {
        ...init,
        signal: controller.signal,
        headers: {
          apikey: this.key,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });
      const text = await response.text();
      let data: Record<string, unknown> | null = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        /* HTML or unavailable project response. */
      }
      if (!response.ok) {
        const message = String(
          data?.message ??
            data?.error_description ??
            data?.msg ??
            data?.error ??
            'Server paused or unreachable',
        );
        throw Object.assign(
          new Error(`Supabase ${response.status}: ${message}`),
          { status: response.status },
        );
      }
      return data as unknown;
    } catch (error) {
      if ((error as Error).name === 'AbortError')
        throw new Error(
          'Server unreachable. Check the connection; the owner may need to restore the Supabase project.',
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  private async setSession(value: CloudSession | null) {
    this.session = value;
    await this.onSession?.(value);
  }
  async signIn(email: string, password: string) {
    const result = (await this.send('/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    })) as CloudSession & { expires_in: number };
    if (!result.access_token || !result.refresh_token || !result.user?.id)
      throw new Error('Invalid authentication response');
    await this.setSession({
      ...result,
      expires_at:
        result.expires_at ?? Math.floor(Date.now() / 1000) + result.expires_in,
    });
  }
  async signUp(name: string, email: string, password: string) {
    const result = (await this.send('/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password,
        data: { name: name.trim() },
      }),
    })) as Partial<CloudSession> & { expires_in?: number; id?: string };
    if (!result.user?.id && !result.id)
      throw new Error('Invalid account registration response');
    // Registration does not grant owner access. No password is stored locally.
    return { confirmationRequired: !result.access_token };
  }
  async refresh(force = false) {
    if (!this.session) throw new Error('Sign in to Supabase first');
    if (!force && this.session.expires_at > Math.floor(Date.now() / 1000) + 60)
      return;
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const refreshToken = this.session!.refresh_token;
        const result = (await this.send(
          '/auth/v1/token?grant_type=refresh_token',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          },
        )) as CloudSession & { expires_in: number };
        if (this.session?.refresh_token !== refreshToken) return;
        if (!result.access_token || !result.user?.id)
          throw new Error('Session refresh failed; sign in again');
        await this.setSession({
          ...result,
          expires_at:
            result.expires_at ??
            Math.floor(Date.now() / 1000) + result.expires_in,
        });
      })().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    await this.refresh();
    if (!this.session) throw new Error('Session ended; sign in again');
    try {
      return (await this.send(path, init, this.session!.access_token)) as T;
    } catch (error) {
      if ((error as { status?: number }).status !== 401) throw error;
      await this.refresh(true);
      if (!this.session) throw new Error('Session ended; sign in again');
      return (await this.send(path, init, this.session!.access_token)) as T;
    }
  }
  async select<T>(
    table: string,
    query: Record<string, string> = {},
    all = false,
  ): Promise<T[]> {
    const out: T[] = [];
    for (let offset = 0; ; offset += 1000) {
      if (offset > 500000) throw new Error('Too many records');
      const values = {
        select: '*',
        ...query,
        ...(all ? { limit: '1000', offset: String(offset) } : {}),
      };
      const params = Object.entries(values)
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
        )
        .join('&');
      const page = await this.request<T[]>(`/rest/v1/${table}?${params}`);
      if (!Array.isArray(page)) throw new Error('Invalid database response');
      out.push(...page);
      if (!all || page.length < 1000) return out;
    }
  }
  rpc<T = unknown>(name: string, args: Record<string, unknown> = {}) {
    return this.request<T>(`/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  }
  invoke<T = unknown>(name: string, args: Record<string, unknown> = {}) {
    return this.request<T>(`/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  }
  async signOut() {
    const previous = this.session;
    await this.setSession(null);
    if (previous)
      await this.send(
        '/auth/v1/logout',
        { method: 'POST' },
        previous.access_token,
      );
  }
}
