import React, { useState } from 'react';
import { Share, View } from 'react-native';
import {
  Badge,
  BottomSheet,
  Btn,
  DateInput,
  Input,
  KV,
  Label,
  Note,
  Row,
  SearchBar,
  Select,
  Txt,
  matches,
  useField,
} from '../components/ui';
import { useApp } from '../store/AppStore';
import { WorkspaceRows } from '../screens/SettingsScreen';
import { fonts, useTheme } from '../theme';
import type { Bond, SheetState } from '../types';
import { DEN, fd, fmt, today } from '../utils';
import type { ImportDraft } from '../store/AppStore';

const denOptions = DEN.map(d => ({ value: d, label: fmt(d) }));

function Title({
  children,
  serif,
}: {
  children: React.ReactNode;
  serif?: boolean;
}) {
  return (
    <Txt
      style={{
        fontFamily: serif ? fonts.serif : fonts.mono,
        fontWeight: '700',
        fontSize: 22,
        marginBottom: 6,
      }}
    >
      {children}
    </Txt>
  );
}

/* ---------- Bond sheet: view ---------- */
function BondView({ b }: { b: Bond }) {
  const { badge, amt, setSheet, arch, automation } = useApp();
  const { c } = useTheme();
  const [st, k] = badge(b);
  const open = (m: 'renew' | 'edit' | 'del') =>
    setSheet({ kind: 'bond', id: b.id, m });
  const [hq, setHq] = useState('');
  const wins = b.wins
    .map((w, i) => ({ w, i }))
    .filter(({ w }) =>
      matches(
        hq,
        '#' + w.no,
        w.rank,
        fd(w.date),
        w.claim ? 'claimed' : 'pending',
      ),
    );
  return (
    <>
      <Title>{b.n}</Title>
      <Badge text={st} kind={k} />
      <View style={{ height: 6 }} />
      <KV k="Denomination" v={fmt(b.d)} />
      <KV k="Purchase / renewal date" v={fd(b.date)} />
      <KV k="Holder" v={b.holder || '—'} />
      <KV k="Series" v={b.series || '—'} />
      <KV k="Note / location" v={b.note || '—'} />
      <KV k="Added by" v={b.by || '—'} />
      <Txt
        style={{
          fontFamily: fonts.serif,
          fontWeight: '700',
          fontSize: 15,
          color: c.gold,
          marginTop: 16,
          marginBottom: 4,
        }}
      >
        Win history ({b.wins.length})
      </Txt>
      {b.wins.length >= 4 ? (
        <SearchBar
          value={hq}
          onChange={setHq}
          placeholder="Search draw #, rank, pending…"
        />
      ) : null}
      {wins.map(({ w, i }) => (
        <View
          key={i}
          style={{
            backgroundColor: c.surf,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: 12,
            paddingVertical: 8,
            paddingHorizontal: 10,
            marginVertical: 6,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <View style={{ flex: 1 }}>
            <Txt style={{ fontWeight: '700', fontSize: 13 }}>
              Draw #{w.no} · {fd(w.date)}
            </Txt>
            <Txt style={{ fontSize: 13 }}>
              {w.provisional
                ? 'Possible win — please verify on the official site'
                : `${w.rank} · ${fmt(amt(b, w))}`}
              {!automation.configured && !w.provisional
                ? ` · ${
                    w.date <= (b.date || '') ? 'renewed ✓' : 'renew needed'
                  }`
                : ''}
            </Txt>
            {w.claim ? (
              <Txt style={{ fontSize: 13 }}>
                Claimed {fd(w.claim.date)} · received {fmt(w.claim.rcv)}
              </Txt>
            ) : null}
          </View>
          {!w.provisional ? (
            <Btn
              sm
              flexNone
              variant="alt"
              title={w.claim ? 'Edit claim' : 'Claim'}
              onPress={() =>
                setSheet({ kind: 'bond', id: b.id, m: 'claim', wi: i })
              }
            />
          ) : null}
        </View>
      ))}
      {!b.wins.length ? <Note>No wins yet.</Note> : null}
      {automation.configured ? (
        <Note>Prize claim rules: confirm with National Savings.</Note>
      ) : null}
      <Row>
        <Btn sm title="🔁 Renew" onPress={() => open('renew')} />
        <Btn sm variant="alt" title="✏️ Edit" onPress={() => open('edit')} />
      </Row>
      <Row>
        <Btn
          sm
          variant="alt"
          title={b.st === 'active' ? '💰 Mark as cashed' : '↩ Restore'}
          onPress={() => arch(b.id)}
        />
        <Btn sm variant="red" title="🗑 Delete" onPress={() => open('del')} />
      </Row>
      <Btn variant="alt" title="Close" onPress={() => setSheet(null)} />
    </>
  );
}

/* ---------- Bond sheet: claim ---------- */
function BondClaim({ b, wi }: { b: Bond; wi: number }) {
  const { amt, rate, saveClaim, setSheet, automation } = useApp();
  const w = b.wins[wi];
  const net = Math.round(amt(b, w) * rate());
  const [date, setDate] = useField(w.claim ? w.claim.date : today());
  const [rcv, setRcv] = useField(
    w.claim ? String(w.claim.rcv) : automation.configured ? '' : String(net),
  );
  return (
    <>
      <Title>Claim · {b.n}</Title>
      <Note>
        {`Draw #${w.no} · ${w.rank} prize · ${fmt(amt(b, w))} gross${
          automation.configured
            ? ' · enter the amount actually received'
            : ' · about ' + fmt(net) + ' after tax'
        }`}
      </Note>
      <Label>Claim date</Label>
      <DateInput value={date} onChange={setDate} allowEmpty={false} />
      <Label>Amount actually received (Rs.)</Label>
      <Input value={rcv} onChangeText={setRcv} keyboardType="number-pad" />
      <Btn
        title="Save claim"
        onPress={() => saveClaim(b.id, wi, { date, rcv: +rcv || 0 })}
      />
      {w.claim ? (
        <Btn
          variant="alt"
          title="Mark as not claimed"
          onPress={() => saveClaim(b.id, wi, null)}
        />
      ) : null}
      <Btn
        variant="alt"
        title="Back"
        onPress={() => setSheet({ kind: 'bond', id: b.id, m: 'view' })}
      />
    </>
  );
}

/* ---------- Bond sheet: renew ---------- */
function BondRenew({ b }: { b: Bond }) {
  const { renew, setSheet, automation } = useApp();
  const [date, setDate] = useField(today());
  return (
    <>
      <Title>Renew {b.n}</Title>
      <Note>
        {automation.configured
          ? 'This changes the holding-period start date. Only later draws will count; earlier matches will be removed. Keep the original purchase date if ownership has continued.'
          : 'The local checker only counts draws at least 60 days after this date.'}
      </Note>
      <Label>Renewal date</Label>
      <DateInput value={date} onChange={setDate} allowEmpty={false} />
      <Btn title="Confirm renewal" onPress={() => renew(b.id, date)} />
      <Btn
        variant="alt"
        title="Back"
        onPress={() => setSheet({ kind: 'bond', id: b.id, m: 'view' })}
      />
    </>
  );
}

/* ---------- Bond sheet: edit ---------- */
function BondEdit({ b }: { b: Bond }) {
  const { saveEdit, setSheet } = useApp();
  const [n, setN] = useField(b.n);
  const [d, setD] = useField(b.d);
  const [date, setDate] = useField(b.date || '');
  const [holder, setHolder] = useField(b.holder || '');
  const [series, setSeries] = useField(b.series || '');
  const [note, setNote] = useField(b.note || '');
  return (
    <>
      <Title serif>Edit bond</Title>
      <Label>Number</Label>
      <Input value={n} onChangeText={setN} upper mono autoCorrect={false} />
      <Label>Denomination</Label>
      <Select value={d} options={denOptions} onChange={setD} />
      <Label>Purchase / renewal date (empty if unknown)</Label>
      <DateInput value={date} onChange={setDate} placeholder="Date unknown" />
      <Label>Holder</Label>
      <Input
        value={holder}
        onChangeText={setHolder}
        placeholder="Whose bond is this?"
      />
      <Label>Series</Label>
      <Input value={series} onChangeText={setSeries} />
      <Label>Note / location</Label>
      <Input
        value={note}
        onChangeText={setNote}
        placeholder="e.g. Almirah, file 3"
      />
      <Btn
        title="Save changes"
        onPress={() => saveEdit(b.id, { n, d, date, holder, series, note })}
      />
      <Btn
        variant="alt"
        title="Back"
        onPress={() => setSheet({ kind: 'bond', id: b.id, m: 'view' })}
      />
    </>
  );
}

/* ---------- Bond sheet: delete ---------- */
function BondDelete({ b }: { b: Bond }) {
  const { del, setSheet } = useApp();
  return (
    <>
      <Title>Delete {b.n}?</Title>
      <Note style={{ fontSize: 14 }}>
        Use this for entries added by mistake. Its win history ({b.wins.length})
        goes with it, but you can undo right after, or restore it later from
        Settings → Recently deleted. If you only cashed it in, “Mark as cashed”
        is the better choice.
      </Note>
      <Btn variant="red" title="Yes, delete" onPress={() => del(b.id)} />
      <Btn
        variant="alt"
        title="Cancel"
        onPress={() => setSheet({ kind: 'bond', id: b.id, m: 'view' })}
      />
    </>
  );
}

/* ---------- Workspaces ---------- */
function WorkspaceSheet() {
  const { setSheet, setTab } = useApp();
  return (
    <>
      <Title serif>Workspaces</Title>
      <Note>Each workspace keeps its own bonds and wins.</Note>
      <WorkspaceRows />
      <Btn
        variant="alt"
        title="＋ Join with an invite code"
        onPress={() => {
          setSheet(null);
          setTab('set');
        }}
      />
      <Btn variant="alt" title="Close" onPress={() => setSheet(null)} />
    </>
  );
}

/* ---------- Import draw (draft kept in the store until saved or cleared) ---------- */
function ImportSheet() {
  const { cden, saveDraw, setSheet, importDraft, setImportDraft, emptyImport } =
    useApp();
  const f = importDraft || emptyImport(cden);
  const set = (patch: Partial<ImportDraft>) =>
    setImportDraft({ ...f, ...patch });
  const total = [f.r1, f.r2, f.r3]
    .join(' ')
    .split(/[\s,;]+/)
    .filter(Boolean).length;
  return (
    <>
      <Title serif>Import draw results</Title>
      <Note>
        Copy the winning numbers from the official National Savings list and
        paste them below. What you type is kept as a draft until you save.
      </Note>
      <Label>Denomination</Label>
      <Select
        value={f.den}
        options={denOptions}
        onChange={den => set({ den })}
      />
      <Row style={{ marginVertical: 0 }}>
        <View style={{ flex: 1 }}>
          <Label>Draw no.</Label>
          <Input
            value={f.no}
            onChangeText={no => set({ no })}
            keyboardType="number-pad"
            placeholder="109"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Label>Draw date</Label>
          <DateInput value={f.date} onChange={date => set({ date })} />
        </View>
      </Row>
      <Label>City</Label>
      <Input
        value={f.city}
        onChangeText={city => set({ city })}
        placeholder="e.g. Rawalpindi"
      />
      <Label>1st prize numbers</Label>
      <Input
        value={f.r1}
        onChangeText={r1 => set({ r1 })}
        multiline
        numberOfLines={2}
        upper
        autoCorrect={false}
      />
      <Label>2nd prize numbers</Label>
      <Input
        value={f.r2}
        onChangeText={r2 => set({ r2 })}
        multiline
        numberOfLines={2}
        upper
        autoCorrect={false}
      />
      <Label>3rd prize numbers</Label>
      <Input
        value={f.r3}
        onChangeText={r3 => set({ r3 })}
        multiline
        numberOfLines={3}
        upper
        autoCorrect={false}
      />
      {total ? <Note>{total} numbers entered</Note> : null}
      <Btn title="Save draw" onPress={() => saveDraw(f)} />
      <Row style={{ marginBottom: 0 }}>
        <Btn
          sm
          variant="alt"
          title="Close (keep draft)"
          onPress={() => setSheet(null)}
        />
        {importDraft ? (
          <Btn
            sm
            variant="red"
            title="Clear form"
            onPress={() => setImportDraft(null)}
          />
        ) : null}
      </Row>
    </>
  );
}

/* ---------- Export ---------- */
function ExportSheet() {
  const {
    statementCsv,
    backupJson,
    copyText,
    restoreBackup,
    exportXlsx,
    exportPdf,
    cur,
    setSheet,
  } = useApp();
  const { c } = useTheme();
  const [txt, setTxt] = useField('');
  const shareText = (message: string, title: string) =>
    Share.share({ message, title }).catch(() => {});
  return (
    <>
      <Title serif>Export & backup</Title>
      <Note>
        Statement for “{cur?.name || ''}”: summary, denomination table, every
        win and every bond (archived included).
      </Note>
      <Row>
        <Btn sm title="📊 Excel (.xlsx)" onPress={exportXlsx} />
        <Btn sm title="📄 PDF" onPress={exportPdf} />
      </Row>
      <Row style={{ marginTop: 0 }}>
        <Btn
          sm
          variant="alt"
          title="Copy CSV"
          onPress={() => copyText(statementCsv())}
        />
        <Btn
          sm
          variant="alt"
          title="Share CSV text"
          onPress={() => shareText(statementCsv(), 'Bond Check statement')}
        />
      </Row>
      <View
        style={{ height: 1, backgroundColor: c.line, marginVertical: 10 }}
      />
      <Label>Full backup (JSON)</Label>
      <Note>
        Includes this workspace’s bonds and wins, plus draw results, prize
        amounts, draw schedule and tax setting.
      </Note>
      <Row style={{ marginTop: 0 }}>
        <Btn
          sm
          variant="alt"
          title="Copy backup"
          onPress={() => copyText(backupJson(), 'Backup copied')}
        />
        <Btn
          sm
          variant="alt"
          title="Share backup"
          onPress={() =>
            shareText(backupJson(), 'Bond Check backup — ' + (cur?.name || ''))
          }
        />
      </Row>
      <Label>Restore from a backup</Label>
      <Input
        value={txt}
        onChangeText={setTxt}
        multiline
        numberOfLines={3}
        placeholder="Paste a JSON backup here"
        autoCorrect={false}
        autoCapitalize="none"
      />
      <Note>
        Bonds already in this workspace are skipped. Draws with the same number
        are replaced.
      </Note>
      <Btn title="Restore" onPress={() => restoreBackup(txt)} />
      <Btn variant="alt" title="Close" onPress={() => setSheet(null)} />
    </>
  );
}

/* ---------- Logout ---------- */
function LogoutSheet() {
  const { doLogout, setSheet } = useApp();
  return (
    <>
      <Title serif>Log out?</Title>
      <Note style={{ fontSize: 14 }}>
        Your bonds stay saved in your workspaces. You can log back in anytime.
      </Note>
      <Btn variant="red" title="Yes, log out" onPress={doLogout} />
      <Btn variant="alt" title="Cancel" onPress={() => setSheet(null)} />
    </>
  );
}

function sheetKey(s: SheetState) {
  if (!s) return 'none';
  return s.kind === 'bond' ? `bond-${s.id}-${s.m}-${s.wi ?? ''}` : s.kind;
}

function SheetBody() {
  const { sheet, findBond } = useApp();
  if (!sheet) return null;
  switch (sheet.kind) {
    case 'bond': {
      const b = findBond(sheet.id);
      if (!b) return null;
      if (sheet.m === 'claim' && sheet.wi != null && b.wins[sheet.wi])
        return <BondClaim b={b} wi={sheet.wi} />;
      if (sheet.m === 'renew') return <BondRenew b={b} />;
      if (sheet.m === 'edit') return <BondEdit b={b} />;
      if (sheet.m === 'del') return <BondDelete b={b} />;
      return <BondView b={b} />;
    }
    case 'ws':
      return <WorkspaceSheet />;
    case 'import':
      return <ImportSheet />;
    case 'export':
      return <ExportSheet />;
    case 'logout':
      return <LogoutSheet />;
  }
}

export default function SheetHost() {
  const { sheet, requestCloseSheet } = useApp();
  return (
    <BottomSheet visible={!!sheet} onClose={requestCloseSheet}>
      <React.Fragment key={sheetKey(sheet)}>
        <SheetBody />
      </React.Fragment>
    </BottomSheet>
  );
}
