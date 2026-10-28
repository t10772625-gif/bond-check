import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import Share from 'react-native-share';
import type {
  Bond, CheckResult, DB, Draw, Phase, Rank, Role, Sched, SheetState, Summary, Tab, User, Win, WinRow, Workspace,
} from '../types';
import { addDays, fd, genRange, newCode, norm, nums, split, today } from '../utils';
import { makeBond, seed } from './seed';
import { base64 } from '../export/bytes';
import { buildXlsx } from '../export/xlsx';
import { buildPdf } from '../export/pdf';
import { BioType, bioClear, bioLoad, bioSave, bioType } from './bio';
import { useAutomation } from '../cloud/useAutomation';

const KEY = 'bondcheck.v4';
const PREFS_KEY = 'bondcheck.prefs';
const DRAFT_KEY = 'bondcheck.draft';

export interface ToastState {
  id: number;
  text: string;
  action?: string;
  fn?: () => void;
}

export interface LoadingInfo {
  name: string;
  wsCount: number;
  joined: string | null;
}

export type BadgeKind = '' | 'w' | 'n' | 'g';
export type HomeFilter = 'all' | 'pend' | 'ren' | 'arch';
export type CheckMode = 'all' | 'list' | 'range';
export type AddMode = 'single' | 'range' | 'bulk';

export interface BondInput {
  den: number;
  date: string;
  holder: string;
  note: string;
}

/** Everything typed on the Add screen. Kept in the store (and on disk) so it survives tab changes and restarts. */
export interface AddForm {
  mode: AddMode;
  den: number;
  dt: string;
  holder: string;
  note: string;
  single: string;
  ra: string;
  rb: string;
  bulk: string;
}

export interface StagedItem {
  key: number;
  n: string;
  on: boolean;
}

/** A range/paste list waiting for review in the preview modal. */
export interface Staged {
  items: StagedItem[];
  source: 'range' | 'bulk';
  msg: string;
  removed: number;
}

export interface ImportDraft {
  den: number;
  no: string;
  date: string;
  city: string;
  r1: string;
  r2: string;
  r3: string;
}

const emptyForm: AddForm = { mode: 'range', den: 750, dt: '', holder: '', note: '', single: '', ra: 'BD123500', rb: 'BD123520', bulk: '' };
const emptyImport = (den: number): ImportDraft => ({ den, no: '', date: '', city: '', r1: '', r2: '', r3: '' });

/** Themed confirm dialog (replaces the plain Android alert). */
export interface DialogButton {
  text: string;
  style?: 'primary' | 'alt' | 'red';
  onPress?: () => void;
}
export interface DialogState {
  icon?: string;
  title: string;
  message?: string;
  rows?: [string, string][];
  buttons: DialogButton[];
}

/** Email, or a phone number with 10–13 digits. */
export const validLoginId = (s: string) => {
  const v = s.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
  const digits = v.replace(/[\s\-()+]/g, '');
  return /^\d{10,13}$/.test(digits);
};

/** How a staged number will be treated on save. */
export type StagedState = 'ok' | 'invalid' | 'exists' | 'dup';

