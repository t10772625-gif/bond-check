import { admin, body, pipeline, serve } from '../_shared/runtime.ts';
serve(async request => {
  const { chain = 0 } = await body(request);
  if (!Number.isInteger(chain) || chain < 0 || chain > 8)
    throw Object.assign(new Error('Invalid worker chain'), { status: 400 });
  const jobs = await pipeline().work(1);
  await admin().rpc('dispatch_worker', { p_chain: chain });
  return { jobs };
}, true);
