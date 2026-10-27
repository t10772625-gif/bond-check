import { admin, body, pipeline, serve } from '../_shared/runtime.ts';
import { DENOMINATIONS, MAX_BYTES, sha256 } from '../_shared/core.mjs';
serve(async (request, context) => {
  if (!context.user) throw new Error('A signed-in owner must upload files');
  const input = await body(request);
  if (
    !DENOMINATIONS.includes(input.denomination) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.draw_date)
  )
    throw new Error('Valid denomination and date required');
  const date = new Date(`${input.draw_date}T00:00:00Z`);
  if (
    !Number.isFinite(+date) ||
    date.toISOString().slice(0, 10) !== input.draw_date
  )
    throw new Error('Invalid draw date');
  if (
    typeof input.base64 !== 'string' ||
    input.base64.length > Math.ceil((MAX_BYTES * 4) / 3) + 4
  )
    throw new Error('File exceeds 5 MB');
  const bytes = Uint8Array.from(atob(input.base64), (value: string) =>
    value.charCodeAt(0),
  );
  if (bytes.length > MAX_BYTES || bytes.length === 0)
    throw new Error('A non-empty file up to 5 MB is required');
  const filename = String(input.filename ?? 'uploaded.txt');
  const extension = filename.split('.').pop()?.toLowerCase();
  if (!['txt', 'pdf', 'xls', 'xlsx', 'doc', 'docx'].includes(extension))
    throw new Error('Unsupported result-file format');
  const db = admin();
  const digest = await sha256(bytes);
  const draw =
    (
      await db.insert(
        'draws',
        { denomination: input.denomination, draw_date: input.draw_date },
        { onConflict: 'denomination,draw_date', ignore: true },
      )
    )[0] ??
    (
      await db.select('draws', {
        denomination: `eq.${input.denomination}`,
        draw_date: `eq.${input.draw_date}`,
      })
    )[0];
  const storagePath = `${draw.id}/manual/${digest}.${extension}`;
  try {
    await db.upload('draw-raw', storagePath, bytes);
  } catch (error) {
    if (!/HTTP 409|already exists|Duplicate/i.test((error as Error).message))
      throw error;
  }
  const file =
    (
      await db.insert(
        'draw_files',
        {
          draw_id: draw.id,
          url: `manual://${draw.id}/${digest}`,
          kind: extension === 'txt' ? 'manual' : extension,
          label: filename.slice(0, 200),
          sha256: digest,
          storage_path: storagePath,
          bytes: bytes.length,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'url', ignore: true },
      )
    )[0] ??
    (
      await db.select('draw_files', { url: `eq.manual://${draw.id}/${digest}` })
    )[0];
  await db.insert(
    'draw_file_versions',
    {
      file_id: file.id,
      sha256: digest,
      storage_path: storagePath,
      bytes: bytes.length,
    },
    { onConflict: 'file_id,sha256', ignore: true },
  );
  await pipeline().enqueue('ingest_draw', { draw_id: draw.id });
  await db.rpc('dispatch_worker');
  await db.update(
    'heartbeat',
    { id: 'eq.1' },
    { last_device_sync: new Date().toISOString() },
  );
  return { ok: true, draw_id: draw.id, file_id: file.id };
});
