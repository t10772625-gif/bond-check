import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, H2, Input, Label, Note, Seg, Txt } from '../components/ui';
import { useApp, validLoginId } from '../store/AppStore';
import { useTheme } from '../theme';
import { Logo } from './SplashScreen';
import { FingerButton } from './LockScreen';

/** Ask for the fingerprint automatically only once per app launch. */
let autoBioDone = false;

/* ---------- Password field with show/hide ---------- */
export function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const { c } = useTheme();
  return (
    <View style={{ justifyContent: 'center' }}>
      <Input
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || 'At least 6 characters'}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ paddingRight: 48 }}
      />
      <Pressable
        onPress={() => setShow(!show)}
        accessibilityRole="button"
        accessibilityLabel={show ? 'Hide password' : 'Show password'}
        accessibilityState={{ expanded: show }}
        hitSlop={10}
        style={{ position: 'absolute', right: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ width: 22, height: 14, borderRadius: 12, borderWidth: 1.7, borderColor: c.mut, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.mut }} />
        </View>
        {!show ? <View style={{ position: 'absolute', width: 26, height: 2, backgroundColor: c.mut, transform: [{ rotate: '-40deg' }] }} /> : null}
      </Pressable>
    </View>
  );
}

/** Live checklist under a new password. */
export function Rules({ pw, pw2 }: { pw: string; pw2?: string }) {
  const { c } = useTheme();
  const items: [boolean, string][] = [
    [pw.length >= 6, 'At least 6 characters'],
  ];
  if (pw2 !== undefined)
    items.push([!!pw && pw === pw2, 'Both passwords match']);
  return (
    <View style={{ marginTop: 6, marginHorizontal: 2 }}>
      {items.map(([ok, t]) => (
        <Txt
          key={t}
          style={{ fontSize: 12, color: ok ? c.grn : c.mut, marginVertical: 1 }}
        >
          {ok ? '✓' : '○'} {t}
        </Txt>
      ))}
    </View>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior="padding"
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 24,
          paddingTop: 30 + insets.top,
          paddingBottom: 30 + insets.bottom,
        }}
      >
        {children}
      </ScrollView>
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
    </KeyboardAvoidingView>
  );
}
const Shell = AuthShell;

