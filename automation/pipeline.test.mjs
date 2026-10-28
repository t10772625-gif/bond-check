import test from 'node:test';
import assert from 'node:assert/strict';
import { Pipeline } from '../supabase/functions/_shared/pipeline.mjs';
import { registerSourcePage } from '../supabase/functions/_shared/discovery.mjs';

test('device-downloaded bytes are parsed on the server without fetching the blocked origin', async () => {
  const bytes = new TextEncoder().encode('108th DRAW OF Rs.750/- DENOMINATION\nFirst Prize\n007447\nSecond Prize\n123456 123457 123458\nThird Prize\n123459');
  let downloaded = 0;
  const db = {
    download: async (bucket, path) => {
      assert.equal(bucket, 'draw-raw'); assert.equal(path, 'stored/result.txt'); downloaded++; return bytes;
    },
    update: async () => [],
  };
  const pipeline = new Pipeline(db, { fetchImpl: () => { throw new Error('Origin must not be contacted'); } });
  const result = await pipeline.candidate({
    id: 'file', kind: 'txt', url: 'https://savings.gov.pk/a.txt',
    storage_path: 'stored/result.txt', sha256: 'digest', device_fetched_at: new Date().toISOString(),
  }, { denomination: 750, draw_date: '2026-10-15' }, []);
  assert.equal(downloaded, 1);
  assert.ok(result.result.parsed.first.includes('007447'));
  assert.equal(result.result.status, 'needs_review');
});

test('HTML received by the device cannot be ingested as winning numbers', async () => {
  const pipeline = new Pipeline({ download: async () => new TextEncoder().encode('<html>Service unavailable</html>') });
  await assert.rejects(pipeline.candidate({
    kind: 'txt', device_fetched_at: new Date().toISOString(), storage_path: 'result', url: 'https://savings.gov.pk/a.txt',
  }, { denomination: 750, draw_date: '2026-10-15' }, []), /HTML/);
});

test('device and server discovery retain all candidate formats and queue a draw only once', async () => {
  const calls = [];
  const db = {
    insert: async (table, rows) => { calls.push({ table, rows }); },
    select: async table => table === 'draws' ? [{ id: 'draw', draw_date: '2026-10-15' }] : [],
    rpc: async (name, args) => calls.push({ name, args }),
    update: async (table, filter, values) => calls.push({ table, filter, values }),
  };
  const count = await registerSourcePage(db, { denomination: 750, last_link_count: 0 }, new TextEncoder().encode(
    '<a href="/a.txt">15-10-2026 Text</a><a href="/a.pdf">15-10-2026 PDF</a><a href="/revised.txt">15-10-2026 Revised</a>',
  ), 'https://savings.gov.pk/list/');
  assert.equal(count, 3);
  assert.equal(calls.filter(c => c.name === 'enqueue_job').length, 1);
  assert.equal(calls.find(c => c.table === 'draw_files').rows.length, 3);
  assert.ok(calls.find(c => c.table === 'draw_files').rows.some(f => f.is_revised));
});

test('a truncated source page cannot replace the previous discovery snapshot', async () => {
  let writes = 0;
  await assert.rejects(registerSourcePage({ insert: async () => { writes++; } },
    { denomination: 750, last_link_count: 30 },
    new TextEncoder().encode('<a href="/a.txt">15-10-2026 Text</a>'),
    'https://savings.gov.pk/list/'), /Result links fell/);
  assert.equal(writes, 0);
});

test('failed jobs retain their current lease and error for retry instead of reporting success', async () => {
  const calls = [];
  const pipeline = new Pipeline({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return name === 'claim_jobs' ? [{ id: 5, kind: 'discover', payload: {}, lease_token: 'lease-5' }] : null;
    },
    insert: async () => [],
  });
  pipeline.discover = async () => ({ failures: [{ denomination: 750 }] });
  const result = await pipeline.work();
  assert.equal(result[0].status, 'retry_or_failed');
  const finish = calls.find(c => c.name === 'finish_job').args;
  assert.equal(finish.p_lease, 'lease-5');
  assert.match(finish.p_error, /sources unresolved/);
});
