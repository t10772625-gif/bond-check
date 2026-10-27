import { admin, body, pipeline, serve } from '../_shared/runtime.ts';
declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };
serve(async (request, context) => {
  if (!context.userDb)
    throw new Error('Use discover/worker for scheduler calls');
  const { action = 'check' } = await body(request);
  if (!['check', 'backfill', 'reconcile', 'retry'].includes(action))
    throw new Error('Unknown check action');
  const worker = pipeline();
  if (action === 'retry')
    await admin().update('draw_files', { device_fetch_attempts: 'gt.0' }, { device_fetch_attempts: 0, device_retry_at: null });
  await worker.enqueue('discover');
  await context.userDb.rpc('request_pipeline', { p_action: action });
  // The persisted queue survives a closed app or interrupted Edge invocation.
  EdgeRuntime.waitUntil(worker.work(1).then(() => admin().rpc('dispatch_worker')));
  return { ok: true, queued: true };
});