/* ---------- Forgot password: find account → new password → done ---------- */
function ForgotScreen({
  initialId,
  onDone,
}: {
  initialId: string;
  onDone: (id?: string) => void;
}) {
  const { findAccount, setPassword, toast } = useApp();
  const { c } = useTheme();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [id, setId] = useState(initialId);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const acct = step > 1 ? findAccount(id) : null;

  const back = () => {
    if (step === 2) setStep(1);
    else onDone(step === 3 ? id : undefined);
  };
  const backRef = React.useRef(back);
  backRef.current = back;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      backRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const mask = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .map(w => w[0] + '•'.repeat(Math.max(1, w.length - 1)))
      .join(' ');

  const steps = ['Find account', 'New password', 'Done'];

  return (
    <Shell>
      <Pressable
        onPress={back}
        hitSlop={10}
        style={{ alignSelf: 'flex-start', marginBottom: 10 }}
      >
        <Txt style={{ color: c.em, fontWeight: '700' }}>
          ‹ {step === 2 ? 'Back' : 'Back to log in'}
        </Txt>
      </Pressable>

      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: c.grey,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 30 }}>{step === 3 ? '✅' : '🔑'}</Text>
        </View>
        <H2 style={{ marginTop: 12, marginBottom: 2, textAlign: 'center' }}>
          {step === 1
            ? 'Forgot password?'
            : step === 2
            ? 'Set a new password'
            : 'Password updated'}
        </H2>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginVertical: 14 }}>
        {steps.map((t, i) => {
          const on = i + 1 <= step;
          return (
            <View key={t} style={{ flex: 1, alignItems: 'center' }}>
              <View
                style={{
                  height: 4,
                  alignSelf: 'stretch',
                  borderRadius: 2,
                  backgroundColor: on ? c.em : c.line,
                }}
              />
              <Txt
                style={{
                  fontSize: 11,
                  color: on ? c.em : c.mut,
                  marginTop: 4,
                  fontWeight: on ? '700' : '400',
                }}
              >
                {t}
              </Txt>
            </View>
          );
        })}
      </View>

      {step === 1 ? (
        <>
          <Note style={{ fontSize: 14, textAlign: 'center' }}>
            Enter the email or phone number you signed up with.
          </Note>
          <Label>Email or phone</Label>
          <Input
            value={id}
            onChangeText={setId}
            placeholder="demo@bondcheck.pk"
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
          <Btn
            title="Find my account"
            onPress={() => {
              if (!id.trim()) return toast('Enter your email or phone number');
              if (!findAccount(id))
                return toast('No account found with that email or phone');
              setStep(2);
            }}
          />
          <Note style={{ textAlign: 'center', marginTop: 12 }}>
            Accounts are kept on this phone for now. When the app moves to a
            server, this step will send you a code by email or SMS.
          </Note>
        </>
      ) : null}

      {step === 2 && acct ? (
        <>
          <View
            style={{
              backgroundColor: c.surf,
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: 14,
              padding: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: c.em,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>
                {acct.name[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '700' }}>{mask(acct.name)}</Txt>
              <Txt style={{ fontSize: 12, color: c.mut }}>{acct.id}</Txt>
            </View>
            <Txt style={{ color: c.grn, fontWeight: '700', fontSize: 12 }}>
              Account found
            </Txt>
          </View>
          <Label>New password</Label>
          <PasswordInput value={pw} onChange={setPw} />
          <Label>Confirm new password</Label>
          <PasswordInput
            value={pw2}
            onChange={setPw2}
            placeholder="Type it again"
          />
          <Rules pw={pw} pw2={pw2} />
          <Btn
            title="Update password"
            onPress={() => {
              if (setPassword(id, pw, pw2)) setStep(3);
            }}
          />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Note style={{ fontSize: 14, textAlign: 'center' }}>
            Your password has been changed. Log in with your new password. If
            you used fingerprint login, turn it on again from Settings →
            Security.
          </Note>
          <Btn title="Back to log in" onPress={() => onDone(id)} />
        </>
      ) : null}
    </Shell>
  );
}

