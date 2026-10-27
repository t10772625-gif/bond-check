import { readFile, writeFile } from 'node:fs/promises';
const settings = { ...process.env };
try {
  for (const line of (await readFile('.env', 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && !settings[match[1]])
      settings[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const url = settings.SUPABASE_URL ?? 'https://dwagvpxegvixgztmovyx.supabase.co';
const publishableKey =
  settings.SUPABASE_PUBLISHABLE_KEY ?? settings.SUPABASE_ANON_KEY ?? '';
if (new URL(url).origin !== 'https://dwagvpxegvixgztmovyx.supabase.co')
  throw new Error(
    'Unexpected project URL; explicitly review the target before changing this guard',
  );
if (publishableKey.startsWith('sb_secret_'))
  throw new Error('A secret API key must never be bundled into the app');
if (publishableKey.split('.').length === 3) {
  const payload = JSON.parse(
    Buffer.from(publishableKey.split('.')[1], 'base64url').toString(),
  );
  if (payload.role !== 'anon')
    throw new Error('Only the anon JWT key may be included in the app');
}
await writeFile(
  'src/cloud/generatedConfig.ts',
  `// Generated public app settings; never add server secrets here.\nexport const cloudConfig = ${JSON.stringify(
    { url, publishableKey },
    null,
    2,
  )};\n`,
);
console.log(
  publishableKey
    ? 'Supabase public settings generated.'
    : 'No public API key supplied. Local mode retained; cloud setup remains incomplete.',
);
