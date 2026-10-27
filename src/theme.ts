import { useMemo } from 'react';
import { Platform, StyleSheet, useColorScheme } from 'react-native';

export const light = {
  bg: '#f6f2e8',
  surf: '#fffdf7',
  ink: '#14231c',
  mut: '#5c6b62',
  line: '#e3dccb',
  em: '#0b6b4a',
  em2: '#0f8a60',
  gold: '#b07d14',
  red: '#c2453a',
  redbg: '#fbe6e3',
  grn: '#1f8a52',
  grnbg: '#def3e6',
  yel: '#fff1c7',
  grey: '#ece8dc',
  hero: '#0b6b4a',
  splash: '#0b6b4a',
  backdrop: 'rgba(0,0,0,0.5)',
};

export type Colors = typeof light;

export const dark: Colors = {
  bg: '#0c1511',
  surf: '#14211a',
  ink: '#f1ecdd',
  mut: '#9db1a5',
  line: '#27382e',
  em: '#3ccf94',
  em2: '#2aa877',
  gold: '#e5b44c',
  red: '#ff8a7d',
  redbg: '#3a1d1a',
  grn: '#5fe09a',
  grnbg: '#12331f',
  yel: '#3b3212',
  grey: '#1d2b23',
  hero: '#0b6b4a',
  splash: '#07382a',
  backdrop: 'rgba(0,0,0,0.6)',
};

export const fonts = {
  serif: Platform.select({ ios: 'Georgia', default: 'serif' }),
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    h2: { fontFamily: fonts.serif, fontWeight: '700', fontSize: 22, color: c.ink, marginTop: 6, marginBottom: 10 },
    dh: { fontFamily: fonts.serif, fontWeight: '700', fontSize: 15, color: c.gold, marginTop: 16, marginBottom: 4 },
    note: { fontSize: 12, color: c.mut, marginVertical: 6, marginHorizontal: 2 },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: c.mut,
      marginTop: 10,
      marginBottom: 4,
      marginHorizontal: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    input: {
      fontSize: 16,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.line,
      backgroundColor: c.surf,
      color: c.ink,
    },
    row: { flexDirection: 'row', gap: 8, marginVertical: 8 },
    card: {
      backgroundColor: c.surf,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginVertical: 6,
    },
    mono: { fontFamily: fonts.mono, fontWeight: '700', fontSize: 16, letterSpacing: 0.6, color: c.ink },
    small: { fontSize: 12, color: c.mut },
    mem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.line,
    },
    av: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.em,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  });

export type Styles = ReturnType<typeof makeStyles>;

const lightStyles = makeStyles(light);
const darkStyles = makeStyles(dark);

export function useTheme() {
  const scheme = useColorScheme();
  return useMemo(() => {
    const isDark = scheme === 'dark';
    return { c: isDark ? dark : light, s: isDark ? darkStyles : lightStyles, isDark };
  }, [scheme]);
}
