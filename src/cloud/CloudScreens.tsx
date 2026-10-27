import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Modal,
  NativeModules,
  ScrollView,
  Switch,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Share from 'react-native-share';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Badge,
  Btn,
  H2,
  Input,
  Label,
  Note,
  Res,
  Row,
  SearchBar,
  Seg,
  Select,
  Txt,
  matches,
} from '../components/ui';
import { useApp } from '../store/AppStore';
import { fmt, fd } from '../utils';
import { base64, utf8 } from '../export/bytes';
import { migrationPreview, SUPPORTED_DENOMINATIONS } from './migration';
import type { CloudDraw } from './types';
import { BackupRestore } from './BackupRestore';
import { AuthShell, PasswordInput, Rules } from '../screens/AuthScreen';
import { Logo } from '../screens/SplashScreen';
import { SummaryBlock } from '../screens/SettingsScreen';

const isOfficial = (url: string) =>
  /^https:\/\/(www\.)?savings\.gov\.pk\//i.test(url);
function openOfficial(url: string) {
  if (!isOfficial(url))
    return Promise.reject(
      new Error(
        'This file was uploaded manually; there is no public official-file link',
      ),
    );
  return Linking.openURL(url);
}
function Page({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: 16,
        paddingTop: insets.top + 8,
        paddingBottom: 48,
      }}
    >
      {children}
    </ScrollView>
  );
}

export function CloudLoginScreen() {
  const { automation, toast } = useApp();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const [forgot, setForgot] = useState(false);
  const signup = mode === 'signup';
  if (forgot)
    return (
      <AuthShell>
        <Logo size={60} animated={false} />
        <H2>Forgot password?</H2>
        <Note>
          Cloud passwords need secure email recovery. Contact the account owner
          to reset your password; the old phone-only password reset cannot
          change this account.
        </Note>
        <Btn title="Back to log in" onPress={() => setForgot(false)} />
      </AuthShell>
    );
  const submit = async () => {
    if (automation.busy) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()))
      return toast('Enter your account email');
    if (!password) return toast('Enter your password');
    if (!signup) return automation.signIn(email, password);
    if (!name.trim()) return toast('Enter your full name');
    if (password.length < 6 || password !== confirmation)
      return toast('Use at least six characters and matching passwords');
    try {
      const result = await automation.signUp(name, email, password);
      setNotice(
        result.confirmationRequired
          ? 'Check your email to confirm the account, then log in. The private owner account must be enrolled before bonds are available.'
          : 'Account created. Log in after the private owner account has been enrolled.',
      );
      setPassword('');
      setConfirmation('');
      setMode('login');
    } catch {
      /* The authentication error is shown below. */
    }
  };
  return (
    <AuthShell>
      <View style={{ alignItems: 'center' }}>
        <Logo size={60} animated={false} />
        <H2 style={{ marginTop: 12, marginBottom: 0, textAlign: 'center' }}>
          {signup ? 'Create your account' : 'Welcome back'}
        </H2>
        <Note style={{ marginBottom: 10, textAlign: 'center' }}>
          {signup
            ? 'Your private prize-bond account'
            : 'Log in to your account'}
        </Note>
      </View>
      <Seg
        options={[
          ['login', 'Log in'],
          ['signup', 'Sign up'],
        ]}
        value={mode}
        onChange={value => {
          setMode(value);
          setConfirmation('');
          setNotice('');
        }}
      />
      {automation.error ? <Res kind="r">{automation.error}</Res> : null}
      {notice ? <Res kind="y">{notice}</Res> : null}
      {signup ? (
        <>
          <Label>Full name</Label>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
          />
        </>
      ) : null}
      <Label>Email</Label>
      <Input
        value={email}
        onChangeText={setEmail}
        placeholder="Your account email"
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
      />
      <Label>Password</Label>
      <PasswordInput value={password} onChange={setPassword} />
      {signup ? (
        <>
          <Label>Confirm password</Label>
          <PasswordInput
            value={confirmation}
            onChange={setConfirmation}
            placeholder="Type it again"
          />
          <Rules pw={password} pw2={confirmation} />
        </>
      ) : (
        <Btn
          sm
          variant="alt"
          title="Forgot password?"
          onPress={() => setForgot(true)}
        />
      )}
      <Btn
        title={
          automation.busy ? 'Working…' : signup ? 'Create account' : 'Log in'
        }
        onPress={submit}
      />
      {automation.session ? (
        <>
          <Btn
            variant="alt"
            title="Retry connection"
            onPress={() =>
              automation.reload().catch(error => toast(error.message))
            }
          />
          <Btn
            variant="alt"
            title="Sign out"
            onPress={() => automation.signOut()}
          />
        </>
      ) : null}
      <Note style={{ textAlign: 'center', marginTop: 14 }}>
        Accounts are created privately for this bond collection. Registration
        alone does not grant access to private bonds.
      </Note>
    </AuthShell>
  );
}

