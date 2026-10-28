import { SupabaseApi } from '../src/cloud/api';
import type { CloudSession } from '../src/cloud/types';

const session: CloudSession = {
  access_token: 'old-access',
  refresh_token: 'old-refresh',
  expires_at: 0,
  user: { id: 'owner' },
};
const json = (value: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(value),
  } as Response);

test('concurrent API calls share one session refresh and use the refreshed token', async () => {
  const original = globalThis.fetch;
  const transport = jest.fn(async (url: string) =>
    url.includes('/token?')
      ? json({
          ...session,
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        })
      : json([{ number: '007447' }]),
  );
  globalThis.fetch = transport as typeof fetch;
  try {
    const api = new SupabaseApi('https://example.supabase.co', 'public-key');
    api.session = { ...session };
    const results = await Promise.all([
      api.select('bonds'),
      api.select('bonds'),
      api.select('bonds'),
    ]);
    expect(
      transport.mock.calls.filter(([url]) => url.includes('/token?')),
    ).toHaveLength(1);
    expect(results[0]).toEqual([{ number: '007447' }]);
    expect(api.session?.access_token).toBe('new-access');
  } finally {
    globalThis.fetch = original;
  }
});

test('a refresh completing after logout cannot restore a cleared session', async () => {
  const original = globalThis.fetch;
  let resolveResponse: ((value: Response) => void) | undefined;
  globalThis.fetch = jest.fn(
    () =>
      new Promise<Response>(resolve => {
        resolveResponse = resolve;
      }),
  ) as typeof fetch;
  try {
    const api = new SupabaseApi('https://example.supabase.co', 'public-key');
    api.session = { ...session };
    const refreshing = api.refresh();
    api.session = null;
    resolveResponse!(json({ ...session, access_token: 'late-access' }));
    await refreshing;
    expect(api.session).toBeNull();
  } finally {
    globalThis.fetch = original;
  }
});

test('a portfolio larger than 1000 rows uses stable descending keyset pages', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = jest.fn(async (url: string) => {
    urls.push(url);
    const cursor = new URL(url).searchParams.get('local_id');
    const first = cursor === null ? 1501 : Number(cursor.slice(3)) - 1;
    return json(Array.from({ length: Math.min(1000, first) }, (_, i) => ({ id: String(first - i), local_id: first - i })));
  }) as typeof fetch;
  try {
    const api = new SupabaseApi('https://example.supabase.co', 'public-key');
    api.session = { ...session, expires_at: 9999999999 };
    const records = await api.select<{ id: string; local_id: number }>('bonds', { order: 'local_id.desc' }, true);
    expect(records).toHaveLength(1501);
    expect(new Set(records.map(row => row.id)).size).toBe(1501);
    expect(records[0].local_id).toBe(1501);
    expect(records[1500].local_id).toBe(1);
    expect(new URL(urls[1]).searchParams.get('local_id')).toBe('lt.502');
    expect(urls.some(url => new URL(url).searchParams.has('offset'))).toBe(false);
  } finally { globalThis.fetch = original; }
});

test('terminal refresh rejection removes the invalid session', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn(async () => json({ error_description: 'Invalid Refresh Token' }, 400)) as typeof fetch;
  try {
    const api = new SupabaseApi('https://example.supabase.co', 'public-key');
    api.session = { ...session };
    const persisted = jest.fn().mockResolvedValue(undefined);
    api.onSession = persisted;
    await expect(api.request('/rest/v1/bonds')).rejects.toThrow('Invalid Refresh Token');
    expect(api.session).toBeNull();
    expect(persisted).toHaveBeenCalledWith(null);
  } finally { globalThis.fetch = original; }
});

test('native recovery callback validates the user before persisting a recovery session', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn(async () => json({ id: 'verified-owner', email: 'qa@example.test' })) as typeof fetch;
  try {
    const api = new SupabaseApi('https://example.supabase.co', 'public-key');
    const persisted = jest.fn().mockResolvedValue(undefined);
    api.onSession = persisted;
    await expect(api.acceptAuthLink('bondcheck://auth/callback#access_token=recovery-access&refresh_token=recovery-refresh&type=recovery&expires_in=3600')).resolves.toEqual({ recovery: true });
    expect(globalThis.fetch).toHaveBeenCalledWith('https://example.supabase.co/auth/v1/user', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer recovery-access' }) }));
    expect(persisted).toHaveBeenCalledWith(expect.objectContaining({ recovery: true, user: { id: 'verified-owner', email: 'qa@example.test' } }));
  } finally { globalThis.fetch = original; }
});

test('expired email links and unrelated URLs cannot replace the signed-in account', async () => {
  const api = new SupabaseApi('https://example.supabase.co', 'public-key');
  api.session = { ...session };
  await expect(api.acceptAuthLink('bondcheck://auth/callback#error=access_denied&error_code=otp_expired')).rejects.toThrow('expired or was already used');
  await expect(api.acceptAuthLink('https://example.test/#access_token=untrusted')).resolves.toBeNull();
  expect(api.session).toEqual(session);
});

test('a queued write cannot move to another account while its token refresh is pending', async () => {
  const original = globalThis.fetch;
  let finishRefresh!: (value: Response) => void;
  const transport = jest.fn(() => new Promise<Response>(resolve => { finishRefresh = resolve; }));
  globalThis.fetch = transport as typeof fetch;
  try {
    const api = new SupabaseApi('https://example.supabase.co', 'public-key');
    api.session = { ...session };
    const pending = api.request('/rest/v1/bonds', { method: 'POST', body: 'private-account-a-data' });
    api.session = { ...session, user: { id: 'other-owner' }, refresh_token: 'other-refresh', expires_at: 9999999999 };
    finishRefresh(json({ ...session, access_token: 'late-old-owner-token' }));
    await expect(pending).rejects.toThrow('account changed');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(api.session.user.id).toBe('other-owner');
  } finally { globalThis.fetch = original; }
});

test('refreshing a recovery session preserves the new-password requirement', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn(async () => json({ ...session, access_token: 'refreshed', expires_in: 3600 })) as typeof fetch;
  try {
    const api = new SupabaseApi('https://example.supabase.co', 'public-key');
    api.session = { ...session, recovery: true };
    const persist = jest.fn().mockResolvedValue(undefined);
    api.onSession = persist;
    await api.refresh();
    expect(api.session?.recovery).toBe(true);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ recovery: true }));
  } finally { globalThis.fetch = original; }
});