/* ---------- Log in / Sign up ---------- */
export default function AuthScreen() {
  const {
    am,
    setAm,
    auth,
    enterDemo,
    bioAvail,
    bioUser,
    bioLogin,
    bioBusy,
    lastId,
    bioName,
    db,
    bioAutoOff,
  } = useApp();
  const { c } = useTheme();
  const [n, setN] = useState('');
  const [e, setE] = useState(lastId);
  const [useBio, setUseBio] = useState(true);
  const bioReady =
    !!bioAvail && !!bioUser && db.users.some(x => x.id === bioUser);

  useEffect(() => {
    if (lastId) setE(lastId);
  }, [lastId]);

  // Show the fingerprint prompt straight away on the login screen (once per launch).
  useEffect(() => {
    if (!bioReady || am !== 'login' || autoBioDone || bioAutoOff) return;
    autoBioDone = true;
    const t = setTimeout(() => bioLogin(), 500);
    return () => clearTimeout(t);
  }, [bioReady, am, bioLogin, bioAutoOff]);
  const [p, setP] = useState('');
  const [p2, setP2] = useState('');
  const [code, setCode] = useState('');
  const [forgot, setForgot] = useState(false);
  const signup = am === 'signup';
  const t = signup
    ? ['Create your account', 'You’ll get your own personal workspace']
    : ['Welcome back', 'Log in to your account'];

  if (forgot)
    return (
      <ForgotScreen
        initialId={e}
        onDone={id => {
          setForgot(false);
          if (id) {
            setE(id);
            setP('');
            setAm('login');
          }
        }}
      />
    );

  return (
    <Shell>
      <View style={{ alignItems: 'center' }}>
        <Logo size={60} animated={false} />
        <H2 style={{ marginTop: 12, marginBottom: 0, textAlign: 'center' }}>
          {t[0]}
        </H2>
        <Note style={{ marginBottom: 10, textAlign: 'center' }}>{t[1]}</Note>
      </View>
      <Seg
        options={[
          ['login', 'Log in'],
          ['signup', 'Sign up'],
        ]}
        value={am}
        onChange={v => {
          setAm(v);
          setP2('');
        }}
      />
      {!signup && bioReady ? (
        <View
          style={{
            backgroundColor: c.surf,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: 18,
            paddingVertical: 16,
            marginVertical: 10,
            alignItems: 'center',
          }}
        >
          <FingerButton
            onPress={() => bioLogin()}
            busy={bioBusy}
            label={`Log in with ${bioName()}`}
          />
          <Txt style={{ fontSize: 12, color: c.mut, marginTop: 4 }}>
            as {bioUser}
          </Txt>
          <Txt style={{ fontSize: 12, color: c.mut, marginTop: 10 }}>
            — or log in with your password —
          </Txt>
        </View>
      ) : null}
      {signup ? (
        <>
          <Label>Full name</Label>
          <Input
            value={n}
            onChangeText={setN}
            placeholder="Your name"
            autoCapitalize="words"
          />
        </>
      ) : null}
      <Label>Email or phone</Label>
      <Input
        value={e}
        onChangeText={setE}
        placeholder="demo@bondcheck.pk"
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
      />
      {signup && e.trim() && !validLoginId(e) ? (
        <Txt
          style={{ fontSize: 12, color: c.red, marginTop: 4, marginLeft: 2 }}
        >
          Enter a valid email, or a phone number with 10–13 digits
        </Txt>
      ) : null}
      <Label>Password</Label>
      <PasswordInput value={p} onChange={setP} />
      {signup ? (
        <>
          <Label>Confirm password</Label>
          <PasswordInput
            value={p2}
            onChange={setP2}
            placeholder="Type it again"
          />
          <Rules pw={p} pw2={p2} />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: c.surf,
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: 14,
              paddingVertical: 10,
              paddingHorizontal: 12,
              marginTop: 12,
            }}
          >
            <Text style={{ fontSize: 24 }}>👆</Text>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '700', fontSize: 15 }}>
                Log in with fingerprint
              </Txt>
              <Txt style={{ fontSize: 12, color: c.mut }}>
                {bioAvail
                  ? 'You will scan your finger once after creating the account.'
                  : 'Not available — add a fingerprint in your phone Settings first. You can turn it on later in Settings.'}
              </Txt>
            </View>
            <Switch
              value={!!bioAvail && useBio}
              disabled={!bioAvail}
              onValueChange={setUseBio}
              trackColor={{ true: c.em2, false: c.line }}
              thumbColor={bioAvail && useBio ? c.em : '#f4f3f4'}
            />
          </View>
        </>
      ) : (
        <Pressable
          onPress={() => setForgot(true)}
          hitSlop={8}
          style={{ alignSelf: 'flex-end', paddingVertical: 8 }}
        >
          <Txt style={{ color: c.em, fontWeight: '700', fontSize: 14 }}>
            Forgot password?
          </Txt>
        </Pressable>
      )}
      <Label>Invite code (optional)</Label>
      <Input
        value={code}
        onChangeText={setCode}
        placeholder="BOND-XXXXX"
        upper
        mono
        autoCorrect={false}
      />
      <Note>
        Have a family or group code? Enter it to get a shared workspace in
        addition to your own.
      </Note>
      <Btn
        title={signup ? 'Create account' : 'Log in'}
        onPress={() =>
          auth({ e, p, p2, n, c: code, bio: !!bioAvail && useBio })
        }
      />
      <Btn variant="alt" title="Try demo account" onPress={enterDemo} />
      <Note style={{ textAlign: 'center', marginTop: 14 }}>
        Demo login: demo@bondcheck.pk / 123456 · Invite code: BOND-ABBU7
      </Note>
    </Shell>
  );
}
