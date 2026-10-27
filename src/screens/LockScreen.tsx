import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../store/AppStore';
import { fonts, useTheme } from '../theme';
import { firstName } from '../utils';
import { Logo } from './SplashScreen';

/** Big pulsing fingerprint button. */
export function FingerButton({ onPress, busy, label }: { onPress: () => void; busy: boolean; label: string }) {
  const { c } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [pulse]);
  return (
    <Pressable onPress={onPress} disabled={busy} style={{ alignItems: 'center' }} hitSlop={10}>
      <Animated.View
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: c.grnbg,
          borderWidth: 2,
          borderColor: c.em,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: busy ? 0.6 : 1,
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }],
        }}>
        <Text style={{ fontSize: 46 }}>👆</Text>
      </Animated.View>
      <Text style={{ color: c.em, fontWeight: '700', fontSize: 15, marginTop: 10 }}>{busy ? 'Waiting for fingerprint…' : label}</Text>
    </Pressable>
  );
}

export default function LockScreen() {
  const { db, bioLogin, bioBusy, unlockWithPassword, bioName } = useApp();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const u = db.users.find(x => x.id === db.sess);
  const tried = useRef(false);

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const t = setTimeout(() => bioLogin(db.sess || undefined), 400);
    return () => clearTimeout(t);
  }, [bioLogin, db.sess]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, alignItems: 'center' }}>
      <Logo size={72} />
      <Text style={{ fontFamily: fonts.serif, fontWeight: '800', fontSize: 26, color: c.ink, marginTop: 16 }}>
        Welcome back{u ? ', ' + firstName(u.name) : ''}
      </Text>
      <Text style={{ color: c.mut, fontSize: 14, marginTop: 4, textAlign: 'center' }}>{u ? u.id : ''}</Text>
      <Text style={{ color: c.mut, fontSize: 13, marginTop: 6, textAlign: 'center' }}>Bond Check is locked. Unlock with your {bioName()}.</Text>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <FingerButton onPress={() => bioLogin(db.sess || undefined)} busy={bioBusy} label={`Tap to unlock with ${bioName()}`} />
      </View>
      <Pressable onPress={unlockWithPassword} hitSlop={10} style={{ padding: 12 }}>
        <Text style={{ color: c.em, fontWeight: '700', fontSize: 15 }}>Use password instead</Text>
      </Pressable>
    </View>
  );
}
