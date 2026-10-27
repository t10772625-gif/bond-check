import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';
import {
  KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput,
  TextInputProps, TextProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../store/AppStore';
import type { BadgeKind } from '../store/AppStore';
import { fonts, useTheme } from '../theme';
import { MONTHS_LONG, fd, today } from '../utils';

/* ---------- Text (supports "Large text" setting) ---------- */
export function Txt({ style, ...rest }: TextProps & { style?: StyleProp<TextStyle> }) {
  const { big } = useApp();
  const { c } = useTheme();
  const flat = StyleSheet.flatten([{ color: c.ink, fontSize: 16 }, style]) as TextStyle;
  const fs = flat.fontSize ?? 16;
  return <Text {...rest} style={big ? [flat, { fontSize: Math.round(fs * 1.125) }] : flat} />;
}

export const H2 = ({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) => {
  const { s } = useTheme();
  return <Txt style={[s.h2, style]}>{children}</Txt>;
};

export const DH = ({ children }: { children: React.ReactNode }) => {
  const { s } = useTheme();
  return <Txt style={s.dh}>{children}</Txt>;
};

export const Note = ({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) => {
  const { s } = useTheme();
  return <Txt style={[s.note, style]}>{children}</Txt>;
};

export const Label = ({ children }: { children: React.ReactNode }) => {
  const { s } = useTheme();
  return <Txt style={s.label}>{children}</Txt>;
};

export const Row = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => {
  const { s } = useTheme();
  return <View style={[s.row, style]}>{children}</View>;
};

/* ---------- Button ---------- */
type BtnVariant = 'primary' | 'alt' | 'red';
export function Btn({
  title, onPress, variant = 'primary', sm, style, flexNone,
}: {
  title: string;
  onPress: () => void;
  variant?: BtnVariant;
  sm?: boolean;
  style?: StyleProp<ViewStyle>;
  flexNone?: boolean;
}) {
  const { c } = useTheme();
  const bg = variant === 'primary' ? c.em : variant === 'red' ? c.red : c.surf;
  const fg = variant === 'alt' ? c.em : '#fff';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.75 : 1,
        },
        variant === 'alt' && { borderWidth: 1.5, borderColor: c.em },
        sm
          ? { paddingVertical: 8, paddingHorizontal: 12, flex: flexNone ? undefined : 1 }
          : { paddingVertical: 14, marginTop: 8, alignSelf: 'stretch' },
        style,
      ]}>
      <Txt style={{ color: fg, fontWeight: '700', fontSize: sm ? 13 : 16, textAlign: 'center' }}>{title}</Txt>
    </Pressable>
  );
}

/* ---------- Input ---------- */
export function Input({ style, mono, upper, ...rest }: TextInputProps & { mono?: boolean; upper?: boolean }) {
  {
    const { c, s } = useTheme();
    const { big } = useApp();
    const [focus, setFocus] = useState(false);
    return (
      <TextInput
        placeholderTextColor={c.mut}
        autoCapitalize={upper ? 'characters' : rest.autoCapitalize}
        {...rest}
        onFocus={e => {
          setFocus(true);
          rest.onFocus?.(e);
        }}
        onBlur={e => {
          setFocus(false);
          rest.onBlur?.(e);
        }}
        style={[
          s.input,
          big && { fontSize: 18 },
          focus && { borderColor: c.em2 },
          mono && { fontFamily: fonts.mono, letterSpacing: 1 },
          rest.multiline && { textAlignVertical: 'top', minHeight: 44 + ((rest.numberOfLines || 3) - 1) * 20 },
          style,
        ]}
      />
    );
  }
}

