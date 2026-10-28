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
        let message = String(
          data?.message ??
            data?.error_description ??
            data?.msg ??
            data?.error ??
            'Server paused or unreachable',
        );
        if (data?.code === '23505')
          message = 'This bond already exists, or is in Recently deleted. Restore it from Settings instead of adding it again.';
        if (data?.error_code === 'email_not_confirmed' || /email not confirmed/i.test(message))
          message = 'Confirm your email first, then log in. You can resend the confirmation email below.';
        throw Object.assign(
          new Error(`Supabase ${response.status}: ${message}`),
          { status: response.status, code: data?.error_code ?? data?.code },
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
    const result = (await this.send('/auth/v1/signup?redirect_to=' + encodeURIComponent('bondcheck://auth/callback'), {
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
        const recovery = this.session!.recovery === true;
        let result: CloudSession & { expires_in: number };
        try {
          result = (await this.send(
          '/auth/v1/token?grant_type=refresh_token',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          },
          )) as CloudSession & { expires_in: number };
        } catch (error) {
          const failure = error as Error & { status?: number };
          if ((failure.status === 400 || failure.status === 401) && this.session?.refresh_token === refreshToken)
            await this.setSession(null);
          throw error;
        }
        if (this.session?.refresh_token !== refreshToken) return;
        if (!result.access_token || !result.user?.id)
          throw new Error('Session refresh failed; sign in again');
        await this.setSession({
          ...result,
          recovery,
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
    const ownerId = this.session?.user.id;
    await this.refresh();
    if (!this.session) throw new Error('Session ended; sign in again');
    if (this.session.user.id !== ownerId) throw new Error('The signed-in account changed. Please try again.');
    try {
      return (await this.send(path, init, this.session!.access_token)) as T;
    } catch (error) {
      if ((error as { status?: number }).status !== 401) throw error;
      await this.refresh(true);
      if (!this.session) throw new Error('Session ended; sign in again');
      if (this.session.user.id !== ownerId) throw new Error('The signed-in account changed. Please try again.');
      return (await this.send(path, init, this.session!.access_token)) as T;
    }
  }
  async select<T>(
    table: string,
    query: Record<string, string> = {},
    all = false,
  ): Promise<T[]> {
    const out: T[] = [];
    const seen = new Set<string>();
    const order = query.order ?? 'id.asc';
    const keyset = all ? /^(id|local_id)\.(asc|desc)$/.exec(order) : null;
    let cursor: string | null = null;
    for (let offset = 0; ; offset += 1000) {
      if (offset > 500000) throw new Error('Too many records');
      const values: Record<string, string> = {
        select: '*',
        ...query,
        ...(all ? {
          limit: '1000', order,
          ...(keyset ? cursor === null ? {} : { [keyset[1]]: `${keyset[2] === 'asc' ? 'gt' : 'lt'}.${cursor}` } : { offset: String(offset) }),
        } : {}),
      };
      const params: string = Object.entries(values)
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
        )
        .join('&');
      const page: T[] = await this.request<T[]>(`/rest/v1/${table}?${params}`);
      if (!Array.isArray(page)) throw new Error('Invalid database response');
      for (const row of page) {
        const id = (row as { id?: string }).id;
        if (id !== undefined) {
          if (seen.has(String(id))) continue;
          seen.add(String(id));
        }
        out.push(row);
      }
      if (!all || page.length < 1000) return out;
      if (keyset) {
        const next: string = String((page[page.length - 1] as Record<string, unknown>)[keyset[1]] ?? '');
        if (!next || next === cursor) throw new Error('The server could not advance the record page. Refresh and try again.');
        cursor = next;
      }
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
  resendConfirmation(email: string) {
    return this.send('/auth/v1/resend?redirect_to=' + encodeURIComponent('bondcheck://auth/callback'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'signup', email: email.trim() }) });
  }
  sendPasswordReset(email: string) {
    return this.send('/auth/v1/recover?redirect_to=' + encodeURIComponent('bondcheck://auth/callback'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) });
  }
  async verifyRecovery(email: string, token: string) {
    const result = await this.send('/auth/v1/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), token: token.trim(), type: 'recovery' }) }) as CloudSession & { expires_in: number };
    if (!result.access_token || !result.refresh_token || !result.user?.id) throw new Error('Invalid recovery code. Request a new code and try again.');
    await this.setSession({ ...result, recovery: true, expires_at: result.expires_at ?? Math.floor(Date.now() / 1000) + result.expires_in });
  }
  updatePassword(password: string) {
    return this.request('/auth/v1/user', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  }
  async acceptAuthLink(url: string) {
    if (!/^bondcheck:\/\/auth\/callback(?:[?#]|$)/.test(url)) return null;
    const raw = url.split(/[?#]/).slice(1).join('&');
    const values: Record<string, string> = {};
    for (const part of raw.split('&')) {
      const index = part.indexOf('=');
      if (index >= 0) values[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1).replace(/\+/g, ' '));
    }
    if (values.error || values.error_description) throw new Error('This email link has expired or was already used. If you confirmed your email, log in with your password. Otherwise resend the email.');
    if (!values.access_token || !values.refresh_token) throw new Error('This email link is incomplete. Request a fresh email.');
    const user = await this.send('/auth/v1/user', { method: 'GET' }, values.access_token) as CloudSession['user'];
    if (!user?.id) throw new Error('Email verification could not be confirmed. Try logging in.');
    const expires = Number(values.expires_at) || Math.floor(Date.now() / 1000) + (Number(values.expires_in) || 3600);
    await this.setSession({ access_token: values.access_token, refresh_token: values.refresh_token, expires_at: expires, user, recovery: values.type === 'recovery' });
    return { recovery: values.type === 'recovery' };
  }
}
