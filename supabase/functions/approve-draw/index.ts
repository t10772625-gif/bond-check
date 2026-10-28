import { body, serve } from '../_shared/runtime.ts';
serve(async (request, context) => {
  if (!context.userDb) throw new Error('Owner sign-in required');
  const { draw_id, numbers, note, file_sha256 } = await body(request);
  if (!Array.isArray(numbers) || !numbers.length || numbers.length > 5000)
    throw new Error('Supply the complete, reviewed number list');
  const seen = new Set();
  for (const item of numbers) {
    if (
      !/^\d{6}$/.test(item.number) ||
      ![1, 2, 3].includes(item.tier) ||
      seen.has(item.number)
    )
      throw new Error('Invalid or duplicate reviewed number');
    seen.add(item.number);
  }
  await context.userDb.rpc('approve_draw', {
    p_draw: draw_id,
    p_numbers: numbers,
    p_note: note,
    p_sha256: file_sha256,
  });
  return { ok: true };
}, false, true);