/* ---------- Segmented control ---------- */
export function Seg<K extends string>({
  options, value, onChange,
}: {
  options: [K, string][];
  value: K;
  onChange: (k: K) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.grey, borderRadius: 12, padding: 3, marginVertical: 6 }}>
      {options.map(([k, l]) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            style={[
              { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
              on && { backgroundColor: c.surf, elevation: 2, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
            ]}>
            <Txt numberOfLines={1} style={{ fontWeight: '600', fontSize: 13, color: on ? c.em : c.mut }}>
              {l}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- Filter chips ---------- */
export function Chips<K extends string>({
  options, value, onChange,
}: {
  options: [K, string][];
  value: K;
  onChange: (k: K) => void;
}) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8, flexGrow: 0 }} contentContainerStyle={{ gap: 6 }}>
      {options.map(([k, l]) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            style={{
              borderWidth: 1,
              borderColor: on ? c.em : c.line,
              backgroundColor: on ? c.em : c.surf,
              paddingVertical: 7,
              paddingHorizontal: 14,
              borderRadius: 99,
            }}>
            <Txt style={{ fontWeight: '600', fontSize: 13, color: on ? '#fff' : c.ink }}>{l}</Txt>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ---------- Badge ---------- */
export function Badge({ text, kind = '', onPress }: { text: string; kind?: BadgeKind; onPress?: () => void }) {
  const { c } = useTheme();
  const map = { '': [c.grey, c.mut], w: [c.grnbg, c.grn], n: [c.redbg, c.red], g: [c.yel, c.gold] } as const;
  const [bg, fg] = map[kind];
  const body = (
    <View style={{ backgroundColor: bg, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 99, alignSelf: 'flex-start' }}>
      <Txt numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: fg }}>
        {text}
      </Txt>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} hitSlop={6}>{body}</Pressable> : body;
}

/* ---------- Result box ---------- */
export type ResKind = 'g' | 'r' | 'y' | 'k';
export function Res({ kind, children, style }: { kind: ResKind; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const map = { g: [c.grnbg, c.grn], r: [c.redbg, c.red], y: [c.yel, c.gold], k: [c.grey, c.mut] } as const;
  const [bg, fg] = map[kind];
  return (
    <View style={[{ backgroundColor: bg, borderRadius: 16, padding: 12, marginVertical: 6 }, style]}>
      {typeof children === 'string' ? <Txt style={{ color: fg, fontWeight: '600', fontSize: 14 }}>{children}</Txt> : children}
    </View>
  );
}

export function useResColor(kind: ResKind) {
  const { c } = useTheme();
  return { g: c.grn, r: c.red, y: c.gold, k: c.mut }[kind];
}

/* ---------- Alert banner ---------- */
export function Banner({
  text, onPress, bg, fg,
}: {
  text: string;
  onPress?: () => void;
  bg?: string;
  fg?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: bg || c.grnbg,
        borderRadius: 16,
        padding: 12,
        marginVertical: 10,
        opacity: pressed ? 0.8 : 1,
      })}>
      <Txt style={{ color: fg || c.grn, fontWeight: '700', fontSize: 14 }}>{text}</Txt>
    </Pressable>
  );
}

/* ---------- Bond list row ---------- */
export function BondRow({
  title, sub, right, onPress,
}: {
  title: string;
  sub: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, opacity: pressed && onPress ? 0.7 : 1 },
      ]}>
      <View style={{ flex: 1 }}>
        <Txt style={s.mono}>{title}</Txt>
        <Txt style={{ fontSize: 12, color: c.mut }}>{sub}</Txt>
      </View>
      {right}
    </Pressable>
  );
}

/* ---------- Key / value row ---------- */
export function KV({ k, v }: { k: string; v: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <Txt style={{ color: c.mut, fontSize: 14 }}>{k}</Txt>
      <Txt style={{ fontWeight: '600', fontSize: 14, textAlign: 'right', flexShrink: 1 }}>{v}</Txt>
    </View>
  );
}

/* ---------- Stat cards ---------- */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }}>{children}</View>;
}

export function Stat({ label, value, sub, hero }: { label: string; value: string | number; sub?: string; hero?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        { borderRadius: 16, padding: 12, flexBasis: '47%', flexGrow: 1 },
        hero ? { backgroundColor: c.hero, flexBasis: '100%' } : { backgroundColor: c.surf, borderWidth: 1, borderColor: c.line },
      ]}>
      <Txt style={{ fontSize: 11, color: hero ? '#cfe8da' : c.mut, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Txt>
      <Txt style={{ fontFamily: fonts.serif, fontWeight: '800', fontSize: hero ? 30 : 18, color: hero ? '#fff' : c.em }}>{String(value)}</Txt>
      {sub ? <Txt style={{ fontSize: 11, color: hero ? '#cfe8da' : c.mut }}>{sub}</Txt> : null}
    </View>
  );
}

