import { admin, serve } from '../_shared/runtime.ts';
serve(async (_request, context) => {
  const db = admin();
  await db.update(
    'heartbeat',
    { id: 'eq.1' },
    { last_beat: new Date().toISOString() },
  );
  await db.rpc('watchdog');
  return context.userDb
    ? await context.userDb.rpc('pipeline_status')
    : {
        ok: true,
        heartbeat: (await db.select('heartbeat', { id: 'eq.1' }))[0],
      };
});
