import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

const service = (owner: string) => `bondcheck.cloud.biometric.${owner}`;
const preference = (owner: string) => `bondcheck.cloud.biometric.enabled.${owner}`;
const prompt = { title: 'Unlock BondCheck', subtitle: 'Confirm with your phone fingerprint', cancel: 'Use password' };

export function useCloudBiometrics(owner: string | undefined) {
  const [enabled, setEnabled] = useState(false);
  const [readyOwner, setReadyOwner] = useState<string | undefined>();
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState('');
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const authenticatedOwner = useRef<string | undefined>(undefined);
  const passwordOwner = useRef<string | undefined>(undefined);
  const prompting = useRef(false);

  useEffect(() => {
    let active = true;
    setError('');
    setEnabled(false);
    setLocked(true);
    setReadyOwner(undefined);
    if (!owner) { authenticatedOwner.current = undefined; passwordOwner.current = undefined; return; }
    Promise.all([AsyncStorage.getItem(preference(owner)), Keychain.getSupportedBiometryType().catch(() => null)])
      .then(([saved, type]) => {
        if (!active) return;
        setAvailable(!!type);
        setEnabled(saved === 'true');
        setLocked(saved === 'true' && authenticatedOwner.current !== owner);
        setReadyOwner(owner);
      }).catch(() => {
        if (!active) return;
        if (passwordOwner.current === owner) { setLocked(false); setReadyOwner(owner); }
        // A failed preference read never exposes a restored portfolio.
        setError('Could not check device security. Log in with your password.');
      });
    return () => { active = false; };
  }, [owner]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state === 'background' && enabled) {
        authenticatedOwner.current = undefined;
        passwordOwner.current = undefined;
        setLocked(true);
      }
    });
    return () => listener.remove();
  }, [enabled]);

  const passwordAuthenticated = (id: string) => {
    authenticatedOwner.current = id;
    passwordOwner.current = id;
    if (currentOwner.current === id) setLocked(false);
  };
  const unlock = useCallback(async () => {
    if (!owner || prompting.current) return;
    prompting.current = true; setBusy(true); setError('');
    try {
      const result = await Keychain.getGenericPassword({ service: service(owner), accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET, authenticationPrompt: prompt });
      if (!result || result.username !== owner) throw new Error('Fingerprint access needs to be enabled again after password login.');
      if (currentOwner.current !== owner) return;
      authenticatedOwner.current = owner;
      setLocked(false);
    } catch {
      if (currentOwner.current === owner) setError('Fingerprint was not verified. Try again or use your account password.');
    } finally { prompting.current = false; setBusy(false); }
  }, [owner]);

  const changeEnabled = async (next: boolean) => {
    if (!owner || prompting.current) return;
    prompting.current = true; setBusy(true); setError('');
    try {
      if (next) {
        if (!await Keychain.getSupportedBiometryType()) throw new Error('Set up a fingerprint in your phone settings first.');
        const saved = await Keychain.setGenericPassword(owner, 'unlock-private-portfolio', {
          service: service(owner),
          accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          authenticationPrompt: prompt,
        });
        if (!saved) throw new Error('This phone could not enable fingerprint unlock.');
        const verified = await Keychain.getGenericPassword({ service: service(owner), accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET, authenticationPrompt: prompt });
        if (!verified || verified.username !== owner) throw new Error('Fingerprint was not verified.');
      } else if (passwordOwner.current !== owner) {
        const verified = await Keychain.getGenericPassword({ service: service(owner), accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET, authenticationPrompt: prompt });
        if (!verified || verified.username !== owner) throw new Error('Verify your fingerprint before turning it off.');
      }
      if (currentOwner.current !== owner) return;
      await AsyncStorage.setItem(preference(owner), String(next));
      if (!next) await Keychain.resetGenericPassword({ service: service(owner) });
      authenticatedOwner.current = owner;
      setEnabled(next); setLocked(false);
    } catch (failure) {
      setError((failure as Error).message || 'Fingerprint setup was cancelled.');
    } finally { prompting.current = false; setBusy(false); }
  };
  return { enabled, available, busy, error, ready: !owner || readyOwner === owner, locked, unlock, changeEnabled, passwordAuthenticated };
}