export function AutomationStatus() {
  const { automation } = useApp();
  const status = automation.snapshot?.status;
  if (!automation.configured)
    return (
      <Res kind="y">
        Automatic checking is not connected. These are local or manually entered
        results.
      </Res>
    );
  if (!status) return <Res kind="y">Loading the draw status…</Res>;
  return (
    <View>
      <Res kind={automation.complete ? 'g' : 'y'}>
        {`${status.verified} of ${status.total} known draws verified · ${status.pending_jobs} jobs pending${
          automation.complete
            ? '\nAll discovered draws are verified.'
            : '\nChecking is incomplete. Unresolved draws remain visible below.'
        }`}
      </Res>
      {status.missing_sources ? (
        <Res kind="r">{`${status.missing_sources} denomination sources have not completed discovery.`}</Res>
      ) : null}
      {status.failed_jobs ? (
        <Res kind="r">{`${status.failed_jobs} jobs failed. Retry them from Settings.`}</Res>
      ) : null}
      {automation.stale ? (
        <Res kind="y">
          No successful discovery in the last three days. A fresh check is
          needed.
        </Res>
      ) : null}
      {!automation.connected && !automation.error ? (
        <Note>{`Connecting. Showing saved results from ${
          automation.snapshot?.fetchedAt ?? 'an unknown time'
        }.`}</Note>
      ) : null}
      {automation.error ? (
        <Res kind="r">{`${
          /certificate|Trust anchor|TLS|UnknownIssuer/i.test(automation.error)
            ? 'The official site could not be reached securely. New results have not been checked yet.'
            : 'The latest results could not be refreshed.'
        }\nShowing saved results from ${
          automation.snapshot?.fetchedAt ?? 'an unknown time'
        }. Checking remains incomplete.`}</Res>
      ) : null}
    </View>
  );
}

export function CloudHomeScreen() {
  const { automation, B, setTab, setSheet, q, setQ } = useApp();
  const insets = useSafeAreaInsets();
  const bonds = B().filter(b => matches(q, b.n, b.d, b.holder, b.note));
  const wins = B().flatMap(b => b.wins.map(w => ({ b, w })));
  const confirmed = wins.filter(item => !item.w.provisional);
  const possible = wins.filter(item => item.w.provisional);
  return (
    <FlatList
      data={bonds}
      keyExtractor={b => String(b.id)}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: 16,
        paddingTop: insets.top + 8,
        paddingBottom: 48,
      }}
      ListHeaderComponent={
        <View>
          <H2>My Bonds</H2>
          <AutomationStatus />
          <Res kind="g">{`${B().length} bonds · ${
            confirmed.length
          } verified wins · ${possible.length} possible wins`}</Res>
          {automation.snapshot?.status.unacknowledged ? (
            <Btn
              title={`${automation.snapshot.status.unacknowledged} new results — view wins`}
              onPress={() => setTab('results')}
            />
          ) : null}
          {automation.snapshot?.status.events
            .filter(e => e.kind === 'result_corrected')
            .slice(0, 3)
            .map((event, i) => (
              <Res key={event.at + i} kind="y">
                {event.message}
              </Res>
            ))}
          <Row>
            <Btn sm title="Add bonds" onPress={() => setTab('add')} />
            <Btn
              sm
              variant="alt"
              title="Draw status"
              onPress={() => setTab('check')}
            />
          </Row>
          <SearchBar
            value={q}
            onChange={setQ}
            placeholder="Search number, denomination or holder"
          />
        </View>
      }
      renderItem={({ item: b }) => {
        const draws =
          automation.snapshot?.draws.filter(
            draw => draw.denomination === b.d,
          ) ?? [];
        const verified = draws.filter(draw =>
          ['ok', 'ok_manual'].includes(draw.status),
        ).length;
        return (
          <View style={{ paddingVertical: 10 }}>
            <Txt style={{ fontWeight: '700' }}>
              {b.n} · {fmt(b.d)}
            </Txt>
            <Note>{`${verified}/${draws.length} known draws verified · ${
              b.wins.filter(w => !w.provisional).length
            } verified wins${b.st === 'archived' ? ' · Archived' : ''}`}</Note>
            {b.wins.some(w => w.provisional) ? (
              <Badge text="Possible win — verify" />
            ) : null}
            <Btn
              sm
              variant="alt"
              title="View / edit bond"
              onPress={() => setSheet({ kind: 'bond', id: b.id, m: 'view' })}
            />
          </View>
        );
      }}
      ListEmptyComponent={
        <Note>
          {q
            ? 'No bonds match your search.'
            : 'Add your bonds once to check them against stored history.'}
        </Note>
      }
    />
  );
}

