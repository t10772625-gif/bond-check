import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Btn, H2, Input, Label, Note, Res, Seg } from '../components/ui';
import { AuthShell, PasswordInput, Rules } from '../screens/AuthScreen';
import { Logo } from '../screens/SplashScreen';
import { useApp } from '../store/AppStore';

export function CloudLoginScreen() {
  const { automation, toast } = useApp();
  const [mode, setMode] = useState<'login' | 'signup' | 'confirm' | 'recover' | 'reset'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [useCode, setUseCode] = useState(false);
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  useEffect(() => { if (automation.recovering) { setMode('reset'); setNotice('Recovery link verified. Choose your new password.'); setPassword(''); setConfirmation(''); } }, [automation.recovering]);
  const validEmail = () => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const signup = mode === 'signup';
  const submit = async () => {
    if (pending.current || automation.busy) return;
    if (!validEmail()) return toast('Enter your account email');
    if (!password) return toast('Enter your password');
    if (!signup) {
      pending.current = true;
      try { await automation.signIn(email, password); }
      finally { pending.current = false; }
      return;
    }
    if (!name.trim()) return toast('Enter your full name');
    if (password.length < 6 || password !== confirmation)
      return toast('Use at least six characters and matching passwords');
    pending.current = true;
    try {
      const result = await automation.signUp(name, email, password);
      setPassword(''); setConfirmation('');
      if (result.confirmationRequired) {
        setNotice('Check your email. Tap Confirm email in the latest BondCheck message, then return here to log in.');
        setMode('confirm');
      } else {
        setNotice('Account created. You can now log in.'); setMode('login');
      }
    } catch { /* Shared request error is visible below. */ }
    finally { pending.current = false; }
  };
  const sendRecovery = async () => {
    if (pending.current || automation.busy) return;
    if (!validEmail()) return toast('Enter your account email');
    pending.current = true;
    try {
      await automation.sendPasswordReset(email);
      setNotice('If this email has an account, a password-reset email has been sent. Tap its reset link to open BondCheck and choose a new password.');
      setPassword(''); setConfirmation(''); setCode(''); setMode('reset');
    } catch { /* Visible below. */ }
    finally { pending.current = false; }
  };
  return <AuthShell>
    <View style={{ alignItems: 'center' }}>
      <Logo size={60} animated={false} />
      <H2 style={{ marginTop: 12, textAlign: 'center' }}>{signup ? 'Create your account' : mode === 'confirm' ? 'Confirm your email' : mode === 'recover' || mode === 'reset' ? 'Reset password' : 'Welcome back'}</H2>
      <Note>Your private prize-bond account</Note>
    </View>
    {mode === 'login' || mode === 'signup' ? <Seg options={[[ 'login', 'Log in' ], [ 'signup', 'Sign up' ]]} value={mode} onChange={next => { if (pending.current || automation.busy) return; setMode(next); setPassword(''); setConfirmation(''); setNotice(''); }} /> : null}
    {automation.error ? <Res kind="r">{automation.error}</Res> : null}
    {notice ? <Res kind="g">{notice}</Res> : null}
    {mode === 'confirm' ? <>
      <Note>{`Confirmation sent to ${email.trim()}. Each account has its own bonds; the official results are already shared on the server.`}</Note>
      <Btn title="Email confirmed — log in" onPress={() => { setMode('login'); setNotice('Enter your password to log in.'); }} />
      <Btn variant="alt" title={automation.busy ? 'Sending…' : 'Resend confirmation email'} onPress={async () => {
        if (pending.current || automation.busy) return;
        pending.current = true;
        try { await automation.resendConfirmation(email); setNotice('If confirmation is still needed, a fresh email has been sent. Check spam too.'); } catch { /* Visible above. */ }
        finally { pending.current = false; }
      }} />
      <Btn variant="alt" title="Use a different email" onPress={() => { setMode('signup'); setNotice(''); }} />
    </> : <>
      {signup ? <><Label>Full name</Label><Input value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" maxLength={120} /></> : null}
      <Label>Email</Label><Input value={email} onChangeText={setEmail} placeholder="Your account email" autoCapitalize="none" keyboardType="email-address" autoCorrect={false} maxLength={254} />
      {mode === 'recover' ? <>
        <Note>We will email a password-reset link. Your saved bonds stay in your account.</Note>
        <Btn title={automation.busy ? 'Sending…' : 'Send password-reset email'} onPress={sendRecovery} />
      </> : mode === 'reset' ? <>
        {!automation.recovering ? <><Note>Open the latest reset link in your email to choose a new password.</Note><Btn variant="alt" title={useCode ? 'Use email link instead' : 'I have a recovery code'} onPress={() => setUseCode(!useCode)} />{useCode ? <><Label>Recovery code (if provided)</Label><Input value={code} onChangeText={setCode} placeholder="Enter the code" keyboardType="number-pad" autoCorrect={false} /></> : null}</> : null}
        {automation.recovering || useCode ? <>
        <Label>New password</Label><PasswordInput value={password} onChange={setPassword} />
        <Label>Confirm new password</Label><PasswordInput value={confirmation} onChange={setConfirmation} />
        <Rules pw={password} pw2={confirmation} />
        <Btn title={automation.busy ? 'Updating…' : 'Save new password'} onPress={async () => {
          if (pending.current || automation.busy) return;
          if (!automation.recovering && !/^\d{6,10}$/.test(code.trim())) return toast('Open the reset link from your email first');
          if (password.length < 6 || password !== confirmation) return toast('Use at least six characters and matching passwords');
          pending.current = true;
          try {
            if (!automation.recovering) await automation.verifyRecovery(email, code);
            await automation.updatePassword(password);
            setPassword(''); setConfirmation(''); setCode(''); setMode('login'); setNotice('Password updated. Log in with your new password.');
          } catch { /* Visible above. */ }
          finally { pending.current = false; }
        }} />
        </> : null}
        <Btn variant="alt" title="Send a new reset email" onPress={sendRecovery} />
      </> : <>
        <Label>Password</Label><PasswordInput value={password} onChange={setPassword} />
        {signup ? <><Label>Confirm password</Label><PasswordInput value={confirmation} onChange={setConfirmation} placeholder="Type it again" /><Rules pw={password} pw2={confirmation} /></> : <Btn variant="alt" title="Forgot password?" onPress={() => { setMode('recover'); setNotice(''); }} />}
        <Btn disabled={automation.busy} title={automation.busy ? 'Working…' : signup ? 'Create account' : 'Log in'} onPress={submit} />
        {!signup ? <Btn variant="alt" title="Resend confirmation email" onPress={async () => {
          if (pending.current || automation.busy) return;
          if (!validEmail()) return toast('Enter your account email first');
          pending.current = true;
          try { await automation.resendConfirmation(email); setNotice('If this account needs confirmation, a fresh email has been sent.'); } catch { /* Visible above. */ }
          finally { pending.current = false; }
        }} /> : null}
      </>}
      {mode === 'recover' || mode === 'reset' ? <Btn variant="alt" title="Back to log in" onPress={() => { if (automation.recovering) void automation.signOut(); setMode('login'); setNotice(''); }} /> : null}
    </>}
    {automation.session && !automation.recovering ? <><Btn variant="alt" title="Retry connection" onPress={() => automation.reload().catch(error => toast(error.message))} /><Btn variant="alt" title="Sign out" onPress={() => automation.signOut()} /></> : null}
    <Note>Each account keeps its own private bonds. Official National Savings results are shared and updated automatically.</Note>
  </AuthShell>;
}