/* ---------- Checkbox ---------- */
export function Check({ value, onChange, size = 22 }: { value: boolean; onChange: (v: boolean) => void; size?: number }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: value ? c.em : c.mut,
        backgroundColor: value ? c.em : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {value ? <Text style={{ color: '#fff', fontSize: size * 0.65, fontWeight: '900', lineHeight: size * 0.85 }}>✓</Text> : null}
    </Pressable>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ text, color }: { text: string; color?: string }) {
  const { s } = useTheme();
  return (
    <View style={[s.av, color ? { backgroundColor: color } : null]}>
      <Text style={s.avText}>{text}</Text>
    </View>
  );
}

/* ---------- Bottom sheet modal ---------- */
export function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  // Mount the Modal only while open: re-showing a kept-mounted Modal can stay invisible on Android.
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={backAfterKeyboard(onClose)} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: c.backdrop, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '90%' }}>
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.line }} />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 22 + insets.bottom }}>
              {children}
            </ScrollView>
          </View>
        </View>
        <ToastView top={insets.top + 12} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------- Select (dropdown in a modal) ---------- */
export function Select<T extends string | number>({
  value, options, onChange, style,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, s } = useTheme();
  const [open, setOpen] = useState(false);
  const cur = options.find(o => o.value === value);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[s.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, style]}>
        <Txt numberOfLines={1} style={{ flex: 1 }}>{cur ? cur.label : '—'}</Txt>
        <Txt style={{ color: c.mut, fontSize: 12 }}>▼</Txt>
      </Pressable>
      {open ? (
      <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: c.backdrop, justifyContent: 'center', padding: 24 }} onPress={() => setOpen(false)}>
          <View style={{ backgroundColor: c.surf, borderRadius: 18, paddingVertical: 8, maxHeight: '70%' }}>
            <ScrollView>
              {options.map(o => {
                const on = o.value === value;
                return (
                  <Pressable
                    key={String(o.value)}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 18, backgroundColor: pressed ? c.grey : 'transparent', flexDirection: 'row', justifyContent: 'space-between' })}>
                    <Txt style={{ fontWeight: on ? '700' : '400', color: on ? c.em : c.ink }}>{o.label}</Txt>
                    {on ? <Txt style={{ color: c.em }}>✓</Txt> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
      ) : null}
    </>
  );
}

