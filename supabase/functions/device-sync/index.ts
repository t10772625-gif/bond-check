import { admin, body, pipeline, serve } from '../_shared/runtime.ts';
import { decodeOfficial, discoverSourcePages, MAX_BYTES, officialUrl, sha256 } from '../_shared/core.mjs';
import { registerSourcePage } from '../_shared/discovery.mjs';

serve(async (request, context) => {
  if (!context.user) throw Object.assign(new Error('Owner sign-in required'), { status: 403 });
  const input = await body(request);
  const db = admin();
  const sources = await db.select('sources', { active: 'eq.true', order: 'denomination.asc' });
  if (input.action === 'reserve') return { wait_ms: await db.rpc('reserve_fetch_slot') };
  if (input.action === 'manifest') {
    const cutoff = Date.now() - 86400000;
    const pages = sources.filter(s => s.list_url && (!s.last_discovered_at || Date.parse(s.last_discovered_at) < cutoff))
      .map(s => ({ url: s.list_url, denomination: s.denomination }));
    if (sources.some(s => !s.list_url)) pages.unshift({ url: 'https://savings.gov.pk/download-draws/', denomination: 0 });
    const eligible = { device_fetch_attempts: 'lt.6', or: `(device_retry_at.is.null,device_retry_at.lte.${new Date().toISOString()})` };
    const missing = await db.select('draw_files', { ...eligible, storage_path: 'is.null', order: 'device_retry_at.asc.nullsfirst,id.asc', limit: '8' });
    const recentDraws = (await Promise.all(sources.map(s => db.select('draws', {
      denomination: `eq.${s.denomination}`, order: 'draw_date.desc', limit: '3',
    })))).flat();
    const recent = recentDraws.length ? await db.select('draw_files', {
      ...eligible,
      draw_id: `in.(${recentDraws.map(d => d.id).join(',')})`,
      fetched_at: `lt.${new Date(cutoff).toISOString()}`, order: 'fetched_at.asc', limit: '8',
    }) : [];
    const files = [...new Map([...missing, ...recent].filter(f => /^https:/.test(f.url)).map(f => [f.id, f])).values()]
      .slice(0, 8).map(f => ({ id: f.id, url: f.url }));
    return { pages, files };
  }
  if (input.action === 'failure') {
    await pipeline().event('error', 'discovery_failed', `Device fetch: ${String(input.error).slice(0, 500)}`);
    if (input.file_id) {
      const file = (await db.select('draw_files', { id: `eq.${input.file_id}` }))[0];
      if (file) {
        const attempts = file.device_fetch_attempts + 1;
        const seconds = [60, 300, 1800, 10800][Math.min(attempts - 1, 3)];
        await db.update('draw_files', { id: `eq.${file.id}` }, {
          device_fetch_attempts: attempts, device_retry_at: new Date(Date.now() + seconds * 1000).toISOString(),
          ...(!file.storage_path ? { parse_status: 'failed', issues: [String(input.error).slice(0, 500)] } : {}),
        });
      }
    }
    return { ok: true };
  }
  if (input.action !== 'page' && input.action !== 'file')
    throw Object.assign(new Error('Unknown device sync action'), { status: 400 });
  officialUrl(input.url);
  if (typeof input.base64 !== 'string' || input.base64.length > Math.ceil(MAX_BYTES * 4 / 3) + 4)
    throw new Error('Official file exceeds 5 MB');
  const bytes = Uint8Array.from(atob(input.base64), (c: string) => c.charCodeAt(0));
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Invalid official file size');
  if (input.action === 'page') {
    if (input.url === 'https://savings.gov.pk/download-draws/') {
      const detected = discoverSourcePages(decodeOfficial(bytes), input.url);
      for (const s of detected) {
        if (s.ambiguous) {
          await pipeline().event('warning', 'source_ambiguous', `Several pages match Rs${s.denomination}; configure its source URL.`);
        } else if (sources.some(existing => existing.denomination === s.denomination && !existing.list_url)) {
          await db.update('sources', { denomination: `eq.${s.denomination}` }, { list_url: s.list_url });
        }
      }
    } else {
      const source = sources.find(s => s.list_url === input.url);
      if (!source) throw new Error('Page is not a configured official source');
      await registerSourcePage(db, source, bytes, input.url);
    }
    const refreshed = await db.select('sources', { active: 'eq.true' });
    if (refreshed.length === 6 && refreshed.every(s => s.list_url && s.last_discovered_at && Date.now() - Date.parse(s.last_discovered_at) < 86400000))
      await db.update('heartbeat', { id: 'eq.1' }, { last_discovery_ok: new Date().toISOString() });
  } else {
    const file = (await db.select('draw_files', { id: `eq.${input.file_id}` }))[0];
    if (!file || file.url !== input.url) throw new Error('File is not a discovered official candidate');
    if (/^\s*<(?:!doctype|html|head|body)\b/i.test(decodeOfficial(bytes.slice(0, 512))))
      throw new Error('Official server returned an HTML error page');
    const digest = await sha256(bytes);
    const storagePath = `${file.draw_id}/${file.id}/${digest}.${file.kind}`;
    try { await db.upload('draw-raw', storagePath, bytes); }
    catch (error) { if (!/HTTP 409|already exists|Duplicate/i.test((error as Error).message)) throw error; }
    await db.insert('draw_file_versions', { file_id: file.id, sha256: digest, storage_path: storagePath, bytes: bytes.length },
      { onConflict: 'file_id,sha256', ignore: true });
    await db.update('draw_files', { id: `eq.${file.id}` }, {
      sha256: digest, storage_path: storagePath, bytes: bytes.length,
      fetched_at: new Date().toISOString(), device_fetched_at: new Date().toISOString(), http_status: 200,
      device_fetch_attempts: 0, device_retry_at: null,
      ...(file.sha256 !== digest ? { converted_sha256: null } : {}),
    });
    await pipeline().enqueue('ingest_draw', { draw_id: file.draw_id });
    await db.rpc('dispatch_worker');
  }
  await db.update('heartbeat', { id: 'eq.1' }, { last_device_sync: new Date().toISOString() });
  return { ok: true };
});