export function CloudResultsScreen() {
  const { automation, B, toast } = useApp();
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const wins = B()
    .flatMap(b => b.wins.map(w => ({ b, w })))
    .filter(({ b, w }) => matches(query, b.n, b.d, w.no, w.rank))
    .sort((a, b) => b.w.date.localeCompare(a.w.date));
  return (
    <FlatList
      data={wins}
      keyExtractor={row => row.w.cloudId!}
      contentContainerStyle={{
        padding: 16,
        paddingTop: insets.top + 8,
        paddingBottom: 48,
      }}
      ListHeaderComponent={
        <View>
          <H2>Win History</H2>
          <AutomationStatus />
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search bond or draw"
          />
        </View>
      }
      renderItem={({ item: { b, w } }) => {
        const draw = automation.snapshot?.draws.find(d => d.id === w.drawId);
        const file = automation.snapshot?.files.find(
          f => f.id === draw?.accepted_file_id,
        );
        return (
          <Res kind={w.provisional ? 'y' : 'g'}>
            <Txt style={{ fontWeight: '700' }}>
              {b.n} · {fmt(b.d)}
            </Txt>
            <Txt>{`Draw ${w.no ? '#' + w.no : fd(w.date)} · ${fd(w.date)} · ${
              w.rank
            }`}</Txt>
            <Txt>
              {w.provisional
                ? 'Possible win — please verify on the official site'
                : `Verified win · ${fmt(w.amount)}`}
            </Txt>
            <Note>Prize claim rules: confirm with National Savings.</Note>
            {file && isOfficial(file.url) ? (
              <Btn
                sm
                variant="alt"
                title="Open official file"
                onPress={() =>
                  openOfficial(file.url).catch(error => toast(error.message))
                }
              />
            ) : null}
            {!w.acknowledged ? (
              <Btn
                sm
                title="Mark as seen"
                onPress={() =>
                  automation.api
                    .rpc('acknowledge_win', { p_id: w.cloudId })
                    .then(() => automation.reload())
                    .catch(error => toast(error.message))
                }
              />
            ) : (
              <Note>Seen</Note>
            )}
          </Res>
        );
      }}
      ListEmptyComponent={
        <Note>
          No wins in the stored results. Check the status board for draws still
          awaiting verification.
        </Note>
      }
    />
  );
}