/* ---------- Date input with calendar ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
export function DateInput({
  value, onChange, placeholder = 'Select date', allowEmpty = true, style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, s } = useTheme();
  const [open, setOpen] = useState(false);
  const base = value || today();
  const [y, setY] = useState(+base.slice(0, 4));
  const [m, setM] = useState(+base.slice(5, 7) - 1);

  useEffect(() => {
    if (open) {
      const b = value || today();
      setY(+b.slice(0, 4));
      setM(+b.slice(5, 7) - 1);
    }
  }, [open, value]);

  const cells = useMemo(() => {
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const arr: (number | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) arr.push(d);
    while (arr.length % 7) arr.push(null);
    return arr;
  }, [y, m]);

  const move = (dm: number) => {
    let nm = m + dm;
    let ny = y;
    while (nm < 0) { nm += 12; ny--; }
    while (nm > 11) { nm -= 12; ny++; }
    setM(nm);
    setY(ny);
  };
  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };
  const t = today();

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[s.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, style]}>
        <Txt numberOfLines={1} style={{ flex: 1, color: value ? c.ink : c.mut }}>{value ? fd(value) : placeholder}</Txt>
        <Txt style={{ fontSize: 14 }}>📅</Txt>
      </Pressable>
      {open ? (
      <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: c.backdrop, justifyContent: 'center', padding: 20 }} onPress={() => setOpen(false)}>
          <Pressable style={{ backgroundColor: c.surf, borderRadius: 20, padding: 14 }} onPress={() => {}}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <NavBtn label="«" onPress={() => move(-12)} />
              <NavBtn label="‹" onPress={() => move(-1)} />
              <Txt style={{ fontWeight: '700', fontFamily: fonts.serif, fontSize: 17, flex: 1, textAlign: 'center' }}>
                {MONTHS_LONG[m]} {y}
              </Txt>
              <NavBtn label="›" onPress={() => move(1)} />
              <NavBtn label="»" onPress={() => move(12)} />
            </View>
            <View style={{ flexDirection: 'row' }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <Txt key={i} style={{ flex: 1, textAlign: 'center', color: c.mut, fontSize: 12, fontWeight: '700', paddingVertical: 4 }}>{d}</Txt>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.map((d, i) => {
                const iso = d ? `${y}-${pad(m + 1)}-${pad(d)}` : '';
                const sel = iso && iso === value;
                const isT = iso === t;
                return (
                  <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                    {d ? (
                      <Pressable
                        onPress={() => pick(iso)}
                        style={{
                          flex: 1,
                          borderRadius: 99,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: sel ? c.em : 'transparent',
                          borderWidth: isT && !sel ? 1.5 : 0,
                          borderColor: c.em,
                        }}>
                        <Txt style={{ fontSize: 14, color: sel ? '#fff' : c.ink, fontWeight: sel || isT ? '700' : '400' }}>{d}</Txt>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {allowEmpty ? <Btn sm variant="alt" title="Clear" onPress={() => pick('')} /> : null}
              <Btn sm variant="alt" title="Today" onPress={() => pick(t)} />
              <Btn sm title="Close" onPress={() => setOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      ) : null}
    </>
  );
}

function NavBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={6} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.grey }}>
      <Txt style={{ fontSize: 18, fontWeight: '700', color: c.em }}>{label}</Txt>
    </Pressable>
  );
}

/* ---------- Toast ---------- */
export function ToastView({ bottom, top }: { bottom?: number; top?: number }) {
  const { toastState, setToastState } = useApp();
  const { c } = useTheme();
  useEffect(() => {
    if (!toastState) return;
    const id = toastState.id;
    const t = setTimeout(() => setToastState(cur => (cur && cur.id === id ? null : cur)), toastState.action ? 6000 : 2400);
    return () => clearTimeout(t);
  }, [toastState, setToastState]);
  if (!toastState) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[{ position: 'absolute', left: 16, right: 16, zIndex: 100, elevation: 20 }, top != null ? { top } : { bottom }]}>
      <View style={{ backgroundColor: c.ink, borderRadius: 14, padding: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
        <Txt style={{ color: c.bg, fontWeight: '600', textAlign: 'center', fontSize: 15 }}>{toastState.text}</Txt>
        {toastState.action ? (
          <Pressable
            hitSlop={10}
            onPress={() => {
              const fn = toastState.fn;
              setToastState(null);
              fn?.();
            }}>
            <Txt style={{ color: c.bg, fontWeight: '800', marginLeft: 12, textDecorationLine: 'underline', fontSize: 15 }}>{toastState.action}</Txt>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ---------- Search bar (used on every list) ---------- */
export function SearchBar({
  value, onChange, placeholder = 'Search', style, count,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  count?: string;
}) {
  const { c, s } = useTheme();
  const { big } = useApp();
  return (
    <View style={[{ marginVertical: 6 }, style]}>
      <View style={[s.input, { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingHorizontal: 10 }]}>
        <Text style={{ fontSize: 15, marginRight: 6 }}>🔍</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={c.mut}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={{ flex: 1, color: c.ink, fontSize: big ? 18 : 16, paddingVertical: 10 }}
        />
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={10} style={{ padding: 4 }}>
            <Text style={{ color: c.mut, fontSize: 16, fontWeight: '700' }}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      {count ? <Txt style={{ fontSize: 11, color: c.mut, marginTop: 3, marginLeft: 4 }}>{count}</Txt> : null}
    </View>
  );
}

/** Simple text match helper for search boxes: matches the raw text or the bond-number form (e.g. "bd 123-4" → "BD1234"). */
export function matches(query: string, ...fields: (string | number | undefined | null)[]) {
  const t = query.trim().toLowerCase();
  if (!t) return true;
  const n = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return fields.some(f => {
    if (f == null) return false;
    const v = String(f);
    return v.toLowerCase().includes(t) || (!!n && v.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(n));
  });
}

/* ---------- Full-screen modal (lists, preview) ---------- */
export function FullModal({
  visible, onClose, title, subtitle, children, footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { open: kb, h: kbH } = useKeyboard();
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={backAfterKeyboard(onClose)} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.bg }}>
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
            backgroundColor: c.surf,
          }}>
          <Pressable onPress={onClose} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.grey, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, color: c.em, fontWeight: '700' }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Txt style={{ fontFamily: fonts.serif, fontWeight: '700', fontSize: 19 }} numberOfLines={1}>
              {title}
            </Txt>
            {subtitle ? (
              <Txt style={{ fontSize: 12, color: c.mut }} numberOfLines={2}>
                {subtitle}
              </Txt>
            ) : null}
          </View>
        </View>
        <View style={{ flex: 1 }}>{children}</View>
        {footer && !kb ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surf }}>
            {footer}
          </View>
        ) : null}
        <ToastView bottom={kb ? kbH + 12 : (footer ? 150 : 24) + insets.bottom} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** useState that also tells the open sheet it has unsaved edits. */
