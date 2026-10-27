import { AppState, NativeModules } from 'react-native';
import { SupabaseApi } from './api';

interface Manifest {
  pages: { url: string; denomination: number }[];
  files: { id: string; url: string }[];
}

// A foreground pass is bounded and resumable. The database retains unfinished files.
export async function syncFromDevice(api: SupabaseApi, active: () => boolean) {
  const native = NativeModules.BondFilePicker;
  if (!native?.fetchOfficial) return;
  const canContinue = () => active() && AppState.currentState === 'active';
  const fetchOne = async (url: string, action: string, file_id?: string) => {
    if (!canContinue()) return;
    const { wait_ms } = await api.invoke<{ wait_ms: number }>('device-sync', { action: 'reserve' });
    if (wait_ms > 0) await new Promise<void>(resolve => setTimeout(resolve, wait_ms));
    if (!canContinue()) return;
    const result = await native.fetchOfficial(url) as { base64: string };
    if (!canContinue()) return;
    await api.invoke('device-sync', { action, url, file_id, base64: result.base64 });
  };
  const failures: string[] = [];
  try {
    let manifest = await api.invoke<Manifest>('device-sync', { action: 'manifest' });
    for (const page of manifest.pages) {
      if (!canContinue()) return;
      try { await fetchOne(page.url, 'page'); }
      catch (error) { failures.push(`${page.url}: ${(error as Error).message}`); }
    }
    // Index discovery may have supplied the other five source pages.
    manifest = await api.invoke<Manifest>('device-sync', { action: 'manifest' });
    for (const page of manifest.pages.filter(p => p.denomination !== 0)) {
      if (!canContinue()) return;
      try { await fetchOne(page.url, 'page'); }
      catch (error) { failures.push(`${page.url}: ${(error as Error).message}`); }
    }
    manifest = await api.invoke<Manifest>('device-sync', { action: 'manifest' });
    for (const file of manifest.files) {
      if (!canContinue()) return;
      try { await fetchOne(file.url, 'file', file.id); }
      catch (error) {
        failures.push(`${file.url}: ${(error as Error).message}`);
        if (active()) await api.invoke('device-sync', { action: 'failure', file_id: file.id, error: (error as Error).message });
      }
    }
  } finally {
    if (failures.length && active()) {
      await api.invoke('device-sync', { action: 'failure', error: failures.join('; ').slice(0, 500) });
    }
  }
  if (failures.length) throw new Error(`Automatic device fetching needs attention: ${failures[0]}`);
}
