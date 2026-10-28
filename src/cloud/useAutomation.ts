import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { cloudConfig } from './generatedConfig';
import { SupabaseApi } from './api';
import { SupabaseRepo } from '../data/SupabaseRepo';
import type { CloudSession, CloudSnapshot } from './types';
import { syncFromDevice } from './deviceSync';
import { useCloudBiometrics } from './useCloudBiometrics';

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
  const biometrics = useCloudBiometrics(session?.user.id);
  const [snapshot, setSnapshot] = useState<CloudSnapshot | null>(null);
  const latestSnapshot = useRef<CloudSnapshot | null>(null);
  const [loaded, setLoaded] = useState(!configured);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [connected, setConnected] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const authorized = useRef(false);
  const sessionOwner = useRef<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const flightId = useRef(0);
  const deviceFlight = useRef<Promise<boolean> | null>(null);
  const deviceSync = useCallback(() => {
    if (!api.session || AppState.currentState !== 'active')
      return Promise.resolve(false);
    if (deviceFlight.current) return deviceFlight.current;
    const ownerId = api.session.user.id;
    deviceFlight.current = (async () => {
      const status = latestSnapshot.current?.status;
      if (!status?.can_manage_results) return false;
      const last = status.heartbeat.last_discovery_ok;
      if (
        !status.missing_sources &&
        last &&
        Date.now() - Date.parse(last) < 3 * 86400000
      )
        return false;
      await syncFromDevice(api, () => api.session?.user.id === ownerId);
      return true;
    })().finally(() => {
      deviceFlight.current = null;
    });
    return deviceFlight.current;
  }, [api]);

  const reload = useCallback(async (afterMutation = false) => {
    if (!api.session) return;
    const ownerId = api.session.user.id;
    if (inFlight.current) {
      if (!afterMutation) return inFlight.current;
      // A pre-save poll may contain old rows; wait, then fetch the committed state.
      await inFlight.current.catch(() => undefined);
      if (api.session?.user.id !== ownerId) return;
    }
    const currentFlight = ++flightId.current;
    inFlight.current = (async () => {
      try {
        const data = await repository.snapshot();
        if (api.session?.user.id !== ownerId || flightId.current !== currentFlight) return;
        setSnapshot(data);
        latestSnapshot.current = data;
        setError('');
        setConnected(true);
        authorized.current = true;
        await AsyncStorage.setItem(cacheKey(ownerId), JSON.stringify(data));
      } catch (failure) {
        if (api.session?.user.id === ownerId && flightId.current === currentFlight) {
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
    await reload();
    // Portfolio state is available immediately; slow source fallback runs separately.
    const ownerId = api.session?.user.id;
    deviceSync().then(changed => { if (changed && api.session?.user.id === ownerId) return reload(); })
      .catch(failure => { if (api.session?.user.id === ownerId) setError((failure as Error).message); });
  }, [api, deviceSync, reload]);

  useEffect(() => {
    if (!configured) return;
    let mounted = true;
    const handleAuthLink = async (url: string) => {
      if (!/^bondcheck:\/\/auth\/callback(?:[?#]|$)/.test(url)) return;
      const recovery = /(?:[?#&])type=recovery(?:&|$)/.test(url);
      setRecovering(recovery); setError(''); setBusy(true);
      try {
        const accepted = await api.acceptAuthLink(url);
        if (accepted && !accepted.recovery) await reload();
      } catch (failure) {
        if (mounted) {
          setRecovering(false);
          if (api.session) setAuthNotice('This email link could not be used. Your current account is still signed in.');
          else setError((failure as Error).message);
        }
      } finally { if (mounted) setBusy(false); }
    };
    const links = Linking.addEventListener('url', event => { void handleAuthLink(event.url); });
    api.onSession = async value => {
      if (mounted) setRecovering(value?.recovery === true);
      if (sessionOwner.current !== (value?.user.id ?? null)) {
        sessionOwner.current = value?.user.id ?? null;
        authorized.current = false;
        setSnapshot(null);
        latestSnapshot.current = null;
        setConnected(false);
        inFlight.current = null;
        flightId.current++;
      }
      if (value) {
        await Keychain.setGenericPassword('supabase', JSON.stringify(value), {
          service: SESSION_SERVICE,
        });
      } else {
        setSnapshot(null);
        latestSnapshot.current = null;
        setConnected(false);
        inFlight.current = null;
        flightId.current++;
        if (mounted) setSession(null);
        await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
        const keys = await AsyncStorage.getAllKeys();
        const cachedPortfolios = keys.filter(key => key.startsWith('bondcheck.cloud.cache.'));
        await Promise.all(cachedPortfolios.map(key => AsyncStorage.removeItem(key)));
      }
      if (mounted && api.session === value) setSession(value);
    };
    (async () => {
      try {
        const saved = await Keychain.getGenericPassword({
          service: SESSION_SERVICE,
        });
        if (saved && !api.session) {
          const value = JSON.parse(saved.password) as CloudSession;
          if (!value.user?.id || !value.refresh_token)
            throw new Error('Saved cloud session is invalid; sign in again');
          api.session = value;
          if (mounted) setRecovering(value.recovery === true);
          sessionOwner.current = value.user.id;
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
    Linking.getInitialURL().then(url => { if (url && mounted) void handleAuthLink(url); }).catch(() => {});
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && api.session && authorized.current) {
        api
          .invoke('heartbeat')
          .catch(() => undefined)
          .then(() => syncAndReload())
          .catch(failure => setError((failure as Error).message));
      }
    });
    return () => {
      mounted = false;
      api.onSession = null;
      subscription.remove();
      links.remove();
    };
  }, [api, configured, reload, syncAndReload]);

  useEffect(() => {
    if (!configured || !session || recovering) return;
    api
      .invoke('heartbeat')
      .catch(() => undefined)
      .then(() => syncAndReload())
      .catch(failure => setError((failure as Error).message));
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active' || !authorized.current) return;
      syncAndReload().catch(failure => setError((failure as Error).message));
    }, 30000);
    return () => clearInterval(timer);
  }, [api, configured, session?.user.id, recovering, syncAndReload]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async (email: string, password: string) => {
    setBusy(true);
    setError('');
    setAuthNotice('');
    try {
      await api.signIn(email, password);
      if (api.session) biometrics.passwordAuthenticated(api.session.user.id);
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
      setRecovering(false);
      setSigningOut(false);
    }
  };
  const resendConfirmation = async (email: string) => {
    setBusy(true); setError('');
    try { await api.resendConfirmation(email); }
    catch (failure) { setError((failure as Error).message); throw failure; }
    finally { setBusy(false); }
  };
  const sendPasswordReset = async (email: string) => {
    setBusy(true); setError('');
    try { await api.sendPasswordReset(email); }
    catch (failure) { setError((failure as Error).message); throw failure; }
    finally { setBusy(false); }
  };
  const verifyRecovery = async (email: string, token: string) => {
    setBusy(true); setError(''); setRecovering(true);
    try { await api.verifyRecovery(email, token); }
    catch (failure) { setRecovering(false); setError((failure as Error).message); throw failure; }
    finally { setBusy(false); }
  };
  const updatePassword = async (password: string) => {
    setBusy(true); setError('');
    try { await api.updatePassword(password); await api.signOut(); setRecovering(false); }
    catch (failure) { setError((failure as Error).message); throw failure; }
    finally { setBusy(false); }
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
    authNotice,
    reload,
    signIn,
    signUp,
    signOut,
    run,
    stale,
    complete,
    connected,
    recovering,
    resendConfirmation,
    sendPasswordReset,
    verifyRecovery,
    updatePassword,
    biometrics,
  };
}
