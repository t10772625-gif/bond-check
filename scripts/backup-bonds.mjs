import { Database } from '../supabase/functions/_shared/db.mjs';
import { loadSettings } from './env.mjs';
const settings = await loadSettings();
if (new Date().getUTCDay() !== 1 && settings.FORCE_BACKUP !== 'true') {
  console.log('Weekly backup is scheduled for Monday.');
} else {
  if (!settings.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('Server credentials are required for weekly backups');
  const db = new Database(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY,
  );
  const bonds = await db.select('bonds', {}, { all: true });
  for (const ownerId of new Set(bonds.map(b => b.owner_id))) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rows = bonds.filter(b => b.owner_id === ownerId);
    for (let offset = 0; offset < rows.length; offset += 1000) {
      const data = JSON.stringify({
        app: 'bondcheck',
        version: 3,
        exported: new Date().toISOString(),
        bonds: rows.slice(offset, offset + 1000),
      });
      await db.upload(
        'bond-backups',
        `${ownerId}/weekly-${stamp}-${offset / 1000}.json`,
        new TextEncoder().encode(data),
        'application/json',
      );
    }
  }
  console.log(`Backed up ${bonds.length} bond rows to private storage.`);
}
