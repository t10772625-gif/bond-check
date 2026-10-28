import { Database } from './db.mjs';
import { Pipeline } from './pipeline.mjs';
import { MAX_BYTES, readLimited } from './core.mjs';
import { fetchOfficial } from './official-fetch.ts';
import { convertDocument } from './documents.ts';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server setting: ${name}`);
  return value;
};
export const admin = () =>
  new Database(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
export const pipeline = () => new Pipeline(admin(), { fetchImpl: fetchOfficial, converter: convertDocument });

async function equalSecret(a: string, b: string) {
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    );
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let different = 0;
  for (let i = 0; i < x.length; i++) different |= x[i] ^ y[i];
  return different === 0 && a.length > 0 && b.length > 0;
}

export async function authorize(request: Request, cronOnly = false, adminOnly = false) {
  const secret = Deno.env.get('CRON_SECRET');
  const suppliedSecret = request.headers.get('x-cron-secret') ?? '';
  if (
    suppliedSecret.length >= 32 &&
    (secret
      ? await equalSecret(suppliedSecret, secret)
      : await admin().rpc('validate_scheduler_secret', { p_secret: suppliedSecret }))
  )
    return { cron: true, user: null, userDb: null };
  if (cronOnly)
    throw Object.assign(new Error('Scheduler authentication required'), {
      status: 401,
    });
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!token)
    throw Object.assign(new Error('Sign in required'), { status: 401 });
  const key =
    Deno.env.get('SUPABASE_ANON_KEY') ?? env('SUPABASE_PUBLISHABLE_KEY');
  const userDb = new Database(env('SUPABASE_URL'), key, token);
  const user = await userDb.request('/auth/v1/user');
  if (!user?.id || !(await userDb.rpc('is_app_owner')))
    throw Object.assign(new Error('Owner access required'), { status: 403 });
  if (adminOnly && !(await userDb.rpc('is_result_admin')))
    throw Object.assign(new Error('Result administrator access required'), { status: 403 });
  return { cron: false, user, userDb };
}

export async function body(request: Request) {
  const bytes = await readLimited(
    new Response(request.body, { headers: request.headers }),
    Math.ceil(MAX_BYTES * 1.4),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function serve(
  handler: (
    request: Request,
    context: Awaited<ReturnType<typeof authorize>>,
  ) => Promise<unknown>,
  cronOnly = false,
  adminOnly = false,
) {
  Deno.serve(async (request: Request) => {
    if (request.method !== 'POST')
      return Response.json({ error: 'POST required' }, { status: 405 });
    try {
      const context = await authorize(request, cronOnly, adminOnly);
      const result = await handler(request, context);
      return Response.json(result ?? { ok: true });
    } catch (error) {
      const failure = error as Error & { status?: number };
      return Response.json(
        { ok: false, error: failure.message },
        { status: failure.status ?? 500 },
      );
    }
  });
}
