/**
 * Fingerprint / biometric login.
 *
 * The account id and password are saved in the Android Keystore (AES-GCM),
 * locked behind the phone's own biometric check. Reading them back shows the
 * system fingerprint prompt; nothing is readable without a successful scan.
 */
import * as Keychain from 'react-native-keychain';

const SERVICE = 'bondcheck.biometric';

export type BioType = 'Fingerprint' | 'Face' | 'Iris' | 'Biometrics';
export type BioResult = { ok: true; id: string; pw: string } | { ok: false; reason: 'cancel' | 'none' | 'error'; message?: string };

/** Which biometric the phone can use right now (null = no hardware or nothing enrolled). */
export async function bioType(): Promise<BioType | null> {
  try {
    const t = await Keychain.getSupportedBiometryType();
    if (!t) return null;
    if (t === Keychain.BIOMETRY_TYPE.FINGERPRINT || t === Keychain.BIOMETRY_TYPE.TOUCH_ID) return 'Fingerprint';
    if (t === Keychain.BIOMETRY_TYPE.FACE || t === Keychain.BIOMETRY_TYPE.FACE_ID) return 'Face';
    if (t === Keychain.BIOMETRY_TYPE.IRIS) return 'Iris';
    return 'Biometrics';
  } catch {
    return null;
  }
}

const isCancel = (e: unknown) => /cancel|user canceled|negative|E_AUTHENTICATION_CANCEL|code: 1[03]\b/i.test(String((e as Error)?.message || e));

/** Save the login behind the fingerprint. Shows the system prompt. */
export async function bioSave(id: string, pw: string): Promise<{ ok: boolean; cancelled?: boolean; message?: string }> {
  try {
    await Keychain.resetGenericPassword({ service: SERVICE }).catch(() => {});
    const r = await Keychain.setGenericPassword(id, pw, {
      service: SERVICE,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
      storage: Keychain.STORAGE_TYPE.AES_GCM,
      securityLevel: Keychain.SECURITY_LEVEL.ANY,
      authenticationPrompt: {
        title: 'Turn on fingerprint login',
        subtitle: 'Bond Check',
        description: 'Scan your fingerprint to confirm it is you',
        cancel: 'Cancel',
      },
    });
    return { ok: !!r };
  } catch (e) {
    return { ok: false, cancelled: isCancel(e), message: String((e as Error)?.message || e) };
  }
}

/** Ask for the fingerprint and return the saved login. */
export async function bioLoad(): Promise<BioResult> {
  try {
    const r = await Keychain.getGenericPassword({
      service: SERVICE,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
      authenticationPrompt: {
        title: 'Log in to Bond Check',
        subtitle: 'Use your fingerprint',
        description: 'Touch the fingerprint sensor',
        cancel: 'Use password',
      },
    });
    if (!r) return { ok: false, reason: 'none' };
    return { ok: true, id: r.username, pw: r.password };
  } catch (e) {
    return { ok: false, reason: isCancel(e) ? 'cancel' : 'error', message: String((e as Error)?.message || e) };
  }
}

export async function bioClear() {
  try {
    await Keychain.resetGenericPassword({ service: SERVICE });
  } catch {
    // nothing saved
  }
}