function ReviewModal({
  draw,
  onClose,
}: {
  draw: CloudDraw | null;
  onClose: () => void;
}) {
  const { automation, toast } = useApp();
  const [numbers, setNumbers] = useState('');
  const [note, setNote] = useState('');
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  React.useEffect(() => {
    setNumbers('');
    setNote('');
    setChecked(false);
    if (draw)
      automation.api
        .select<{ number: string; tier: number }>(
          'draw_numbers',
          { draw_id: `eq.${draw.id}`, order: 'tier.asc,number.asc' },
          true,
        )
        .then(rows =>
          setNumbers(rows.map(row => `${row.tier},${row.number}`).join('\n')),
        )
        .catch(error => toast(error.message));
  }, [draw, automation.api, toast]);
  return (
    <Modal visible={!!draw} onRequestClose={onClose} animationType="slide">
      <Page>
        <H2>Review official result</H2>
        <Note>
          Compare the complete list with the official file. Each row is tier
          (1–3), then six-digit number. Manual approval is recorded.
        </Note>
        {draw?.issues.map((issue, i) => (
          <Note key={i}>{issue}</Note>
        ))}
        {draw?.suspects.map((suspect, i) => (
          <Res key={i} kind="y">{`${suspect.token} → ${
            suspect.candidate ?? 'unresolved'
          } (${suspect.tier}, line ${suspect.line})`}</Res>
        ))}
        <Input
          multiline
          numberOfLines={10}
          value={numbers}
          onChangeText={setNumbers}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Label>How did you verify this list?</Label>
        <Input
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Describe the official-file comparison and any corrections"
        />
        <Row>
          <Switch value={checked} onValueChange={setChecked} />
          <Note>I compared the complete list with the official result.</Note>
        </Row>
        <Btn
          title={loading ? 'Saving…' : 'Approve reviewed list'}
          onPress={async () => {
            if (!draw || loading) return;
            if (!checked || note.trim().length < 8)
              return toast(
                'Confirm the comparison and enter a verification note',
              );
            try {
              setLoading(true);
              const rows = numbers
                .split(/\r?\n/)
                .filter(line => line.trim())
                .map(line => {
                  const match = line
                    .trim()
                    .match(/^([123])\s*[,\s]\s*(\d{6})$/);
                  if (!match)
                    throw new Error(
                      'Every row must be tier,number — for example 2,007447',
                    );
                  return { tier: Number(match[1]), number: match[2] };
                });
              await automation.api.invoke('approve-draw', {
                draw_id: draw.id,
                numbers: rows,
                note,
                file_sha256: draw.accepted_sha256,
              });
              await automation.reload();
              onClose();
              toast('Manual verification recorded');
            } catch (error) {
              toast((error as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        />
        <Btn variant="alt" title="Cancel" onPress={onClose} />
      </Page>
    </Modal>
  );
}

function UploadModal({
  draw,
  onClose,
}: {
  draw: CloudDraw | null;
  onClose: () => void;
}) {
  const { automation, toast } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const upload = async (filename: string, data: string) => {
    if (!draw || busy) return;
    setBusy(true);
    try {
      await automation.api.invoke('upload-draw-file', {
        denomination: draw.denomination,
        draw_date: draw.draw_date,
        filename,
        base64: data,
      });
      await automation.reload();
      onClose();
      setText('');
      toast('File uploaded; verification is queued');
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={!!draw} onRequestClose={onClose} animationType="slide">
      <Page>
        <H2>Upload complete result</H2>
        <Note>
          Use the original official file. Leading zeros must stay intact.
          Partial lists remain marked for review.
        </Note>
        {NativeModules.BondFilePicker ? (
          <Btn
            title={busy ? 'Uploading…' : 'Choose TXT, Excel, PDF or Word file'}
            onPress={async () => {
              try {
                const file = await NativeModules.BondFilePicker.pick();
                if (file) await upload(file.name, file.base64);
              } catch (error) {
                toast((error as Error).message);
              }
            }}
          />
        ) : null}
        <Label>Or paste the complete official text</Label>
        <Input
          multiline
          numberOfLines={12}
          value={text}
          onChangeText={setText}
          autoCorrect={false}
        />
        <Btn
          title={busy ? 'Uploading…' : 'Upload pasted result text'}
          onPress={() => {
            if (text.trim()) upload('official-result.txt', base64(utf8(text)));
          }}
        />
        <Btn variant="alt" title="Cancel" onPress={onClose} />
      </Page>
    </Modal>
  );
}

export function DrawStatusScreen() {
  const { automation, toast } = useApp();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [den, setDen] = useState(0);
  const [review, setReview] = useState<CloudDraw | null>(null);
  const [upload, setUpload] = useState<CloudDraw | null>(null);
  const draws =
    automation.snapshot?.draws.filter(
      draw =>
        (!den || draw.denomination === den) &&
        matches(query, draw.draw_no, draw.draw_date, draw.status),
    ) ?? [];
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={draws}
        keyExtractor={draw => draw.id}
        contentContainerStyle={{
          padding: 16,
          paddingTop: insets.top + 8,
          paddingBottom: 48,
        }}
        ListHeaderComponent={
          <View>
            <H2>Draw Status</H2>
            <AutomationStatus />
            <Btn
              title={automation.busy ? 'Working…' : 'Run check now'}
              onPress={() => {
                if (!automation.busy)
                  automation.run().catch(error => toast(error.message));
              }}
            />
            <Select
              value={den}
              onChange={setDen}
              options={[
                { value: 0, label: 'All denominations' },
                ...SUPPORTED_DENOMINATIONS.map(value => ({
                  value,
                  label: fmt(value),
                })),
              ]}
            />
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search draw, date or status"
            />
          </View>
        }
        renderItem={({ item: draw }) => {
          const files =
            automation.snapshot?.files.filter(
              file => file.draw_id === draw.id,
            ) ?? [];
          const verified = ['ok', 'ok_manual'].includes(draw.status);
          return (
            <Res kind={verified ? 'g' : 'y'}>
              <Txt style={{ fontWeight: '700' }}>{`${fmt(
                draw.denomination,
              )} · ${draw.draw_no ? '#' + draw.draw_no + ' · ' : ''}${fd(
                draw.draw_date,
              )}`}</Txt>
              <Badge
                text={
                  draw.status === 'ok_manual'
                    ? 'Manually verified'
                    : draw.status.replace(/_/g, ' ')
                }
              />
              {draw.decision_note ? <Note>{draw.decision_note}</Note> : null}
              <Note>{`Parsed first/second/third: ${
                draw.parsed_counts.first ?? 0
              }/${draw.parsed_counts.second ?? 0}/${
                draw.parsed_counts.third ?? 0
              }`}</Note>
              {draw.issues.map((issue, i) => (
                <Note key={'i' + i}>{issue}</Note>
              ))}
              {draw.warnings.map((warning, i) => (
                <Note key={'w' + i}>{warning}</Note>
              ))}
              {files
                .filter(file => isOfficial(file.url))
                .map(file => (
                  <Btn
                    key={file.id}
                    sm
                    variant="alt"
                    title={`Open official ${file.kind.toUpperCase()} · ${
                      file.parse_status
                    }`}
                    onPress={() =>
                      openOfficial(file.url).catch(error =>
                        toast(error.message),
                      )
                    }
                  />
                ))}
              {!verified ? (
                <Row>
                  <Btn
                    sm
                    variant="alt"
                    title="Upload file"
                    onPress={() => setUpload(draw)}
                  />
                  <Btn sm title="Review" onPress={() => setReview(draw)} />
                </Row>
              ) : null}
            </Res>
          );
        }}
        ListEmptyComponent={
          <Note>
            No draws found. Start discovery; an empty list does not mean the
            bonds have been checked.
          </Note>
        }
      />
      <ReviewModal draw={review} onClose={() => setReview(null)} />
      <UploadModal draw={upload} onClose={() => setUpload(null)} />
    </View>
  );
}

function MigrationPanel() {
  const { automation, legacyDb, toast } = useApp();
  const options = Object.entries(legacyDb?.groups ?? {}).map(
    ([value, workspace]) => ({ value, label: workspace.name }),
  );
  const [workspace, setWorkspace] = useState(options[0]?.value ?? '');
  const [backupReady, setBackupReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(
    () =>
      legacyDb
        ? migrationPreview(legacyDb, workspace, automation.snapshot?.bonds)
        : null,
    [legacyDb, workspace, automation.snapshot],
  );
  const backup = async () => {
    if (!legacyDb || !automation.session) return;
    setBusy(true);
    try {
      const json = JSON.stringify(
        {
          version: 1,
          workspace,
          name: legacyDb.groups[workspace].name,
          bonds: legacyDb.groups[workspace].bonds,
        },
        null,
        2,
      );
      const stamp = Date.now();
      await AsyncStorage.setItem(`bondcheck.backup.${stamp}`, json);
      await Share.open({
        url: 'data:application/json;base64,' + base64(utf8(json)),
        type: 'application/json',
        filename: 'bondcheck-before-cloud',
        failOnCancel: true,
      });
      await automation.api.request(
        `/storage/v1/object/bond-backups/${automation.session.user.id}/${stamp}.json`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-upsert': 'false' },
          body: json,
        },
      );
      setBackupReady(true);
      toast('Backup created. Original local data is retained.');
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View>
      <H2>Upload old data</H2>
      <Note>
        Select a local workspace. Review invalid rows and duplicates before
        uploading. Demo workspaces are included only if you select them.
      </Note>
      {options.length ? (
        <Select
          value={workspace}
          options={options}
          onChange={value => {
            setWorkspace(value);
            setBackupReady(false);
          }}
        />
      ) : (
        <Note>No local workspace found.</Note>
      )}
      {preview ? (
        <>
          <Note>{`${preview.valid.length} valid · ${preview.invalid.length} invalid · ${preview.duplicates.length} already present / duplicates`}</Note>
          {Object.entries(preview.counts).map(([den, count]) => (
            <Note key={den}>{`${fmt(den)}: ${count}`}</Note>
          ))}
          {preview.invalid.map(row => (
            <Res key={row.id} kind="r">{`${row.number}: ${row.reason}`}</Res>
          ))}
          {preview.duplicates.length ? (
            <Note>{`Duplicates retained in the backup: ${preview.duplicates
              .map(row => row.number)
              .join(', ')}`}</Note>
          ) : null}
          <Btn
            variant="alt"
            title={busy ? 'Working…' : '1. Create and export backup'}
            onPress={() => {
              if (!busy) backup();
            }}
          />
          <Btn
            title={`2. Upload ${preview.valid.length} valid bonds`}
            onPress={async () => {
              if (busy) return;
              if (!backupReady)
                return toast('Create and export the backup first');
              if (!preview.valid.length)
                return toast('No new valid rows to upload');
              setBusy(true);
              try {
                await automation.api.request(
                  '/rest/v1/bonds?on_conflict=owner_id%2Clegacy_id',
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Prefer: 'resolution=ignore-duplicates',
                    },
                    body: JSON.stringify(
                      preview.valid.map(row => ({
                        ...row.bond,
                        legacy_id: row.legacy_id,
                      })),
                    ),
                  },
                );
                await automation.reload();
                setBackupReady(false);
                toast(
                  'Valid bonds uploaded. Invalid rows remain in your backup and local data.',
                );
              } catch (error) {
                toast((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      ) : null}
    </View>
  );
}

export function CloudSettingsScreen() {
  const { automation, toast, big, setBig, setTab } = useApp();
  const heartbeat = automation.snapshot?.status.heartbeat;
  return (
    <Page>
      <H2>Settings</H2>
      <SummaryBlock onWins={() => setTab('results')} />
      <AutomationStatus />
      <Note>{`Signed in: ${automation.session?.user.email ?? ''}`}</Note>
      <Note>{`Last heartbeat: ${heartbeat?.last_beat ?? 'Not received'}`}</Note>
      <Note>{`Last successful discovery: ${
        heartbeat?.last_discovery_ok ?? 'Never'
      }`}</Note>
      <Note>{`Last result ingestion: ${
        heartbeat?.last_ingest_ok ?? 'Never'
      }`}</Note>
      <Note>Parser v2 · Bond Check automation v1</Note>
      <Note>
        Only draws strictly after the entered purchase date are eligible. Older
        matches are not counted as your wins.
      </Note>
      <Btn
        title="Run check now"
        onPress={() => automation.run().catch(error => toast(error.message))}
      />
      <Btn
        variant="alt"
        title="Run full historical backfill"
        onPress={() =>
          automation.run('backfill').catch(error => toast(error.message))
        }
      />
      <Btn
        variant="alt"
        title="Retry failed jobs"
        onPress={() =>
          automation.run('retry').catch(error => toast(error.message))
        }
      />
      <Btn
        variant="alt"
        title="Export cloud backup"
        onPress={async () => {
          try {
            const json = JSON.stringify(
              {
                app: 'bondcheck-cloud',
                version: 1,
                exported: new Date().toISOString(),
                snapshot: automation.snapshot,
              },
              null,
              2,
            );
            await Share.open({
              url: 'data:application/json;base64,' + base64(utf8(json)),
              type: 'application/json',
              filename: 'bondcheck-cloud-backup',
              failOnCancel: false,
            });
          } catch (error) {
            toast((error as Error).message);
          }
        }}
      />
      <MigrationPanel />
      <BackupRestore />
      <H2>Recently deleted</H2>
      {automation.snapshot?.trash.map(bond => (
        <View key={bond.id}>
          <Note>
            {bond.n} · {fmt(bond.d)}
          </Note>
          <Btn
            variant="alt"
            title="Restore bond"
            onPress={() =>
              automation.repository
                .update(bond, { deleted_at: null })
                .then(() => automation.reload())
                .catch(error => toast(error.message))
            }
          />
        </View>
      ))}
      <Row>
        <Label>Large text</Label>
        <Switch value={big} onValueChange={setBig} />
      </Row>
      <Btn variant="red" title="Log out" onPress={() => automation.signOut()} />
    </Page>
  );
}