export function useField<T>(init: T): [T, (v: T) => void] {
  const { markDirty } = useApp();
  const [v, setV] = useState(init);
  return [
    v,
    (nv: T) => {
      markDirty();
      setV(nv);
    },
  ];
}

/* ---------- Themed confirm dialog (instead of the plain Android alert) ---------- */
export function DialogHost() {
  const { dialog, setDialog } = useApp();
  const { c } = useTheme();
  if (!dialog) return null;
  const close = () => setDialog(null);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: c.backdrop, justifyContent: 'center', padding: 24 }} onPress={close}>
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: c.bg,
            borderRadius: 24,
            padding: 20,
            borderWidth: 1,
            borderColor: c.line,
            elevation: 16,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
          }}>
          {dialog.icon ? (
            <View style={{ alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: c.grey, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 28 }}>{dialog.icon}</Text>
            </View>
          ) : null}
          <Txt style={{ fontFamily: fonts.serif, fontWeight: '700', fontSize: 21, textAlign: 'center' }}>{dialog.title}</Txt>
          {dialog.message ? <Txt style={{ color: c.mut, fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>{dialog.message}</Txt> : null}
          {dialog.rows?.length ? (
            <View style={{ backgroundColor: c.surf, borderRadius: 14, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 4, marginTop: 12 }}>
              {dialog.rows.map(([k, v], i) => (
                <View
                  key={k + i}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7, borderBottomWidth: i === dialog.rows!.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                  <Txt style={{ color: c.mut, fontSize: 13 }}>{k}</Txt>
                  <Txt style={{ fontWeight: '700', fontSize: 13, textAlign: 'right', flexShrink: 1 }}>{v}</Txt>
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ marginTop: 8 }}>
            {dialog.buttons.map((b, i) => (
              <Btn
                key={b.text + i}
                title={b.text}
                variant={b.style === 'red' ? 'red' : b.style === 'alt' ? 'alt' : 'primary'}
                onPress={() => {
                  close();
                  b.onPress?.();
                }}
              />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Keyboard state shared by every screen: open, height, and when it was last closed. */
let kbLastHide = 0;
let kbOpenNow = false;
Keyboard.addListener('keyboardDidHide', () => {
  kbLastHide = Date.now();
  kbOpenNow = false;
});
Keyboard.addListener('keyboardDidShow', () => {
  kbOpenNow = true;
});

/**
 * Wraps a modal's back/close handler so the back press that closes the keyboard
 * does not also close the modal (Android can deliver both).
 */
export const backAfterKeyboard = (fn: () => void) => () => {
  if (kbOpenNow) {
    Keyboard.dismiss();
    return;
  }
  if (Date.now() - kbLastHide < 350) return;
  fn();
};

/** True while the on-screen keyboard is open. */
export function useKeyboardOpen() {
  return useKeyboard().open;
}

export function useKeyboard() {
  const [st, setSt] = useState({ open: false, h: 0 });
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', e => setSt({ open: true, h: e.endCoordinates.height }));
    const b = Keyboard.addListener('keyboardDidHide', () => setSt({ open: false, h: 0 }));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return st;
}
