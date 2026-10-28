/**
 * Bond Check — Prize Bond Manager
 * React Native + TypeScript port of the HTML prototype.
 */
import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { DialogHost, ToastView, Txt } from './src/components/ui';
import AddScreen from './src/screens/AddScreen';
import AuthScreen from './src/screens/AuthScreen';
import CheckScreen from './src/screens/CheckScreen';
import HomeScreen from './src/screens/HomeScreen';
import LoadingScreen, { LogoutScreen } from './src/screens/LoadingScreen';
import ResultsScreen from './src/screens/ResultsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SplashScreen from './src/screens/SplashScreen';
import LockScreen from './src/screens/LockScreen';
import SheetHost from './src/sheets/Sheets';
import PreviewModal from './src/screens/PreviewModal';
import { CloudLockScreen } from './src/cloud/CloudLockScreen';
import { AppProvider, useApp } from './src/store/AppStore';
import { useTheme } from './src/theme';
import type { Tab } from './src/types';
import {
  CloudLoginScreen,
  CloudSettingsScreen,
  DrawStatusScreen,
} from './src/cloud/CloudScreens';

const NAV: [Tab, string, string][] = [
  ['home', '⌂', 'Home'],
  ['add', '＋', 'Add'],
  ['check', '✓', 'Check'],
  ['results', '★', 'Results'],
  ['set', '⚙', 'Settings'],
];

function BottomNav() {
  const { tab, setTab } = useApp();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [kb, setKb] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setKb(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKb(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  // Hide the tab bar while typing so it never covers inputs.
  if (kb && Platform.OS === 'android') return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: c.surf,
        borderTopWidth: 1,
        borderTopColor: c.line,
        paddingTop: 6,
        paddingBottom: 8 + insets.bottom,
        paddingHorizontal: 4,
      }}
    >
      {NAV.map(([k, icon, label]) => {
        const on = tab === k;
        const chk = k === 'check';
        return (
          <Pressable
            key={k}
            onPress={() => setTab(k)}
            style={{
              flex: 1,
              alignItems: 'center',
              gap: 2,
              paddingVertical: 4,
            }}
          >
            {chk ? (
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: c.em,
                  borderWidth: 4,
                  borderColor: c.bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: -26,
                  elevation: 6,
                  shadowColor: '#0b6b4a',
                  shadowOpacity: 0.4,
                  shadowRadius: 7,
                  shadowOffset: { width: 0, height: 6 },
                }}
              >
                <Text
                  style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}
                >
                  {icon}
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 20, color: on ? c.em : c.mut }}>
                {icon}
              </Text>
            )}
            <Txt
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: on ? c.em : c.mut,
              }}
            >
              {label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function MainApp() {
  const { tab, setTab, sheet, previewOpen, automation } = useApp();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  // Android back button: go to Home first, then exit. Modals handle their own back press.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet || previewOpen) return false;
      if (tab !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [tab, sheet, previewOpen, setTab]);

  const Screen = automation.configured
    ? {
        home: HomeScreen,
        add: AddScreen,
        check: DrawStatusScreen,
        results: ResultsScreen,
        set: CloudSettingsScreen,
      }[tab]
    : {
        home: HomeScreen,
        add: AddScreen,
        check: CheckScreen,
        results: ResultsScreen,
        set: SettingsScreen,
      }[tab];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Screen />
      </KeyboardAvoidingView>
      <BottomNav />
      {/* solid strip so scrolled content never shows under the clock/battery */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top,
          backgroundColor: c.bg,
        }}
      />
      <PreviewModal />
    </View>
  );
}

function Root() {
  const { phase, automation } = useApp();
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [cloudSplash, setCloudSplash] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setCloudSplash(false), 2400);
    return () => clearTimeout(timer);
  }, []);
  const cloudLoading = !automation.loaded;
  const cloudPrivateLocked = automation.configured && !!automation.session && !automation.recovering && (!automation.biometrics.ready || automation.biometrics.locked);
  const darkBar =
    (automation.configured &&
      (cloudSplash || cloudLoading || automation.signingOut)) ||
    phase === 'splash' ||
    phase === 'loading' ||
    phase === 'logout' ||
    isDark;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar barStyle={darkBar ? 'light-content' : 'dark-content'} />
      {automation.configured ? (
        cloudSplash ? (
          <SplashScreen />
        ) : automation.signingOut ? (
          <LogoutScreen />
        ) : cloudLoading ? (
          <LoadingScreen />
        ) : automation.recovering || !automation.session || !automation.snapshot ? (
          <CloudLoginScreen />
        ) : !automation.biometrics.ready || automation.biometrics.locked ? (
          <CloudLockScreen />
        ) : (
          <MainApp />
        )
      ) : (
        <>
          {phase === 'splash' ? <SplashScreen /> : null}
          {phase === 'auth' ? <AuthScreen /> : null}
          {phase === 'locked' ? <LockScreen /> : null}
          {phase === 'loading' ? <LoadingScreen /> : null}
          {phase === 'logout' ? <LogoutScreen /> : null}
          {phase === 'app' ? <MainApp /> : null}
        </>
      )}
      {(!automation.configured || (automation.session && automation.biometrics.ready && !automation.biometrics.locked && !automation.recovering)) ? <SheetHost /> : null}
      {!cloudPrivateLocked ? <><ToastView bottom={(phase === 'app' ? 90 : 24) + insets.bottom} /><DialogHost /></> : null}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}
