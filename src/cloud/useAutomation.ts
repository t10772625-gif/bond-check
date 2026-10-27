import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { cloudConfig } from './generatedConfig';
import { SupabaseApi } from './api';
import { SupabaseRepo } from '../data/SupabaseRepo';
import type { CloudSession, CloudSnapshot, PipelineStatus } from './types';
import { syncFromDevice } from './deviceSync';
import { refreshAfterSync } from './refresh';

const SESSION_SERVICE = 'bondcheck.supabase.session';
const cacheKey = (id: string) => `bondcheck.cloud.cache.${id}`;

export function useAutomation() {
  const configured = !!cloudConfig.publishableKey;
  const api = useMemo(
    () => new SupabaseApi(cloudConfig.url, cloudConfig.publishableKey),
    [],
  );
  const repository = useMemo(() => new SupabaseRepo(api), [api]);
  const [session, setSession] = useState<CloudSession | null>(null);
  const [snapshot, setSnapshot] = useState<CloudSnapshot | null>(null);
  const [loaded, setLoaded] = useState(!configured);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const flightId = useRef(0);
  const deviceFlight = useRef<Promise<void> | null>(null);
  const deviceSync = useCallback(() => {
    if (!api.session || AppState.currentState !== 'active')
      return Promise.resolve();
    if (deviceFlight.current) return deviceFlight.current;
    const ownerId = api.session.user.id;
    deviceFlight.current = (async () => {
      const status = await api.rpc<PipelineStatus>('pipeline_status');
      const last = status.heartbeat.last_discovery_ok;
      if (
        !status.missing_sources &&
        last &&
        Date.now() - Date.parse(last) < 3 * 86400000
      )
        return;
      await syncFromDevice(api, () => api.session?.user.id === ownerId);
    })().finally(() => {
      deviceFlight.current = null;
    });
    return deviceFlight.current;
  }, [api]);

  const reload = useCallback(async () => {
    if (!api.session) return;
    const ownerId = api.session.user.id;
    if (inFlight.current) return inFlight.current;
    const currentFlight = ++flightId.current;
    inFlight.current = (async () => {
      try {
        const data = await repository.snapshot();
        if (api.session?.user.id !== ownerId) return;
        setSnapshot(data);
        setError('');
        setConnected(true);
        await AsyncStorage.setItem(cacheKey(ownerId), JSON.stringify(data));
      } catch (failure) {
        if (api.session?.user.id === ownerId) {
          setConnected(false);
          setError((failure as Error).message);
        }
        throw failure;
      }
    })().finally(() => {
      if (flightId.current === currentFlight) inFlight.current = null;
    });
    return inFlight.current;
  }, [api, repository]);

  const syncAndReload = useCallback(async () => {
    // A failed official-site download must not prevent fresh server wins,
    // corrections and acknowledgement updates from reaching the screen.
    await refreshAfterSync(deviceSync, reload);
  }, [deviceSync, reload]);

  useEffect(() => {
    if (!configured) return;
    let mounted = true;
    api.onSession = async value => {
      if (value) {
        await Keychain.setGenericPassword('supabase', JSON.stringify(value), {
          service: SESSION_SERVICE,
        });
      } else {
        setSnapshot(null);
        setConnected(false);
        inFlight.current = null;
        flightId.current++;
        if (mounted) setSession(null);
        await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
      }
      if (mounted) setSession(value);
    };
    (async () => {
      try {
        const saved = await Keychain.getGenericPassword({
          service: SESSION_SERVICE,
        });
        if (saved) {
          const value = JSON.parse(saved.password) as CloudSession;
          if (!value.user?.id || !value.refresh_token)
            throw new Error('Saved cloud session is invalid; sign in again');
          api.session = value;
          if (mounted) setSession(value);
          const cached = await AsyncStorage.getItem(cacheKey(value.user.id));
          if (cached && mounted) setSnapshot(JSON.parse(cached));
          await reload();
        }
      } catch (failure) {
        if (mounted) setError((failure as Error).message);
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && api.session) {
        api
          .invoke('heartbeat')
          .then(() => syncAndReload())
          .catch(failure => setError((failure as Error).message));
      }
    });
    return () => {
      mounted = false;
      api.onSession = null;
      subscription.remove();
    };
  }, [api, configured, reload, syncAndReload]);

  useEffect(() => {
    if (!configured || !session) return;
    api
      .invoke('heartbeat')
      .then(() => syncAndReload())
      .catch(failure => setError((failure as Error).message));
    const timer = setInterval(() => {
      syncAndReload().catch(failure => setError((failure as Error).message));
    }, 30000);
    return () => clearInterval(timer);
  }, [api, configured, session?.user.id, syncAndReload]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async (email: string, password: string) => {
    setBusy(true);
    setError('');
    try {
      await api.signIn(email, password);
      await reload();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const run = async (action = 'check') => {
    setBusy(true);
    try {
      await api.invoke('check-now', { action });
      await syncAndReload();
    } catch (failure) {
      setError((failure as Error).message);
      throw failure;
    } finally {
      setBusy(false);
    }
  };
  const signUp = async (name: string, email: string, password: string) => {
    setBusy(true);
    setError('');
    try {
      return await api.signUp(name, email, password);
    } catch (failure) {
      setError((failure as Error).message);
      throw failure;
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    setSigningOut(true);
    try {
      await api.signOut();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSigningOut(false);
    }
  };
  const last = snapshot?.status.heartbeat.last_discovery_ok;
  const stale = !last || Date.now() - Date.parse(last) > 3 * 86400000;
  const status = snapshot?.status;
  const complete =
    !!status &&
    status.total > 0 &&
    status.total === status.verified &&
    !status.attention &&
    !status.pending_jobs &&
    !status.failed_jobs &&
    !status.missing_sources &&
    !stale &&
    !error &&
    connected;
  return {
    configured,
    api,
    repository,
    session,
    snapshot,
    loaded,
    busy,
    signingOut,
    error,
    reload,
    signIn,
    signUp,
    signOut,
    run,
    stale,
    complete,
    connected,
  };
}
