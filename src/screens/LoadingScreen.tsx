import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { useApp } from '../store/AppStore';
import { fonts, useTheme } from '../theme';
import { firstName } from '../utils';
import { styles } from './SplashScreen';

export function Spinner() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [spin]);
  return (
    <Animated.View
      style={{
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 5,
        borderColor: 'rgba(255,255,255,0.2)',
        borderTopColor: '#f3d98b',
        transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
      }}
    />
  );
}

const STEPS = ['Verifying your account', 'Loading your workspaces', 'Syncing draw results', 'Calculating your winnings'];

export default function LoadingScreen() {
  const { loadingInfo } = useApp();
  const { c } = useTheme();
  const [on, setOn] = useState(-1);
  useEffect(() => {
    const ts = STEPS.map((_, i) => setTimeout(() => setOn(i), 350 + i * 480));
    return () => ts.forEach(clearTimeout);
  }, []);
  const { name, wsCount, joined } = loadingInfo;
  return (
    <View style={[styles.full, { backgroundColor: c.splash }]}>
      <Spinner />
      <Text style={{ fontFamily: fonts.serif, fontWeight: '700', fontSize: 24, color: '#fff', marginTop: 20, marginBottom: 4 }}>
        Hello, {firstName(name)}!
      </Text>
      <Text style={{ color: '#fff', opacity: 0.8, fontSize: 13 }}>
        {wsCount} workspace{wsCount > 1 ? 's' : ''}
        {joined ? ' · joining ' + joined : ''}
      </Text>
      <View style={{ marginTop: 14 }}>
        {STEPS.map((s, i) => (
          <Text key={s} style={{ color: '#fff', opacity: i <= on ? 1 : 0.3, fontSize: 14, marginVertical: 6 }}>
            ✓ {s}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function LogoutScreen() {
  const { c } = useTheme();
  return (
    <View style={[styles.full, { backgroundColor: c.splash }]}>
      <Spinner />
      <Text style={{ color: '#fff', marginTop: 16, fontSize: 16 }}>Logging out…</Text>
    </View>
  );
}
