import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Btn, H2, Note, Res } from '../components/ui';
import { useApp } from '../store/AppStore';
import { AuthShell } from '../screens/AuthScreen';
import { Logo } from '../screens/SplashScreen';

export function CloudLockScreen() {
  const { automation } = useApp();
  const bio = automation.biometrics;
  const { ready, unlock } = bio;
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => { void unlock(); }, 350);
    return () => clearTimeout(timer);
  }, [ready, unlock]);
  return <AuthShell>
    <View style={{ alignItems: 'center', marginVertical: 32 }}><Logo size={72} animated={false} /><H2 style={{ marginTop: 20 }}>BondCheck is locked</H2><Note>Use your phone fingerprint to open your private account.</Note></View>
    {bio.error ? <Res kind="y">{bio.error}</Res> : null}
    <Btn title={bio.busy ? 'Waiting for fingerprint…' : 'Unlock with fingerprint'} disabled={bio.busy || !bio.ready} onPress={() => { void bio.unlock(); }} />
    <Btn variant="alt" title="Use account password" onPress={() => { void automation.signOut(); }} />
  </AuthShell>;
}