function useAppState() {
  const automation = useAutomation();
  const legacyRef = useRef<DB | null>(null);
  const projectedOwner = useRef<string | null>(null);
  const dbRef = useRef<DB>(seed());
  const sesRef = useRef<{ U: User | null; curCode: string | null }>({ U: null, curCode: null });
  const [ver, setVer] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(() => setVer(v => v + 1), []);

  // UI state
  const [phase, setPhase] = useState<Phase>('splash');
  const [am, setAm] = useState<'login' | 'signup'>('login');
  const [loadingInfo, setLoadingInfo] = useState<LoadingInfo>({ name: '', wsCount: 1, joined: null });
  const [tab, setTab] = useState<Tab>('home');
  const [flt, setFlt] = useState<HomeFilter>('all');
  const [q, setQ] = useState('');
  const [sheet, setSheetRaw] = useState<SheetState>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const confirm = useCallback((d: DialogState) => setDialog(d), []);
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const [big, setBigRaw] = useState(false);
  // Fingerprint login
  const [bioAvail, setBioAvail] = useState<BioType | null>(null);
  const [bioUser, setBioUserRaw] = useState<string | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  const [lastId, setLastId] = useState('');
  const [bioAutoOff, setBioAutoOff] = useState(false);
  const prefsRef = useRef<{ big: boolean; bioUser: string | null; bioDeclined: string[] }>({ big: false, bioUser: null, bioDeclined: [] });
  // Check screen
  const [cm, setCm] = useState<CheckMode>('all');
  const [cden, setCden] = useState(750);
  const [cdraw, setCdraw] = useState<number | null>(null); // null = latest draw
  const [c1, setC1] = useState('');
  const [c2, setC2] = useState('');
  const [CR, setCR] = useState<CheckResult | null>(null);
  // Add screen draft + preview
  const [addForm, setAddFormRaw] = useState<AddForm>(emptyForm);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [allBondsOpen, setAllBondsOpen] = useState(false);
  const [mutating, setMutating] = useState(false);
  const mutationFlight = useRef(false);
  // Import draw draft
  const [importDraft, setImportDraft] = useState<ImportDraft | null>(null);
  // Bottom sheets: forms report unsaved edits here so "back" can ask before discarding
  const sheetDirty = useRef(false);

  const db = dbRef.current;
  const { U, curCode } = sesRef.current;
  const cur: Workspace | null = curCode ? db.groups[curCode] || null : null;

  /* ---------- persistence (debounced) ---------- */
  useEffect(() => {
    Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(PREFS_KEY), AsyncStorage.getItem(DRAFT_KEY)])
      .then(([raw, prefs, draft]) => {
        if (raw) {
          const s = JSON.parse(raw) as DB;
          if (s && Array.isArray(s.users)) dbRef.current = s;
        }
        if (prefs) {
          const p = JSON.parse(prefs);
          if (typeof p.big === 'boolean') setBigRaw(p.big);
          prefsRef.current = { big: !!p.big, bioUser: p.bioUser || null, bioDeclined: Array.isArray(p.bioDeclined) ? p.bioDeclined : [] };
          setBioUserRaw(prefsRef.current.bioUser);
        }
        if (draft && !automation.configured) {
          const d = JSON.parse(draft);
          if (d.addForm) setAddFormRaw({ ...emptyForm, ...d.addForm });
          if (d.staged && Array.isArray(d.staged.items)) setStaged(d.staged);
          if (d.importDraft) setImportDraft(d.importDraft);
        }
      })
      .catch(() => {})
      .finally(() => {
        legacyRef.current = JSON.parse(JSON.stringify(dbRef.current));
        setLoaded(true);
      });
  }, [automation.configured]);

  useEffect(() => {
    const snapshot = automation.snapshot;
    const user = automation.session?.user;
    if (!automation.configured || !snapshot || !user || !loaded) return;
    const code = 'CLOUD-' + user.id;
    const account: User = { id: user.email || user.id, name: user.user_metadata?.name || 'Account', pw: '', own: code, ws: [code] };
    dbRef.current = {
      ...dbRef.current, users: [account], sess: account.id,
      groups: { [code]: { name: 'My bonds', personal: true, bonds: snapshot.bonds, trash: snapshot.trash,
        members: [{ id: account.id, name: account.name, role: 'Owner' }] } },
      DRAWS: snapshot.draws.map(draw => ({ no: draw.draw_no || 0, den: draw.denomination, date: draw.draw_date, city: '', w: {} })),
    };
    sesRef.current = { U: account, curCode: code };
    if (projectedOwner.current !== user.id) {
      projectedOwner.current = user.id;
      setPhase('app');
      setTab('home');
    }
    refresh();
  }, [automation.snapshot, automation.session?.user.id, automation.configured, loaded, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (automation.configured && automation.loaded && !automation.session) {
      sesRef.current = { U: null, curCode: null };
      projectedOwner.current = null;
      setSheetRaw(null); setPreviewOpen(false); setAllBondsOpen(false); setDialog(null); setPhase('auth'); refresh();
    }
  }, [automation.configured, automation.loaded, automation.session?.user.id, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeNow = useCallback(() => {
    if (automation.configured) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    AsyncStorage.setItem(KEY, JSON.stringify(dbRef.current)).catch(() => {});
  }, [automation.configured]);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(writeNow, 400);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [ver, loaded, writeNow]);

  // Draft (Add form, staged list, import form) — saved separately so typing never rewrites the whole database.
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudDraftKey = useRef<string | null>(null);
  useEffect(() => {
    if (!automation.configured || !loaded) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    cloudDraftKey.current = null;
    setAddFormRaw({ ...emptyForm, ra: '', rb: '' });
    setStaged(null); setImportDraft(null); setPreviewOpen(false);
    const id = automation.session?.user.id;
    if (!id) return;
    let active = true;
    const key = `${DRAFT_KEY}.${id}`;
    AsyncStorage.getItem(key).then(raw => {
      if (!active) return;
      if (raw) {
        try {
          const draft = JSON.parse(raw);
          if (draft.addForm) setAddFormRaw({ ...emptyForm, ...draft.addForm });
          if (draft.staged && Array.isArray(draft.staged.items)) setStaged(draft.staged);
        } catch { /* An unreadable draft must not restore another account's data. */ }
      }
      cloudDraftKey.current = key;
    }).catch(() => { if (active) cloudDraftKey.current = key; });
    return () => { active = false; cloudDraftKey.current = null; };
  }, [automation.configured, automation.session?.user.id, loaded]);
  const draftRef = useRef({ addForm, staged, importDraft });
  draftRef.current = { addForm, staged, importDraft };
  const writeDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    const key = automation.configured ? cloudDraftKey.current : DRAFT_KEY;
    if (key) AsyncStorage.setItem(key, JSON.stringify(draftRef.current)).catch(() => {});
  }, [automation.configured]);
  useEffect(() => {
    if (!loaded) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(writeDraft, 500);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [addForm, staged, importDraft, loaded, writeDraft]);

  // Flush pending writes when the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      if (st !== 'active' && loaded) {
        writeNow();
        writeDraft();
      }
    });
    return () => sub.remove();
  }, [loaded, writeNow, writeDraft]);

  const savePrefs = (patch: Partial<typeof prefsRef.current>) => {
    prefsRef.current = { ...prefsRef.current, ...patch };
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefsRef.current)).catch(() => {});
  };
  const setBig = (v: boolean) => {
    setBigRaw(v);
    savePrefs({ big: v });
  };
  const setBioUser = (id: string | null) => {
    setBioUserRaw(id);
    savePrefs({ bioUser: id });
  };

  // Check fingerprint support at start and whenever the app comes back (user may add a fingerprint in phone settings).
  useEffect(() => {
    bioType().then(setBioAvail);
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') bioType().then(setBioAvail);
    });
    return () => sub.remove();
  }, []);

  const toast = useCallback((text: string, action?: string, fn?: () => void) => {
    setToastState({ id: Date.now() + Math.random(), text, action, fn });
  }, []);

  const cloudTask = async (task: () => Promise<unknown>, message: string, after?: () => void) => {
    if (mutationFlight.current) return;
    mutationFlight.current = true; setMutating(true);
    const ownerId = automation.api.session?.user.id;
    try {
      await task();
      if (automation.api.session?.user.id !== ownerId) return;
      await automation.reload(true);
      if (automation.api.session?.user.id !== ownerId) return;
      Keyboard.dismiss(); after?.(); toast(message);
    }
    catch (failure) { toast((failure as Error).message); }
    finally { mutationFlight.current = false; setMutating(false); }
  };

  /* ---------- sheets ---------- */
  const setSheet = useCallback((s: SheetState) => {
    sheetDirty.current = false;
    setSheetRaw(s);
  }, []);
  const markDirty = useCallback(() => {
    sheetDirty.current = true;
  }, []);
  /** Close from back button / backdrop: ask first if a form has unsaved edits. */
  const requestCloseSheet = useCallback(() => {
    if (!sheetDirty.current) return setSheet(null);
    confirm({
      icon: '✏️',
      title: 'Discard changes?',
      message: 'You have unsaved changes in this form.',
      buttons: [
        { text: 'Discard', style: 'red', onPress: () => setSheet(null) },
        { text: 'Keep editing', style: 'alt' },
      ],
    });
  }, [setSheet, confirm]);

  /* ---------- helpers ---------- */
  const B = (): Bond[] => (cur ? cur.bonds : []);
  const me = () => (cur && U ? cur.members.find(m => m.id === U.id) : undefined) || { role: 'Viewer' as Role };
  const role = (): Role => me().role;
  const gate = () => {
    if (role() === 'Viewer') {
      toast('View-only access. Ask the owner for Editor rights.');
      return true;
    }
    return false;
  };
  const amt = (b: Bond, w: Win) => w.amount ?? (+((db.PRIZE[b.d] || {})[w.rank] || 0) || 0);
  const rate = () => (db.filer ? 0.85 : 0.65);
  const pend = (b: Bond) => b.st === 'active' && b.wins.some(w => !w.provisional && (automation.configured ? !w.claim : w.date > (b.date || '')));
  const lastW = (b: Bond) => b.wins.filter(w => !w.provisional).slice(-1)[0] || b.wins[b.wins.length - 1];
  const badge = (b: Bond): [string, BadgeKind] => {
    if (b.st !== 'active') return ['Archived', ''];
    if (pend(b)) return ['🎉 Won · ' + lastW(b).rank, 'w'];
    if (b.wins.some(w => w.provisional)) return ['Possible win — verify', 'n'];
    if (b.wins.length) return [(automation.configured ? 'Claimed · ' : 'Renewed · ') + b.wins.length + ' win' + (b.wins.length > 1 ? 's' : ''), 'g'];
    return ['Active', ''];
  };
  const findBond = (id: number) => B().find(x => x.id === id);

  const summary = (): Summary => {
    const A = B();
    const act = A.filter(b => b.st === 'active');
    const W: WinRow[] = [];
    A.forEach(b => b.wins.forEach((w, i) => { if (!w.provisional) W.push({ b, w, i, a: amt(b, w) }); }));
    W.sort((x, y) => y.w.date.localeCompare(x.w.date));
    const gross = W.reduce((s, x) => s + x.a, 0);
    const got = W.filter(x => x.w.claim);
    const by: Summary['by'] = {};
    A.forEach(b => {
      const o = (by[b.d] = by[b.d] || { c: 0, v: 0, w: 0, p: 0 });
      o.c++;
      o.v += b.d;
      b.wins.forEach(w => {
        if (w.provisional) return;
        o.w++;
        o.p += amt(b, w);
      });
    });
    return {
      A, act, W, by, gross,
      net: Math.round(gross * rate()),
      rcv: got.reduce((s, x) => s + (+(x.w.claim?.rcv || 0) || 0), 0),
      pn: W.length - got.length,
      pnet: Math.round(W.filter(x => !x.w.claim).reduce((s, x) => s + x.a, 0) * rate()),
      bought: A.length,
      boughtVal: A.reduce((s, b) => s + b.d, 0),
      heldVal: act.reduce((s, b) => s + b.d, 0),
      uniq: A.filter(b => b.wins.some(w => !w.provisional)).length,
    };
  };

  /* ---------- auth ---------- */
  const joinWs = (u: User, c: string) => {
    if (u.ws.includes(c)) return false;
    u.ws.push(c);
    dbRef.current.groups[c].members.push({ id: u.id, name: u.name, role: 'Editor' });
    return true;
  };

  const enter = (u: User, joined: string | null = null, offerBio = false) => {
    const d = dbRef.current;
    const s = sesRef.current;
    s.U = u;
    d.sess = u.id;
    if (!s.curCode || !d.groups[s.curCode] || !u.ws.includes(s.curCode)) s.curCode = u.own;
    setSheet(null);
    setLoadingInfo({ name: u.name, wsCount: u.ws.length, joined });
    setPhase('loading');
    refresh();
    setTimeout(() => {
      setTab('home');
      setFlt('all');
      setQ('');
      setCR(null);
      setPhase('app');
      if (joined) toast('Joined “' + joined + '”. Switch workspaces from the top of Home.');
      if (offerBio) offerFingerprint(u);
    }, 2500);
  };

  /* ---------- fingerprint ---------- */
  const bioName = () => (bioAvail === 'Face' ? 'face unlock' : 'fingerprint');

  /** Save this user's login behind the fingerprint (shows the system prompt). */
  const enableBio = async (u: User | null = sesRef.current.U) => {
    if (!u) return false;
    const t = await bioType();
    setBioAvail(t);
    if (!t) {
      toast('No fingerprint found. Add one in your phone Settings → Security first.');
      return false;
    }
    setBioBusy(true);
    const r = await bioSave(u.id, u.pw);
    setBioBusy(false);
    if (r.ok) {
      setBioUser(u.id);
      savePrefs({ bioDeclined: prefsRef.current.bioDeclined.filter(x => x !== u.id) });
      toast('Fingerprint login is on 👆');
      return true;
    }
    toast(r.cancelled ? 'Fingerprint was not turned on' : 'Could not turn on fingerprint: ' + (r.message || 'unknown error'));
    return false;
  };

  const disableBio = async () => {
    await bioClear();
    setBioUser(null);
    toast('Fingerprint login is off');
  };

  /** After a password login, offer fingerprint once (unless the user said "Not now" before). */
  const offerFingerprint = (u: User) => {
    if (!bioAvail || prefsRef.current.bioUser === u.id || prefsRef.current.bioDeclined.includes(u.id)) return;
    const other = prefsRef.current.bioUser && prefsRef.current.bioUser !== u.id ? prefsRef.current.bioUser : null;
    setDialog({
      icon: '👆',
      title: 'Log in faster next time?',
      message:
        `Use your ${bioName()} instead of typing your password.` +
        (other ? ` This replaces fingerprint login for ${other} on this phone.` : '') +
        ' You can change this any time in Settings.',
      buttons: [
        { text: `Turn on ${bioName()}`, style: 'primary', onPress: () => enableBio(u) },
        { text: 'Not now', style: 'alt', onPress: () => savePrefs({ bioDeclined: [...prefsRef.current.bioDeclined, u.id] }) },
      ],
    });
  };

  /** Log in with the fingerprint from the login screen or the lock screen. */
  const bioLogin = async (expectId?: string) => {
    if (bioBusy) return;
    setBioBusy(true);
    const r = await bioLoad();
    setBioBusy(false);
    if (!r.ok) {
      if (r.reason === 'none') {
        setBioUser(null);
        toast('Fingerprint login is not set up. Log in with your password.');
      } else if (r.reason === 'error') {
        toast('Fingerprint did not work. Log in with your password.');
      }
      return;
    }
    const u = dbRef.current.users.find(x => x.id === r.id);
    if (!u || u.pw !== r.pw || (expectId && expectId !== r.id)) {
      await bioClear();
      setBioUser(null);
      setLastId(r.id);
      setPhase('auth');
      toast('Your password has changed. Log in with your password, then turn fingerprint on again.');
      return;
    }
    enter(u);
  };

  /** Lock screen "Use password instead". */
  const unlockWithPassword = () => {
    const d = dbRef.current;
    setLastId(d.sess || '');
    setBioAutoOff(true);
    d.sess = null;
    sesRef.current = { U: null, curCode: null };
    refresh();
    setAm('login');
    setPhase('auth');
  };

  const enterDemo = () => enter(dbRef.current.users[0]);

  const auth = async (f: { e: string; p: string; p2: string; n: string; c: string; bio?: boolean }) => {
    const d = dbRef.current;
    const e = f.e.trim().toLowerCase();
    const n = f.n.trim();
    const c = f.c.trim().toUpperCase();
    if (am === 'signup' && !n) return toast('Please enter your name');
    if (!e) return toast('Enter your email or phone number');
    if (am === 'signup' && !validLoginId(e)) return toast('Enter a valid email or a phone number (10–13 digits)');
    if (f.p.length < 6) return toast('Password must be at least 6 characters');
    if (am === 'signup' && f.p !== f.p2) return toast('Passwords do not match');
    if (c && !d.groups[c]) return toast('Invalid invite code (try BOND-ABBU7)');
    let u: User | undefined;
    if (am === 'login') {
      u = d.users.find(x => x.id === e && x.pw === f.p);
      if (!u) return toast('Incorrect email or password');
    } else {
      if (!n) return toast('Please enter your name');
      if (d.users.some(x => x.id === e)) return toast('Account already exists. Please log in.');
      let own = newCode();
      while (d.groups[own]) own = newCode();
      d.groups[own] = { name: n.split(' ')[0] + '’s Bonds', personal: true, bonds: [], trash: [], members: [{ id: e, name: n, role: 'Owner' }] };
      u = { name: n, id: e, pw: f.p, own, ws: [own] };
      d.users.push(u);
    }
    const joined = c && joinWs(u, c) ? d.groups[c].name : null;
    if (am === 'signup') {
      refresh();
      if (f.bio) await enableBio(u);
      enter(u, joined);
    } else {
      enter(u, joined, true);
    }
  };

  /** Forgot password, step 1: find the account on this phone. */
  const findAccount = (id: string) => dbRef.current.users.find(x => x.id === id.trim().toLowerCase()) || null;

  /** Forgot password, step 2: set the new password. Returns true when saved. */
  const setPassword = (id: string, pw: string, pw2: string) => {
    const u = findAccount(id);
    if (!u) {
      toast('No account found with that email or phone');
      return false;
    }
    if (pw.length < 6) {
      toast('Password must be at least 6 characters');
      return false;
    }
    if (pw !== pw2) {
      toast('Passwords do not match');
      return false;
    }
    if (pw === u.pw) {
      toast('New password must be different from the old one');
      return false;
    }
    u.pw = pw;
    if (prefsRef.current.bioUser === u.id) {
      bioClear();
      setBioUser(null);
    }
    refresh();
    return true;
  };

  const doLogout = () => {
    if (automation.configured) return void automation.signOut();
    setSheet(null);
    dbRef.current.sess = null;
    refresh();
    setPhase('logout');
    setTimeout(() => {
      sesRef.current = { U: null, curCode: null };
      setAm('login');
      setPhase('auth');
    }, 1000);
  };

  /* ---------- workspaces + members ---------- */
  const swTo = (c: string) => {
    sesRef.current.curCode = c;
    setCR(null);
    setFlt('all');
    setQ('');
    setSheet(null);
    refresh();
  };

  const joinNow = (code: string) => {
    const c = code.trim().toUpperCase();
    if (!U) return false;
    if (!dbRef.current.groups[c]) {
      toast('Invalid invite code');
      return false;
    }
    if (!joinWs(U, c)) {
      toast('You are already in this workspace');
      return false;
    }
    toast('Joined “' + dbRef.current.groups[c].name + '”');
    swTo(c);
    return true;
  };

  const regen = () => {
    const d = dbRef.current;
    const old = curCode;
    if (!old) return;
    let nc = newCode();
    while (d.groups[nc]) nc = newCode();
    d.groups[nc] = d.groups[old];
    delete d.groups[old];
    d.users.forEach(u => {
      u.ws = u.ws.map(c => (c === old ? nc : c));
      if (u.own === old) u.own = nc;
    });
    sesRef.current.curCode = nc;
    refresh();
    toast('New invite code: ' + nc);
  };

  const leaveWs = () => {
    if (!cur || !U || !curCode) return;
    const c = curCode;
    cur.members = cur.members.filter(m => m.id !== U.id);
    U.ws = U.ws.filter(x => x !== c);
    toast('You left the workspace');
    swTo(U.own);
  };

  const setRole = (id: string, r: Role) => {
    const m = cur?.members.find(x => x.id === id);
    if (m) {
      m.role = r;
      refresh();
      toast('Role updated: ' + m.name + ' is now ' + r);
    }
  };

  const rmMember = (id: string) => {
    if (!cur) return;
    const m = cur.members.find(x => x.id === id);
    const u = dbRef.current.users.find(x => x.id === id);
    cur.members = cur.members.filter(x => x.id !== id);
    if (u) u.ws = u.ws.filter(c => c !== curCode);
    refresh();
    toast((m ? m.name : 'Member') + ' was removed');
  };

  const copyText = (text: string, msg = 'Copied') => {
    try {
      Clipboard.setString(text);
      toast(msg);
    } catch {
      toast(text);
    }
  };

  /* ---------- bond actions ---------- */
  const saveClaim = (id: number, i: number, data: { date: string; rcv: number } | null) => {
    if (gate()) return;
    const b = findBond(id);
    if (!b) return;
    if (automation.configured && b.wins[i]?.provisional && data) return toast('Verify this possible win before recording a claim');
    if (automation.configured) return void cloudTask(() => automation.api.rpc('mark_win', {
      p_id: b.wins[i].cloudId, p_claim_date: data ? data.date || today() : null, p_received: data?.rcv ?? null,
    }), data ? 'Claim saved' : 'Claim cleared', () => setSheet({ kind: 'bond', id, m: 'view' }));
    b.wins[i].claim = data ? { date: data.date || today(), rcv: data.rcv || 0 } : null;
    refresh();
    toast(data ? 'Claim saved' : 'Claim cleared');
    setSheet({ kind: 'bond', id, m: 'view' });
  };

  const renew = (id: number, date: string) => {
    if (gate()) return;
    const b = findBond(id);
    if (!b) return;
    const d = date || today();
    if (automation.configured) return void cloudTask(() => automation.repository.update(b, { date: d }), 'Date saved', () => setSheet(null));
    b.date = d;
    refresh();
    toast(b.n + ' renewed: ' + fd(d));
    setSheet(null);
  };

  const saveEdit = (id: number, f: { n: string; d: number; date: string; holder: string; series: string; note: string }) => {
    if (gate()) return;
    const b = findBond(id);
    if (!b) return;
    const n = norm(f.n);
    if (automation.configured) return void cloudTask(() => automation.repository.update(b, { ...f, n }), 'Changes saved', () => setSheet(null));
    if (!split(n)) return toast('Invalid number format');
    if (B().some(x => x.n === n && x.id !== id)) return toast(n + ' is already added');
    Object.assign(b, { n, d: f.d, date: f.date, holder: f.holder.trim(), series: f.series, note: f.note.trim() });
    refresh();
    toast('Changes saved');
    setSheet({ kind: 'bond', id, m: 'view' });
  };

  const arch = (id: number) => {
    if (gate()) return;
    const b = findBond(id);
    if (!b) return;
    if (automation.configured) return void cloudTask(() => automation.repository.update(b, { archived: b.st === 'active' }), 'Bond status saved', () => setSheet(null));
    b.st = b.st === 'active' ? 'archived' : 'active';
    refresh();
    toast(b.st === 'active' ? 'Bond restored' : 'Moved to Archived');
    setSheet(null);
  };

  const restoreBond = (id: number) => {
    const w = sesRef.current.curCode ? dbRef.current.groups[sesRef.current.curCode] : null;
    if (!w) return;
    const b = w.trash.find(x => x.id === id);
    if (!b) return;
    if (automation.configured) return void cloudTask(() => automation.repository.update(b, { deleted_at: null }), 'Bond restored');
    if (w.bonds.some(x => x.n === b.n)) return toast(b.n + ' already exists');
    w.trash = w.trash.filter(x => x.id !== id);
    w.bonds.push(b);
    refresh();
    toast(b.n + ' restored');
  };

  const del = (id: number) => {
    if (gate() || !cur) return;
    const b = findBond(id);
    if (!b) return;
    if (automation.configured) return void cloudTask(() => automation.repository.remove(b), 'Bond moved to trash', () => setSheet(null));
    cur.bonds = cur.bonds.filter(x => x.id !== id);
    cur.trash.unshift(b);
    setSheet(null);
    refresh();
    toast(b.n + ' deleted', 'Undo', () => restoreBond(id));
  };

  const deleteBonds = async (ids: number[]): Promise<boolean> => {
    if (gate() || !cur) return false;
    const selected = B().filter(b => ids.includes(b.id));
    if (!selected.length) return false;
    try {
      if (automation.configured) {
        await automation.api.rpc('trash_bonds', { p_ids: selected.map(b => b.cloudId) });
        await automation.reload();
      } else {
        const keys = new Set(ids);
        cur.bonds = cur.bonds.filter(b => !keys.has(b.id));
        cur.trash.unshift(...selected);
        refresh();
      }
      toast(`${selected.length} bonds moved to Recently deleted`);
      return true;
    } catch (failure) {
      toast((failure as Error).message);
      return false;
    }
  };

  const emptyTrash = () => {
    if (automation.configured) return void cloudTask(() => automation.api.request('/rest/v1/bonds?deleted_at=not.is.null', { method: 'DELETE' }), 'Trash emptied');
    if (!cur) return;
    cur.trash = [];
    refresh();
    toast('Trash emptied');
  };

  /* ---------- add ---------- */
  const setAddForm = (patch: Partial<AddForm>) => setAddFormRaw(f => ({ ...f, ...patch }));
  const inputFromForm = (): BondInput => ({ den: addForm.den, date: addForm.dt, holder: addForm.holder, note: addForm.note });

  const addSingle = () => {
    if (gate() || !cur || !U) return;
    const n = norm(addForm.single);
    if (automation.configured) return void cloudTask(() => automation.repository.add([{
      n, d: addForm.den, date: addForm.dt, holder: addForm.holder, note: addForm.note,
    }]), 'Bond saved and checked against stored history', () => {
      setAddForm({ single: '' }); setTab('home'); setFlt('all'); setQ(''); setAllBondsOpen(true);
    });
    if (!split(n)) return toast('Invalid number format');
    if (B().some(b => b.n === n && b.d === addForm.den)) return toast(n + ' is already added');
    const x = inputFromForm();
    cur.bonds.push(makeBond(dbRef.current, n, x.den, x.date, { holder: x.holder.trim(), note: x.note.trim(), by: U.name }));
    setAddForm({ single: '' });
    refresh();
    toast('Added ' + n);
    setTab('home'); setAllBondsOpen(true);
  };

  let keySeq = Date.now();
  const toStaged = (list: string[], source: Staged['source'], msg: string): Staged => ({
    source,
    msg,
    removed: 0,
    items: list.map(n => ({ key: keySeq++, n, on: !!split(n) })),
  });

  /** Build the preview list from the range or paste box and open the review modal. */
  const stage = () => {
    if (addForm.mode === 'range') {
      const r = genRange(addForm.ra, addForm.rb);
      if (!r) return toast('Invalid range (same prefix, max 2,000)');
      const existing = new Set(B().filter(b => b.d === addForm.den).map(b => b.n));
      const st = toStaged(r, 'range', '');
      st.items.forEach(it => existing.has(it.n) && (it.on = false));
      setStaged(st);
    } else {
      const t = addForm.bulk.split(/[\s,;]+/).map(norm).filter(Boolean);
      if (t.length > 10000) return toast('Paste up to 10,000 bond numbers at a time');
      const u = [...new Set(t)];
      if (!u.length) return toast('Paste at least one number');
      const existing = new Set(B().filter(b => b.d === addForm.den).map(b => b.n));
      const st = toStaged(u, 'bulk', t.length - u.length ? `${t.length - u.length} duplicates merged` : '');
      st.items.forEach(it => existing.has(it.n) && (it.on = false));
      setStaged(st);
    }
    setPreviewOpen(true);
  };

  const discardStaged = () => {
    setStaged(null);
    setPreviewOpen(false);
  };

  /** Classify each staged number: ok / invalid format / already in workspace / repeated in the list. */
  const stagedStates = (items: StagedItem[]): StagedState[] => {
    const existing = new Set([...B(), ...(automation.snapshot?.trash ?? [])].filter(b => b.d === addForm.den).map(b => b.n));
    const seen = new Set<string>();
    return items.map(it => {
      if (!split(it.n)) return 'invalid';
      if (existing.has(it.n)) return 'exists';
      if (seen.has(it.n)) return 'dup';
      seen.add(it.n);
      return 'ok';
    });
  };

  /** Save only valid, new, selected numbers from the staged list. */
  const saveStaged = () => {
    if (gate() || !cur || !U || !staged) return;
    const states = stagedStates(staged.items);
    const x = inputFromForm();
    const list = staged.items.filter((it, i) => it.on && states[i] === 'ok').map(it => it.n);
    if (!list.length) return toast('No valid new numbers selected');
    if (automation.configured) return void cloudTask(() => automation.repository.add(list.map(n => ({
      n, d: x.den, date: x.date, holder: x.holder, note: x.note,
    }))), `${list.length} bonds saved and checked against stored history`, () => {
      setStaged(null); setPreviewOpen(false); setTab('home'); setFlt('all'); setQ(''); setAllBondsOpen(true);
    });
    list.forEach(n => cur.bonds.push(makeBond(dbRef.current, n, x.den, x.date, { holder: x.holder.trim(), note: x.note.trim(), by: U.name })));
    setStaged(null);
    setPreviewOpen(false);
    setTab('home');
    setFlt('all');
    setQ('');
    refresh();
    toast(list.length + ' bonds added');
  };

  /* ---------- draws ---------- */
  const saveDraw = (f: ImportDraft) => {
    if (automation.configured) return toast('Upload the complete official result file from the draw status board.');
    const d = dbRef.current;
    const no = +f.no || 0;
    if (!no || !f.date) return toast('Draw number and date are required');
    const w: Record<string, Rank> = {};
    ([['1st', f.r1], ['2nd', f.r2], ['3rd', f.r3]] as [Rank, string][]).forEach(([r, t]) => nums(t).forEach(n => (w[n] = r)));
    if (!Object.keys(w).length) return toast('Paste at least one winning number');
    d.DRAWS = d.DRAWS.filter(x => !(x.den === f.den && x.no === no));
    d.DRAWS.push({ no, den: f.den, date: f.date, city: f.city.trim(), w });
    setCden(f.den);
    setCdraw(no);
    setCR(null);
    setImportDraft(null);
    setSheet(null);
    refresh();
    toast('Draw #' + no + ' saved with ' + Object.keys(w).length + ' numbers');
  };

  const doCheck = (dr: Draw) => {
    if (automation.configured) return void cloudTask(() => automation.run(), 'Check queued; progress is shown on the status board');
    if (gate()) return;
    let ns: string[] | null = null;
    if (cm === 'list') ns = nums(c1);
    if (cm === 'range') {
      ns = genRange(c1, c2);
      if (!ns) return toast('Invalid range (same prefix, max 2,000 numbers)');
    }
    if (ns && !ns.length) return toast('Enter at least one number');
    const mine = B().filter(b => b.d === dr.den);
    const R: CheckResult = { dr, won: [], already: [], old: [], nf: [], arch: [], other: [], inv: [], notmine: 0, total: ns ? ns.length : 0 };
    const proc = (b: Bond) => {
      if (b.st !== 'active') R.arch.push(b.id);
      else if (b.date && dr.date < addDays(b.date, 60)) R.old.push(b.id);
      else if (b.wins.some(w => w.no === dr.no)) R.already.push(b.id);
      else if (dr.w[b.n]) {
        b.wins.push({ no: dr.no, date: dr.date, rank: dr.w[b.n], claim: null });
        R.won.push(b.id);
      } else R.nf.push(b.id);
    };
    if (cm === 'all' || !ns) mine.forEach(proc);
    else {
      const byNo = new Map(mine.map(b => [b.n, b]));
      ns.forEach(n => {
        if (!split(n)) return void R.inv.push(n);
        const b = byNo.get(n);
        if (b) proc(b);
        else if (dr.w[n]) R.other.push(n);
        else R.notmine++;
      });
    }
    setCR(R);
    refresh();
  };

  /* ---------- settings ---------- */
  const setFiler = (v: boolean) => {
    dbRef.current.filer = v;
    refresh();
  };
  const setPrize = (d: number, r: Rank, v: string) => {
    const P = dbRef.current.PRIZE;
    (P[d] = P[d] || {})[r] = +v || 0;
    refresh();
    toast('Prize amount saved');
  };
  const addSched = (den: number, date: string, city: string) => {
    if (!date) {
      toast('Pick a draw date');
      return false;
    }
    dbRef.current.SCHED.push({ id: Date.now(), den, date, city: city.trim(), remind: true });
    refresh();
    return true;
  };
  const tgSched = (id: number) => {
    const x = dbRef.current.SCHED.find(s => s.id === id);
    if (x) x.remind = !x.remind;
    refresh();
  };
  const rmSched = (id: number) => {
    dbRef.current.SCHED = dbRef.current.SCHED.filter(s => s.id !== id);
    refresh();
  };
  const resetAll = () => {
    if (automation.configured) return toast('Prototype reset is unavailable while the cloud database is active.');
    confirm({
      icon: '⚠️',
      title: 'Reset all data?',
      message: 'This removes every account, bond and draw on this phone and loads the demo data again. This cannot be undone.',
      buttons: [
      {
        text: 'Yes, reset everything',
        style: 'red',
        onPress: () => {
          Promise.all([AsyncStorage.removeItem(KEY), AsyncStorage.removeItem(DRAFT_KEY)]).catch(() => {});
          dbRef.current = seed();
          bioClear();
          setBioUser(null);
          savePrefs({ bioDeclined: [] });
          sesRef.current = { U: null, curCode: null };
          setStaged(null);
          setAddFormRaw(emptyForm);
          setImportDraft(null);
          setAm('login');
          refresh();
          toast('Prototype data reset');
          setTimeout(() => setPhase('auth'), 600);
        },
      },
      { text: 'Cancel', style: 'alt' },
      ],
    });
  };

  /* ---------- export / backup ---------- */
  const statementCsv = () => {
    const quote = (value: string | number | boolean) => {
      const text = String(value);
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    return ['number,denomination,series,purchased_on,holder,note,archived,verified_wins,verified_prize_total,possible_wins']
      .concat(B().map(b => {
        const wins = b.wins.filter(w => !w.provisional);
        const number = split(b.n);
        return [number?.d ?? b.n, b.d, b.series || number?.p || '', b.date || '', b.holder || '', b.note || '', b.st === 'archived', wins.length, wins.reduce((total, w) => total + amt(b, w), 0), b.wins.filter(w => w.provisional).length].map(quote).join(',');
      })).join('\n');
  };

  /** Full backup: bonds of this workspace + draws, prize table, schedule and tax setting. */
  const backupJson = () =>
    JSON.stringify({
      app: 'bondcheck',
      version: 2,
      workspace: cur?.name || '',
      exported: today(),
      bonds: B(),
      draws: dbRef.current.DRAWS,
      prize: dbRef.current.PRIZE,
      sched: dbRef.current.SCHED,
      filer: dbRef.current.filer,
    });

  const fileBase = () => 'BondCheck-' + (cur?.name || 'statement').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + today();

  const shareFile = async (b64: string, mime: string, title: string) => {
    try {
      await Share.open({ url: `data:${mime};base64,${b64}`, type: mime, filename: fileBase(), title, failOnCancel: false, useInternalStorage: true });
    } catch {
      toast('Could not share the file');
    }
  };

  const exportXlsx = () => {
    const s = summary();
    const bondRows = s.A.map(b => [
      b.n, b.d, b.st === 'active' ? 'Active' : 'Archived', b.holder || '', b.date || '', b.note || '', b.series || '', b.by || '',
      b.wins.filter(w => !w.provisional).length, b.wins.filter(w => !w.provisional).reduce((t, w) => t + amt(b, w), 0),
    ]);
    const winRows = s.W.map(x => [
      x.b.n, x.b.d, x.w.no, x.w.date, x.w.rank, x.a, automation.configured ? x.w.claim?.rcv ?? '' : Math.round(x.a * rate()), x.w.claim ? 'Claimed' : 'Pending', x.w.claim?.date || '', x.w.claim?.rcv ?? '',
    ]);
    const denRows = Object.keys(s.by)
      .sort((a, b) => +a - +b)
      .map(d => [+d, s.by[d].c, s.by[d].v, s.by[d].w, s.by[d].p]);
    const bytes = buildXlsx([
      {
        name: 'Summary',
        widths: [28, 20],
        rows: [
          ['Item', 'Value'],
          ['Workspace', cur?.name || ''],
          ['Exported on', today()],
          ['Bonds bought (incl. archived)', s.bought],
          ['Total value', s.boughtVal],
          ['Held now', s.act.length],
          ['Held value', s.heldVal],
          ['Total wins', s.W.length],
          ['Total won (gross)', s.gross],
          [automation.configured ? 'Verified gross prize total' : `After tax (${dbRef.current.filer ? 'Filer 15%' : 'Non-filer 35%'})`, automation.configured ? s.gross : s.net],
          ['Received so far', s.rcv],
          ['Claims pending', s.pn],
          [automation.configured ? 'Still to claim (gross)' : 'Still to claim (after tax)', automation.configured ? s.W.filter(x => !x.w.claim).reduce((total, x) => total + x.a, 0) : s.pnet],
          [],
          ['Denomination', 'Qty', 'Value', 'Wins', 'Prize'],
          ...denRows,
        ],
      },
      { name: 'Bonds', widths: [14, 12, 10, 16, 14, 24, 10, 14, 7, 14], rows: [['Bond', 'Denomination', 'Status', 'Holder', 'Purchase/renewal', 'Note', 'Series', 'Added by', 'Wins', 'Prize total'], ...bondRows] },
      { name: 'Wins', widths: [14, 12, 8, 12, 7, 12, 14, 10, 12, 12], rows: [['Bond', 'Denomination', 'Draw', 'Date', 'Rank', 'Gross', automation.configured ? 'Actual received' : 'After tax (est.)', 'Status', 'Claim date', 'Received'], ...winRows] },
    ]);
    shareFile(base64(bytes), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Bond Check statement (Excel)');
  };

  const exportPdf = () => {
    const s = summary();
    const f = (n: number) => 'Rs. ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const bytes = buildPdf(
      [
        { kind: 'title', text: 'Bond Check - Statement' },
        { kind: 'sub', text: `${cur?.name || ''}  -  ${fd(today())}  -  ${U?.name || ''}` },
        { kind: 'heading', text: 'Summary' },
        {
          kind: 'kv',
          rows: [
            ['Bonds bought (incl. archived)', `${s.bought}  (${f(s.boughtVal)})`],
            ['Held now', `${s.act.length}  (${f(s.heldVal)})`],
            ['Total won (gross)', `${f(s.gross)}  -  ${s.W.length} wins on ${s.uniq} bonds`],
            [automation.configured ? 'Verified gross prize total' : `After tax (${dbRef.current.filer ? 'Filer 15%' : 'Non-filer 35%'})`, f(automation.configured ? s.gross : s.net)],
            ['Received so far', `${f(s.rcv)}  -  ${s.W.length - s.pn} claimed`],
            [automation.configured ? 'Still to claim (gross)' : 'Still to claim', `${f(automation.configured ? s.W.filter(x => !x.w.claim).reduce((total, x) => total + x.a, 0) : s.pnet)}  -  ${s.pn} pending`],
          ],
        },
        { kind: 'heading', text: 'By denomination' },
        {
          kind: 'table',
          cols: [
            { title: 'Bond', width: 2 },
            { title: 'Qty', width: 1, right: true },
            { title: 'Value', width: 2, right: true },
            { title: 'Wins', width: 1, right: true },
            { title: 'Prize', width: 2, right: true },
          ],
          rows: Object.keys(s.by)
            .sort((a, b) => +a - +b)
            .map(d => [f(+d), String(s.by[d].c), f(s.by[d].v), String(s.by[d].w), f(s.by[d].p)]),
        },
        { kind: 'heading', text: `Every win (${s.W.length})` },
        {
          kind: 'table',
          cols: [
            { title: 'Bond', width: 2 },
            { title: 'Draw', width: 1 },
            { title: 'Date', width: 2 },
            { title: 'Rank', width: 1 },
            { title: 'Gross', width: 2, right: true },
            { title: 'Status', width: 3 },
          ],
          rows: s.W.map(x => [
            x.b.n, '#' + x.w.no, fd(x.w.date), x.w.rank, f(x.a),
            x.w.claim ? `Received ${f(x.w.claim.rcv)}` : 'Claim pending',
          ]),
        },
        { kind: 'heading', text: `All bonds (${s.A.length})` },
        {
          kind: 'table',
          cols: [
            { title: 'Bond', width: 2 },
            { title: 'Denom.', width: 1.5, right: true },
            { title: 'Status', width: 1.5 },
            { title: 'Holder', width: 2 },
            { title: 'Since', width: 2 },
            { title: 'Wins', width: 1, right: true },
          ],
          rows: s.A.map(b => [b.n, f(b.d), b.st === 'active' ? 'Active' : 'Archived', b.holder || '-', b.date ? fd(b.date) : 'Unknown', String(b.wins.filter(w => !w.provisional).length)]),
        },
      ],
      'Bond Check',
    );
    shareFile(base64(bytes), 'application/pdf', 'Bond Check statement (PDF)');
  };

  const restoreBackup = (text: string) => {
    if (automation.configured) return toast('Use the cloud import preview. Local backup restoration cannot overwrite server results.');
    if (gate() || !cur) return;
    try {
      const parsed = JSON.parse(text);
      const isV2 = parsed && !Array.isArray(parsed) && parsed.app === 'bondcheck';
      const a = isV2 ? parsed.bonds : parsed;
      if (!Array.isArray(a)) throw new Error('not a backup');
      let c = 0;
      a.forEach((b: Partial<Bond>) => {
        const n = b && b.n ? norm(String(b.n)) : '';
        if (n && split(n) && !cur.bonds.some(x => x.n === n)) {
          cur.bonds.push(
            Object.assign(makeBond(dbRef.current, n, Number(b.d) || 750, b.date || ''), {
              series: b.series || '',
              note: b.note || '',
              holder: b.holder || '',
              by: b.by || '',
              wins: Array.isArray(b.wins) ? b.wins : [],
              st: b.st === 'archived' ? 'archived' : 'active',
            }),
          );
          c++;
        }
      });
      const extra: string[] = [];
      if (isV2) {
        const d = dbRef.current;
        if (Array.isArray(parsed.draws)) {
          let dc = 0;
          (parsed.draws as Draw[]).forEach(dr => {
            if (!dr || !dr.no || !dr.den || !dr.date || !dr.w) return;
            d.DRAWS = d.DRAWS.filter(x => !(x.den === dr.den && x.no === dr.no));
            d.DRAWS.push({ no: +dr.no, den: +dr.den, date: String(dr.date), city: String(dr.city || ''), w: dr.w });
            dc++;
          });
          if (dc) extra.push(dc + ' draws');
        }
        if (parsed.prize && typeof parsed.prize === 'object') {
          Object.keys(parsed.prize).forEach(den => (d.PRIZE[den] = { ...(d.PRIZE[den] || {}), ...parsed.prize[den] }));
          extra.push('prize table');
        }
        if (Array.isArray(parsed.sched)) {
          let sc = 0;
          (parsed.sched as Sched[]).forEach(x => {
            if (x && x.date && x.den && !d.SCHED.some(y => y.date === x.date && y.den === x.den)) {
              d.SCHED.push({ id: Date.now() + sc, den: +x.den, date: String(x.date), city: String(x.city || ''), remind: x.remind !== false });
              sc++;
            }
          });
          if (sc) extra.push(sc + ' schedule dates');
        }
        if (typeof parsed.filer === 'boolean') d.filer = parsed.filer;
      }
      setSheet(null);
      refresh();
      toast(c + ' bonds restored' + (extra.length ? ' + ' + extra.join(', ') : ''));
    } catch {
      toast('That backup could not be read');
    }
  };

  /* ---------- splash -> auth / auto-login ---------- */
  const enterRef = useRef(enter);
  enterRef.current = enter;
  useEffect(() => {
    if (!loaded || automation.configured) return;
    const t = setTimeout(() => {
      const d = dbRef.current;
      const u = d.users.find(x => x.id === d.sess);
      if (u && prefsRef.current.bioUser === u.id) setPhase('locked');
      else if (u) enterRef.current(u);
      else setPhase('auth');
    }, 2400);
    return () => clearTimeout(t);
  }, [loaded, automation.configured]);

  return {
    automation, legacyDb: legacyRef.current, mutating,
    ver, db, U, cur, curCode,
    phase, am, setAm, loadingInfo,
    tab, setTab, flt, setFlt, q, setQ, sheet, setSheet, requestCloseSheet, markDirty, big, setBig, dialog, setDialog, confirm,
    toastState, setToastState, toast,
    cm, setCm, cden, setCden, cdraw, setCdraw, c1, setC1, c2, setC2, CR, setCR,
    addForm, setAddForm, staged, setStaged, previewOpen, setPreviewOpen, allBondsOpen, setAllBondsOpen, stage, discardStaged, stagedStates, saveStaged,
    importDraft, setImportDraft, emptyImport,
    B, me, role, gate, amt, rate, pend, lastW, badge, summary, findBond,
    auth, enterDemo, findAccount, setPassword, doLogout,
    bioAvail, bioUser, bioBusy, enableBio, disableBio, bioLogin, unlockWithPassword, lastId, bioName, bioAutoOff,
    swTo, joinNow, regen, leaveWs, setRole, rmMember, copyText,
    saveClaim, renew, saveEdit, arch, del, deleteBonds, restoreBond, emptyTrash,
    addSingle, saveDraw, doCheck,
    setFiler, setPrize, addSched, tgSched, rmSched, resetAll,
    statementCsv, backupJson, exportXlsx, exportPdf, restoreBackup,
  };
}

export type AppCtx = ReturnType<typeof useAppState>;
const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const value = useAppState();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
