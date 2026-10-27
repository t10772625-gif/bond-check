import React, { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Avatar,
  Badge,
  BondRow,
  Btn,
  DateInput,
  DH,
  FullModal,
  H2,
  Input,
  Label,
  Note,
  Row,
  SearchBar,
  Select,
  Seg,
  Stat,
  StatGrid,
  Txt,
  matches,
} from '../components/ui';
import { useApp } from '../store/AppStore';
import type { Rank, Role } from '../types';
import { fonts, useTheme } from '../theme';
import { DEN, commas, fd, fmt } from '../utils';
import { AutomationStatus } from '../cloud/CloudScreens';
import { DenomTable } from './HomeScreen';

/** Lists with more than this many rows get a search box. */
const SEARCH_MIN = 4;

export function WorkspaceRows() {
  const { U, db, curCode, swTo } = useApp();
  const { c } = useTheme();
  const [wq, setWq] = useState('');
  if (!U) return null;
  const list = U.ws.filter(
    code => db.groups[code] && matches(wq, db.groups[code].name, code),
  );
  return (
    <>
      {U.ws.length >= SEARCH_MIN ? (
        <SearchBar
          value={wq}
          onChange={setWq}
          placeholder="Search workspaces"
        />
      ) : null}
      {list.map(code => {
        const g = db.groups[code];
        const on = code === curCode;
        return (
          <Pressable
            key={code}
            onPress={() => swTo(code)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: c.surf,
              borderWidth: 2,
              borderColor: on ? c.em : c.line,
              borderRadius: 16,
              padding: 12,
              marginVertical: 6,
            }}
          >
            <Avatar text={g.personal ? '👤' : '👪'} color={c.gold} />
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '700' }}>{g.name}</Txt>
              <Txt style={{ fontSize: 12, color: c.mut }}>
                {g.personal ? 'Personal' : 'Shared'} ·{' '}
                {g.bonds.filter(b => b.st === 'active').length} bonds ·{' '}
                {g.members.length} member{g.members.length > 1 ? 's' : ''}
              </Txt>
            </View>
            {on ? <Badge kind="w" text="Open" /> : <Badge text="Switch" />}
          </Pressable>
        );
      })}
      {wq && !list.length ? <Note>No workspace matches “{wq}”.</Note> : null}
    </>
  );
}

/* ---------- full-screen searchable lists ---------- */
function WinsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { summary, setSheet, ver } = useApp();
  const { c } = useTheme();
  const [wq, setWq] = useState('');
  const dq = useDeferredValue(wq);
  const s = summary();
  const list = useMemo(
    () =>
      s.W.filter(x =>
        matches(
          dq,
          x.b.n,
          x.b.holder,
          '#' + x.w.no,
          x.w.rank,
          x.w.claim ? 'claimed' : 'pending',
        ),
      ),
    // Legacy portfolio arrays are mutable; ver/visible refresh the displayed snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dq, ver, visible],
  );
  return (
    <FullModal
      visible={visible}
      onClose={onClose}
      title="Every win"
      subtitle={`${s.W.length} wins · ${fmt(s.gross)} gross`}
    >
      <View style={{ paddingHorizontal: 16 }}>
        <SearchBar
          value={wq}
          onChange={setWq}
          placeholder="Search number, holder, draw #, pending…"
          count={`${list.length} shown`}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={x => x.b.id + '-' + x.i}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        renderItem={({ item: x }) => (
          <BondRow
            title={x.b.n}
            sub={`Draw #${x.w.no} · ${x.w.rank} · ${fd(x.w.date)}`}
            onPress={() => {
              onClose();
              setSheet({ kind: 'bond', id: x.b.id, m: 'view' });
            }}
            right={
              <View style={{ alignItems: 'flex-end' }}>
                <Txt style={{ fontWeight: '700', fontSize: 14 }}>
                  {fmt(x.a)}
                </Txt>
                <Txt
                  style={{ fontSize: 12, color: x.w.claim ? c.grn : c.gold }}
                >
                  {x.w.claim
                    ? 'Received ' + fmt(x.w.claim.rcv)
                    : 'Claim pending'}
                </Txt>
              </View>
            }
          />
        )}
        ListEmptyComponent={
          <Note>{dq ? `No win matches “${dq}”.` : 'No wins yet.'}</Note>
        }
      />
    </FullModal>
  );
}

function TrashModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { cur, restoreBond, emptyTrash, ver, confirm } = useApp();
  const { c } = useTheme();
  const [tq, setTq] = useState('');
  const dq = useDeferredValue(tq);
  const list = useMemo(
    () =>
      cur ? cur.trash.filter(b => matches(dq, b.n, b.holder, b.note)) : [],
    // Legacy trash can be changed in place; ver/visible intentionally invalidate this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dq, ver, cur, visible],
  );
  if (!cur) return null;
  return (
    <FullModal
      visible={visible}
      onClose={onClose}
      title="Recently deleted"
      subtitle={`${cur.trash.length} bonds · restore checks for duplicates`}
      footer={
        cur.trash.length ? (
          <Btn
            variant="red"
            title="Empty trash"
            onPress={() =>
              confirm({
                icon: '🗑',
                title: 'Empty trash?',
                message: `${cur.trash.length} bonds will be deleted for good. This cannot be undone.`,
                buttons: [
                  {
                    text: 'Delete for good',
                    style: 'red',
                    onPress: () => {
                      emptyTrash();
                      onClose();
                    },
                  },
                  { text: 'Cancel', style: 'alt' },
                ],
              })
            }
          />
        ) : undefined
      }
    >
      <View style={{ paddingHorizontal: 16 }}>
        <SearchBar
          value={tq}
          onChange={setTq}
          placeholder="Search deleted bonds"
          count={`${list.length} shown`}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={b => String(b.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        renderItem={({ item: b }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: c.line,
            }}
          >
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: fonts.mono, fontWeight: '700' }}>
                {b.n}
              </Txt>
              <Txt style={{ fontSize: 12, color: c.mut }}>
                {fmt(b.d)}
                {b.holder ? ' · ' + b.holder : ''} · {b.wins.length} win
                {b.wins.length === 1 ? '' : 's'}
              </Txt>
            </View>
            <Btn
              sm
              flexNone
              variant="alt"
              title="Restore"
              onPress={() => restoreBond(b.id)}
            />
          </View>
        )}
        ListEmptyComponent={
          <Note>{dq ? `Nothing matches “${dq}”.` : 'Trash is empty.'}</Note>
        }
      />
    </FullModal>
  );
}

export function SummaryBlock({ onWins }: { onWins: () => void }) {
  const { summary, cur, db, automation, B } = useApp();
  if (!cur) return null;
  const s = summary();
  return (
    <>
      <DH>📊 My summary — {cur.name}</DH>
      <StatGrid>
        <Stat
          label="Bonds bought"
          value={s.bought}
          sub={`${fmt(s.boughtVal)} total value`}
        />
        <Stat
          label="Held now"
          value={s.act.length}
          sub={`${fmt(s.heldVal)} · ${
            s.bought - s.act.length
          } cashed / archived`}
        />
        <Stat
          label="Total won (gross)"
          value={fmt(s.gross)}
          sub={`${s.W.length} wins on ${s.uniq} bonds`}
        />
        {automation.configured ? (
          <Stat
            label="Possible wins"
            value={
              B()
                .flatMap(b => b.wins)
                .filter(w => w.provisional).length
            }
            sub="excluded from verified totals"
          />
        ) : (
          <Stat
            label={`After tax (${db.filer ? '15%' : '35%'})`}
            value={fmt(s.net)}
            sub="estimated"
          />
        )}
        <Stat
          label="Received so far"
          value={fmt(s.rcv)}
          sub={`${s.W.length - s.pn} claimed`}
        />
        <Stat
          label="Still to claim"
          value={fmt(
            automation.configured
              ? s.W.filter(x => !x.w.claim).reduce((total, x) => total + x.a, 0)
              : s.pnet,
          )}
          sub={`${s.pn} win${s.pn === 1 ? '' : 's'}${
            automation.configured ? ' · gross' : ''
          }`}
        />
      </StatGrid>
      <DenomTable by={s.by} />
      <Btn
        variant="alt"
        title={`🏆 Every win (${s.W.length}) ›`}
        onPress={onWins}
      />
    </>
  );
}

