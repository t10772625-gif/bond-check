import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { fonts, useTheme } from '../theme';
import { useApp } from '../store/AppStore';

/** Animated pop + fade-up helper. */
function useAnim(delay: number, duration = 600) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, delay, duration]);
  return v;
}

export const FadeUp = ({
  delay,
  children,
}: {
  delay: number;
  children: React.ReactNode;
}) => {
  const v = useAnim(delay);
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [
          {
            translateY: v.interpolate({
              inputRange: [0, 1],
              outputRange: [14, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
};

export function Logo({
  size = 96,
  animated = true,
}: {
  size?: number;
  animated?: boolean;
}) {
  const v = useRef(new Animated.Value(animated ? 0 : 1)).current;
  useEffect(() => {
    if (animated)
      Animated.spring(v, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }).start();
  }, [v, animated]);
  return (
    <Animated.View
      style={[
        styles.logo,
        { width: size, height: size, borderRadius: size * 0.29 },
        {
          opacity: v,
          transform: [
            {
              scale: v.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 1],
              }),
            },
            {
              rotate: v.interpolate({
                inputRange: [0, 1],
                outputRange: ['-20deg', '0deg'],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={{ fontSize: size / 2 }}>🎟️</Text>
    </Animated.View>
  );
}

export default function SplashScreen() {
  const { c } = useTheme();
  const { automation } = useApp();
  const bar = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(bar, {
      toValue: 1,
      duration: 2100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [bar]);
  return (
    <View style={[styles.full, { backgroundColor: c.splash }]}>
      <Logo />
      <FadeUp delay={400}>
        <Text style={styles.title}>Bond Check</Text>
      </FadeUp>
      <FadeUp delay={700}>
        <Text style={{ color: '#fff', opacity: 0.85, fontSize: 16 }}>
          All your prize bonds, in one place
        </Text>
      </FadeUp>
      <View style={styles.bar}>
        <Animated.View
          style={{
            height: '100%',
            backgroundColor: '#f3d98b',
            width: bar.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          }}
        />
      </View>
      <FadeUp delay={1000}>
        <Text
          style={{ color: '#fff', opacity: 0.6, fontSize: 12, marginTop: 14 }}
        >
          {automation.configured
            ? 'Private account · Automatic draw checking'
            : 'Offline-first · Secure · Family sharing'}
        </Text>
      </FadeUp>
    </View>
  );
}

export const styles = StyleSheet.create({
  full: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    backgroundColor: '#e2b95a',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 20 },
  },
  title: {
    fontFamily: fonts.serif,
    fontWeight: '800',
    fontSize: 38,
    color: '#fff',
    marginTop: 18,
    marginBottom: 4,
    textAlign: 'center',
  },
  bar: {
    width: 180,
    height: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    marginTop: 26,
  },
});
