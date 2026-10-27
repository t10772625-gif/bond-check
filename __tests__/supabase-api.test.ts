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
