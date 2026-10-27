import { loadSettings } from './env.mjs';
const settings = await loadSettings();
if (!settings.CRON_SECRET) throw new Error('CRON_SECRET is required');
for (const name of ['heartbeat', 'discover', 'worker']) {
  const response = await fetch(
    settings.SUPABASE_URL + '/functions/v1/' + name,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': settings.CRON_SECRET,
      },
      body: '{}',
      signal: AbortSignal.timeout(145000),
    },
  );
  if (!response.ok) throw new Error(`${name} failed: HTTP ${response.status}`);
  const result = await response.json();
  if (result.jobs?.some(job => job.status !== 'done'))
    throw new Error(
      'A pipeline job needs retry or failed; inspect the status board',
    );
  console.log(`${name}: OK`);
}
