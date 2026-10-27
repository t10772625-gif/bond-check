import React, { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Banner, Btn, H2, Input, Res, Row, SearchBar, Select, Seg, Txt, matches } from '../components/ui';
import { CheckMode, useApp } from '../store/AppStore';
import { fonts, useTheme } from '../theme';
import type { Bond } from '../types';
import { fd, fmt } from '../utils';

type Item =
  | { k: 'won'; b: Bond }
  | { k: 'already'; b: Bond }
  | { k: 'old'; b: Bond }
  | { k: 'other'; n: string }
  | { k: 'inv'; n: string }
  | { k: 'arch'; count: number }
  | { k: 'nfHead'; count: number }
  | { k: 'nf'; b: Bond };

const Code = ({ children, color }: { children: string; color: string }) => (
  <Txt style={{ fontFamily: fonts.mono, fontWeight: '700', fontSize: 16, color }}>{children}</Txt>
);

export default function CheckScreen() {
  const app = useApp();
  const { db, B, pend, cm, setCm, cden, setCden, cdraw, setCdraw, c1, setC1, c2, setC2, CR, setCR, doCheck, setSheet, setFlt, setTab, findBond, lastW, amt, ver } = app;
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [rq, setRq] = useState('');
  const [showNf, setShowNf] = useState(false);
  const drq = useDeferredValue(rq);

  const dens = [...new Set(db.DRAWS.map(d => d.den))].sort((a, b) => a - b);
  const effDen = db.DRAWS.some(d => d.den === cden) ? cden : dens[0];
  const ds = db.DRAWS.filter(d => d.den === effDen).sort((a, b) => b.date.localeCompare(a.date));
  const dr = (cdraw != null && ds.find(d => d.no === cdraw)) || ds[0]; // latest by default
  const old = B().filter(b => b.d === effDen && pend(b)).length;

  const items = useMemo<Item[]>(() => {
    if (!CR) return [];
    const gb = (a: number[]) => a.map(findBond).filter((b): b is Bond => !!b);
    const m = (n: string) => matches(drq, n);
    const out: Item[] = [];
    gb(CR.won).filter(b => m(b.n)).forEach(b => out.push({ k: 'won', b }));
    gb(CR.already).filter(b => m(b.n)).forEach(b => out.push({ k: 'already', b }));
    gb(CR.old).filter(b => m(b.n)).forEach(b => out.push({ k: 'old', b }));
    CR.other.filter(m).forEach(n => out.push({ k: 'other', n }));
    CR.inv.filter(m).forEach(n => out.push({ k: 'inv', n }));
    if (CR.arch.length && !drq) out.push({ k: 'arch', count: CR.arch.length });
    const nf = gb(CR.nf).filter(b => m(b.n));
    if (nf.length) {
      out.push({ k: 'nfHead', count: nf.length });
      if (showNf || drq) nf.forEach(b => out.push({ k: 'nf', b }));
    }
    return out;
  }, [CR, drq, showNf, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = CR
    ? { won: CR.won.length, nf: CR.nf.length, chk: CR.won.length + CR.already.length + CR.old.length + CR.nf.length + CR.arch.length }
    : null;

  const header = (
    <View>
      <H2>Check a Draw</H2>
      <Seg<CheckMode>
        options={[
          ['all', 'Whole draw'],
          ['list', 'Numbers'],
          ['range', 'Range'],
        ]}
        value={cm}
        onChange={mm => {
          setCm(mm);
          setCR(null);
        }}
      />
      {dr ? (
        <Row>
          <Select
            style={{ flex: 1 }}
            value={effDen}
            options={dens.map(d => ({ value: d, label: fmt(d) }))}
            onChange={v => {
              setCden(v);
              setCdraw(null);
              setCR(null);
            }}
          />
          <Select
            style={{ flex: 1.3 }}
            value={dr.no}
            options={ds.map((d, i) => ({ value: d.no, label: `#${d.no} · ${fd(d.date)}${i === 0 ? ' (latest)' : ''}` }))}
            onChange={v => {
              setCdraw(v);
              setCR(null);
            }}
          />
        </Row>
      ) : (
        <Res kind="y">No draw results yet. Import a draw to start checking.</Res>
      )}

      {cm === 'list' ? (
        <Input multiline numberOfLines={3} upper autoCorrect={false} placeholder="Paste numbers: BD123401, BD123407 …" value={c1} onChangeText={setC1} />
      ) : null}
      {cm === 'range' ? (
        <Row>
          <Input style={{ flex: 1 }} upper mono autoCorrect={false} placeholder="From: BD123400" value={c1} onChangeText={setC1} />
          <Input style={{ flex: 1 }} upper mono autoCorrect={false} placeholder="To: BD123500" value={c2} onChangeText={setC2} />
        </Row>
      ) : null}

      {dr ? (
        <Btn
          title="Check now"
          onPress={() => {
            setRq('');
            setShowNf(false);
            doCheck(dr);
          }}
        />
      ) : null}
      <Btn variant="alt" title="＋ Import draw results" onPress={() => setSheet({ kind: 'import' })} />
      <Banner
        bg={c.yel}
        fg={c.gold}
        onPress={() => {
          setFlt('pend');
          setTab('home');
        }}
        text={`📌 Previously drawn, action needed: ${old} bond${old === 1 ? '' : 's'} ›`}
      />

      {CR && counts ? (
        <>
          <Res kind="y" style={{ marginTop: 12 }}>
            <Txt style={{ color: c.gold, fontWeight: '600', fontSize: 14 }}>
              Draw #{CR.dr.no} · {fmt(CR.dr.den)} · {fd(CR.dr.date)}
              {CR.dr.city ? ' · ' + CR.dr.city : ''}
              {'\n'}
              {counts.chk} checked · {counts.won} won · {counts.nf} not found
            </Txt>
            {CR.total ? (
              <Txt style={{ color: c.gold, fontSize: 12, marginTop: 2 }}>
                {CR.total} numbers entered: {counts.chk} in your bonds, {CR.notmine + CR.other.length + CR.inv.length} not in your bonds or invalid
              </Txt>
            ) : null}
          </Res>
          <SearchBar value={rq} onChange={setRq} placeholder="Search in these results" />
        </>
      ) : null}
    </View>
  );

  const resBox = (kind: 'g' | 'y' | 'k' | 'r', body: React.ReactNode) => <Res kind={kind}>{body}</Res>;
  const line = (color: string, code: string, rest: string) => (
    <Txt style={{ color, fontWeight: '600', fontSize: 14 }}>
      <Code color={color}>{code}</Code> {rest}
    </Txt>
  );

  const renderItem = ({ item }: { item: Item }) => {
    switch (item.k) {
      case 'won': {
        const b = item.b;
        const w = lastW(b);
        return resBox(
          'g',
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <Txt style={{ fontSize: 14 }}>🎉</Txt>
              <Code color={c.grn}>{b.n}</Code>
              <Txt style={{ color: c.grn, fontWeight: '600', fontSize: 14 }}>
                — {w.rank} prize · {fmt(amt(b, w))}
              </Txt>
              <Badge kind="w" text={b.wins.length > 1 ? `Won ${b.wins.length} times` : 'New win'} />
            </View>
            <Row style={{ marginBottom: 0 }}>
              <Btn sm title="🔁 Renew" onPress={() => setSheet({ kind: 'bond', id: b.id, m: 'renew' })} />
              <Btn sm variant="alt" title="Claim" onPress={() => setSheet({ kind: 'bond', id: b.id, m: 'claim', wi: b.wins.length - 1 })} />
              <Btn sm variant="alt" title="🗑" onPress={() => setSheet({ kind: 'bond', id: b.id, m: 'del' })} />
            </Row>
          </>,
        );
      }
      case 'already':
        return resBox('k', line(c.mut, item.b.n, `— ${CR?.dr.w[item.b.n] || ''} · already checked, win not counted twice`));
      case 'old':
        return resBox(
          'y',
          line(
            c.gold,
            item.b.n,
            `— bought/renewed ${fd(item.b.date)}, less than 60 days before the draw, so not eligible${CR?.dr.w[item.b.n] ? ' (the number was in the draw)' : ''}`,
          ),
        );
      case 'other':
        return resBox('y', line(c.gold, item.n, '— in the draw list ✅ but not in your bonds'));
      case 'inv':
        return resBox('r', line(c.red, item.n, '— invalid number format'));
      case 'arch':
        return resBox('k', <Txt style={{ color: c.mut, fontWeight: '600', fontSize: 14 }}>{item.count} archived bonds skipped</Txt>);
      case 'nfHead':
        return (
          <Pressable onPress={() => setShowNf(!showNf)} style={{ paddingVertical: 10, paddingHorizontal: 2 }}>
            <Txt style={{ fontWeight: '600', fontSize: 13, color: c.mut }}>
              {showNf || drq ? '▾' : '▸'} {item.count} bonds not found (not a loss — most bonds never appear in a draw)
            </Txt>
          </Pressable>
        );
      case 'nf':
        return (
          <View style={{ paddingVertical: 6, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.redbg }}>
            <Txt style={{ fontFamily: fonts.mono, fontWeight: '600', fontSize: 14, color: c.red }}>{item.b.n} — not found</Txt>
          </View>
        );
    }
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(it, i) => it.k + ('b' in it ? it.b.id : 'n' in it ? it.n : i)}
      ListHeaderComponent={header}
      renderItem={renderItem}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 48 }}
      initialNumToRender={12}
      windowSize={9}
      ListEmptyComponent={CR && drq ? <Txt style={{ color: c.mut, fontSize: 13, padding: 8 }}>No result matches “{drq}”.</Txt> : undefined}
    />
  );
}