function PrizeInput({ d, r }: { d: number; r: Rank }) {
  const { db, setPrize } = useApp();
  const init = (db.PRIZE[d] || {})[r];
  const [v, setV] = useState(init ? String(init) : '');
  return (
    <Input
      style={{
        flex: 1,
        paddingVertical: 7,
        paddingHorizontal: 7,
        fontSize: 12,
      }}
      keyboardType="number-pad"
      placeholder="—"
      value={v}
      onChangeText={setV}
      onEndEditing={() => {
        if (String(init || '') !== v) setPrize(d, r, v);
      }}
    />
  );
}

export default function SettingsScreen() {
  const app = useApp();
  const {
    U,
    cur,
    curCode,
    db,
    role,
    joinNow,
    copyText,
    regen,
    setRole,
    rmMember,
    leaveWs,
    tgSched,
    rmSched,
    addSched,
    setFiler,
    big,
    setBig,
    setSheet,
    resetAll,
    confirm,
    bioAvail,
    bioUser,
    bioBusy,
    enableBio,
    disableBio,
    bioName,
  } = app;
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [jc, setJc] = useState('');
  const [sd, setSd] = useState(750);
  const [st, setSt] = useState('');
  const [sc, setSc] = useState('');
  const [mq, setMq] = useState('');
  const [schq, setSchq] = useState('');
  const [winsOpen, setWinsOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  if (!U || !cur || !curCode) return null;

  const own = role() === 'Owner';
  const sched = db.SCHED.slice().sort((a, b) => a.date.localeCompare(b.date));
  const schedShown = sched.filter(x =>
    matches(schq, fmt(x.den), x.den, fd(x.date), x.city),
  );
  const members = cur.members.filter(x => matches(mq, x.name, x.id, x.role));

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: insets.top + 8,
        paddingBottom: 48,
      }}
    >
      <H2>Settings</H2>
      <AutomationStatus />
      <View
        style={{
          backgroundColor: c.surf,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 14,
          marginVertical: 6,
          paddingHorizontal: 12,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Avatar text={U.name[0].toUpperCase()} />
        <View style={{ flex: 1 }}>
          <Txt style={{ fontWeight: '700' }}>{U.name}</Txt>
          <Txt style={{ fontSize: 12, color: c.mut }}>
            {U.id} · {role()}
          </Txt>
        </View>
      </View>

      <SummaryBlock onWins={() => setWinsOpen(true)} />

      <DH>My workspaces</DH>
      <WorkspaceRows />
      <Label>Join another workspace with a code</Label>
      <Row>
        <Input
          style={{ flex: 1 }}
          value={jc}
          onChangeText={setJc}
          placeholder="BOND-XXXXX"
          upper
          mono
          autoCorrect={false}
        />
        <Btn
          sm
          flexNone
          title="Join"
          onPress={() => joinNow(jc) && setJc('')}
        />
      </Row>

      <DH>Invite people to “{cur.name}”</DH>
      <View
        style={{
          backgroundColor: c.grey,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: c.gold,
          borderRadius: 14,
          padding: 12,
          marginVertical: 8,
        }}
      >
        <Txt
          selectable
          style={{
            fontFamily: fonts.mono,
            fontWeight: '800',
            fontSize: 24,
            letterSpacing: 3,
            textAlign: 'center',
          }}
        >
          {curCode}
        </Txt>
      </View>
      <Note>
        Share this code. People who join get this workspace in addition to their
        own personal one, with Editor rights by default.
      </Note>
      <Row>
        <Btn
          sm
          variant="alt"
          title="📋 Copy code"
          onPress={() => copyText(curCode, 'Code copied: ' + curCode)}
        />
        {own ? (
          <Btn
            sm
            variant="alt"
            title="🔄 New code"
            onPress={() =>
              confirm({
                icon: '🔄',
                title: 'Make a new invite code?',
                message: `The old code ${curCode} will stop working. People already in the workspace stay.`,
                buttons: [
                  { text: 'Make new code', style: 'primary', onPress: regen },
                  { text: 'Cancel', style: 'alt' },
                ],
              })
            }
          />
        ) : null}
      </Row>

      <DH>Members ({cur.members.length})</DH>
      {cur.members.length >= SEARCH_MIN ? (
        <SearchBar value={mq} onChange={setMq} placeholder="Search members" />
      ) : null}
      {members.map(x => (
        <View
          key={x.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
          }}
        >
          <Avatar text={x.name[0].toUpperCase()} />
          <Txt style={{ flex: 1, fontWeight: '700' }}>{x.name}</Txt>
          {own && x.role !== 'Owner' ? (
            <>
              <Select<Role>
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  minWidth: 100,
                }}
                value={x.role}
                options={[
                  { value: 'Editor', label: 'Editor' },
                  { value: 'Viewer', label: 'Viewer' },
                ]}
                onChange={r => setRole(x.id, r)}
              />
              <Pressable
                onPress={() =>
                  confirm({
                    icon: '👤',
                    title: `Remove ${x.name}?`,
                    message: `${x.name} will lose access to “${cur.name}”.`,
                    buttons: [
                      {
                        text: 'Remove member',
                        style: 'red',
                        onPress: () => rmMember(x.id),
                      },
                      { text: 'Cancel', style: 'alt' },
                    ],
                  })
                }
                hitSlop={8}
              >
                <Txt style={{ color: c.red, fontSize: 18 }}>✕</Txt>
              </Pressable>
            </>
          ) : (
            <Badge text={x.role} />
          )}
        </View>
      ))}
      {mq && !members.length ? <Note>No member matches “{mq}”.</Note> : null}
      {!cur.personal && !own ? (
        <Btn
          variant="alt"
          title="Leave this workspace"
          onPress={() =>
            confirm({
              icon: '🚪',
              title: `Leave “${cur.name}”?`,
              message: 'You will need a new invite code to join again.',
              buttons: [
                { text: 'Leave workspace', style: 'red', onPress: leaveWs },
                { text: 'Cancel', style: 'alt' },
              ],
            })
          }
        />
      ) : null}

      <DH>Draw schedule & reminders</DH>
      {sched.length >= SEARCH_MIN ? (
        <SearchBar
          value={schq}
          onChange={setSchq}
          placeholder="Search schedule (amount, month, city)"
        />
      ) : null}
      {schedShown.map(x => (
        <View
          key={x.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
          }}
        >
          <Txt style={{ flex: 1, fontSize: 14 }}>
            <Txt style={{ fontWeight: '700', fontSize: 14 }}>{fmt(x.den)}</Txt>{' '}
            · {fd(x.date)}
            {x.city ? ' · ' + x.city : ''}
          </Txt>
          <Badge
            kind={x.remind ? 'w' : ''}
            text={x.remind ? '🔔 On' : '🔕 Off'}
            onPress={() => tgSched(x.id)}
          />
          <Pressable onPress={() => rmSched(x.id)} hitSlop={8}>
            <Txt style={{ color: c.red, fontSize: 18 }}>✕</Txt>
          </Pressable>
        </View>
      ))}
      {!sched.length ? <Note>No upcoming draws added.</Note> : null}
      <Row>
        <Select
          style={{ flex: 1 }}
          value={sd}
          options={DEN.map(d => ({ value: d, label: fmt(d) }))}
          onChange={setSd}
        />
        <DateInput
          style={{ flex: 1 }}
          value={st}
          onChange={setSt}
          placeholder="Draw date"
        />
      </Row>
      <Row>
        <Input
          style={{ flex: 1 }}
          value={sc}
          onChangeText={setSc}
          placeholder="City (optional)"
        />
        <Btn
          sm
          flexNone
          title="Add"
          onPress={() => {
            if (addSched(sd, st, sc)) {
              setSt('');
              setSc('');
            }
          }}
        />
      </Row>
      <Note>
        Add dates from the official National Savings schedule. Reminders appear
        on Home during the final week.
      </Note>

      <DH>Tax status</DH>
      <Seg<'f' | 'n'>
        options={[
          ['f', 'Filer (15%)'],
          ['n', 'Non-filer (35%)'],
        ]}
        value={db.filer ? 'f' : 'n'}
        onChange={k => setFiler(k === 'f')}
      />

      <DH>Prize amounts (gross)</DH>
      <View style={{ flexDirection: 'row', gap: 6, marginVertical: 6 }}>
        <View style={{ width: 70 }} />
        {['1st', '2nd', '3rd'].map(r => (
          <Txt key={r} style={{ flex: 1, fontSize: 13, fontWeight: '700' }}>
            {r}
          </Txt>
        ))}
      </View>
      {DEN.map(d => (
        <View
          key={d}
          style={{
            flexDirection: 'row',
            gap: 6,
            alignItems: 'center',
            marginVertical: 6,
          }}
        >
          <Txt style={{ width: 70, fontSize: 13, fontWeight: '700' }}>
            {commas(d)}
          </Txt>
          {(['1st', '2nd', '3rd'] as Rank[]).map(r => (
            <PrizeInput key={r} d={d} r={r} />
          ))}
        </View>
      ))}
      <Note>
        Rs. 750 and Rs. 1,500 are pre-filled. For the others, enter the amounts
        from the National Savings schedule; blank counts as Rs. 0.
      </Note>

      <DH>Recently deleted</DH>
      <Btn
        variant="alt"
        title={`🗑 Recently deleted (${cur.trash.length}) ›`}
        onPress={() => setTrashOpen(true)}
      />

      <DH>Security</DH>
      {(() => {
        const mine = bioUser === U.id;
        const other = bioUser && !mine ? bioUser : null;
        const status = !bioAvail
          ? 'Not available: this phone has no fingerprint set up. Add one in phone Settings → Security, then come back.'
          : mine
          ? `On — the app asks for your ${bioName()} when it opens and on the login screen.`
          : other
          ? `Off for you. Currently used by ${other} on this phone; turning it on replaces that.`
          : `Off — turn on to log in with your ${bioName()} instead of your password.`;
        const toggle = (v: boolean) => {
          if (bioBusy) return;
          if (v) {
            if (other)
              confirm({
                icon: '👆',
                title: 'Replace fingerprint login?',
                message: `Fingerprint login on this phone is set up for ${other}. Turning it on for you will remove it for them.`,
                buttons: [
                  {
                    text: 'Turn on for me',
                    style: 'primary',
                    onPress: () => enableBio(),
                  },
                  { text: 'Cancel', style: 'alt' },
                ],
              });
            else enableBio();
          } else
            confirm({
              icon: '🔓',
              title: `Turn off ${bioName()} login?`,
              message:
                'You will need your password to log in. You can turn it on again any time.',
              buttons: [
                { text: 'Turn off', style: 'red', onPress: disableBio },
                { text: 'Keep it on', style: 'alt' },
              ],
            });
        };
        return (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: c.surf,
              borderWidth: 1,
              borderColor: mine ? c.em : c.line,
              borderRadius: 14,
              paddingVertical: 10,
              paddingHorizontal: 12,
              marginTop: 6,
            }}
          >
            <Txt style={{ fontSize: 24 }}>👆</Txt>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '700' }}>Fingerprint login</Txt>
              <Txt
                style={{
                  fontSize: 12,
                  color: !bioAvail ? c.red : mine ? c.grn : c.mut,
                }}
              >
                {status}
              </Txt>
            </View>
            <Switch
              value={mine}
              disabled={!bioAvail || bioBusy}
              onValueChange={toggle}
              trackColor={{ true: c.em2, false: c.line }}
              thumbColor={mine ? c.em : '#f4f3f4'}
            />
          </View>
        );
      })()}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: c.surf,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 14,
          paddingVertical: 8,
          paddingHorizontal: 12,
          marginTop: 14,
        }}
      >
        <View style={{ flex: 1 }}>
          <Txt style={{ fontWeight: '700' }}>Large text</Txt>
          <Txt style={{ fontSize: 12, color: c.mut }}>Saved on this phone</Txt>
        </View>
        <Switch
          value={big}
          onValueChange={setBig}
          trackColor={{ true: c.em2, false: c.line }}
          thumbColor={big ? c.em : '#f4f3f4'}
        />
      </View>

      <Btn
        variant="alt"
        title="Export & back up data"
        onPress={() => setSheet({ kind: 'export' })}
      />
      <Btn
        variant="red"
        title="Log out"
        onPress={() => setSheet({ kind: 'logout' })}
      />
      <Btn variant="alt" title="Reset prototype data" onPress={resetAll} />

      <WinsModal visible={winsOpen} onClose={() => setWinsOpen(false)} />
      <TrashModal visible={trashOpen} onClose={() => setTrashOpen(false)} />
    </ScrollView>
  );
}
