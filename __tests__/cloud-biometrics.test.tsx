import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { useCloudBiometrics } from '../src/cloud/useCloudBiometrics';

jest.mock('react-native-keychain', () => ({
  ACCESS_CONTROL: { BIOMETRY_CURRENT_SET: 'BiometryCurrentSet' },
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly' },
  STORAGE_TYPE: { AES_GCM: 'KeystoreAESGCM' },
  getSupportedBiometryType: jest.fn().mockResolvedValue('Fingerprint'),
  getGenericPassword: jest.fn(),
  setGenericPassword: jest.fn().mockResolvedValue({}),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
}));

beforeEach(() => { jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() }); });
afterEach(() => { jest.restoreAllMocks(); });

test('restored accounts stay locked after cancellation and lock again on background', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('bondcheck.cloud.biometric.enabled.owner-a', 'true');
  let current!: ReturnType<typeof useCloudBiometrics>;
  const screen = ({ owner }: { owner: string }) => { current = useCloudBiometrics(owner); return null; };
  let stateChanged: ((state: AppStateStatus) => void) | undefined;
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    stateChanged = callback;
    return { remove: jest.fn() };
  });
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = ReactTestRenderer.create(React.createElement(screen, { owner: 'owner-a' })); });
    expect(current.ready).toBe(true);
    expect(current.locked).toBe(true);
    jest.mocked(Keychain.getGenericPassword).mockRejectedValueOnce(new Error('User cancelled'));
    await act(async () => { await current.unlock(); });
    expect(current.locked).toBe(true);
    jest.mocked(Keychain.getGenericPassword).mockResolvedValueOnce({ username: 'owner-a', password: 'marker', service: 'service', storage: Keychain.STORAGE_TYPE.AES_GCM });
    await act(async () => { await current.unlock(); });
    expect(current.locked).toBe(false);
    await act(async () => { stateChanged?.('background'); });
    expect(current.locked).toBe(true);
    await act(async () => { current.passwordAuthenticated('owner-b'); });
    expect(current.locked).toBe(true);
    await act(async () => { current.passwordAuthenticated('owner-a'); });
    expect(current.locked).toBe(false);
  } finally {
    await act(async () => renderer?.unmount());
    listener.mockRestore();
  }
});

test('a phone without usable biometric hardware still opens an account with fingerprint disabled', async () => {
  await AsyncStorage.clear();
  jest.mocked(Keychain.getSupportedBiometryType).mockRejectedValueOnce(new Error('Biometric hardware unavailable'));
  let current!: ReturnType<typeof useCloudBiometrics>;
  const screen = () => { current = useCloudBiometrics('no-biometric-owner'); return null; };
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = ReactTestRenderer.create(React.createElement(screen)); });
    expect(current.available).toBe(false);
    expect(current.ready).toBe(true);
    expect(current.locked).toBe(false);
  } finally { await act(async () => renderer?.unmount()); }
});

test('fresh server-password authentication can turn off an invalidated fingerprint key', async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('bondcheck.cloud.biometric.enabled.owner-a', 'true');
  let current!: ReturnType<typeof useCloudBiometrics>;
  const screen = () => { current = useCloudBiometrics('owner-a'); return null; };
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = ReactTestRenderer.create(React.createElement(screen)); });
    jest.mocked(Keychain.getGenericPassword).mockRejectedValueOnce(new Error('Key permanently invalidated'));
    await act(async () => { await current.unlock(); });
    expect(current.locked).toBe(true);
    await act(async () => { current.passwordAuthenticated('owner-a'); });
    await act(async () => { await current.changeEnabled(false); });
    expect(current.enabled).toBe(false);
    expect(current.locked).toBe(false);
    expect(await AsyncStorage.getItem('bondcheck.cloud.biometric.enabled.owner-a')).toBe('false');
  } finally { await act(async () => renderer?.unmount()); }
});
