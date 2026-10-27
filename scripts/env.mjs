import { readFile } from 'node:fs/promises';
export async function loadSettings() {
  const values = { ...process.env };
  try {
    for (const line of (await readFile('.env', 'utf8')).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (match && !values[match[1]])
        values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const url = values.SUPABASE_URL ?? 'https://dwagvpxegvixgztmovyx.supabase.co';
  if (new URL(url).origin !== 'https://dwagvpxegvixgztmovyx.supabase.co')
    throw new Error(
      'Unexpected Supabase project; review the target before changing this guard',
    );
  return { ...values, SUPABASE_URL: url };
}
