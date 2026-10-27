import { admin, pipeline, serve } from '../_shared/runtime.ts';
serve(async () => {
  const result = await pipeline().discover();
  await admin().rpc('dispatch_worker');
  if (result.failures.length)
    throw new Error(
      `${result.failures.length} official sources could not be discovered; see the status board`,
    );
  return result;
}, true);
