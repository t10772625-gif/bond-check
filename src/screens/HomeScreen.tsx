import React, { useDeferredValue, useMemo } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Banner, BondRow, Chips, H2, Note, Res, SearchBar, Stat, StatGrid, Txt, matches } from '../components/ui';
import { HomeFilter, useApp } from '../store/AppStore';
import { fonts, useTheme } from '../theme';
import type { Bond } from '../types';
import { commas, daysBetween, fd, firstName, fmt, today } from '../utils';

export function DenomTable({ by }: { by: Record<string, { c: number; v: number; w: number; p: number }> }) {
  const { c } = useTheme();
  const rows = Object.keys(by).sort((a, b) => +a - +b);
  const cell = { fontSize: 13, paddingVertical: 7, paddingHorizontal: 4 } as const;
  const flex = [1.2, 0.6, 1.3, 0.6, 1.3];
  return (
    <View style={{ backgroundColor: c.surf, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, marginVertical: 6 }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.line }}>
        {['Bond', 'Qty', 'Value', 'Wins', 'Prize'].map((h, i) => (
          <Txt key={h} style={[cell, { flex: flex[i], color: c.gold, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }]}>
            {h}
          </Txt>
        ))}
      </View>
      {rows.map((d, ri) => {
        const o = by[d];
        return (
          <View key={d} style={{ flexDirection: 'row', borderBottomWidth: ri === rows.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
            <Txt style={[cell, { flex: flex[0], fontWeight: '700' }]}>{commas(+d)}</Txt>
            <Txt style={[cell, { flex: flex[1] }]}>{o.c}</Txt>
            <Txt style={[cell, { flex: flex[2] }]}>{commas(o.v)}</Txt>
            <Txt style={[cell, { flex: flex[3] }]}>{o.w}</Txt>
            <Txt style={[cell, { flex: flex[4] }]}>{commas(o.p)}</Txt>
          </View>
        );
      })}
      {!rows.length ? <Txt style={cell}>No bonds yet</Txt> : null}
    </View>
  );
}

export default function HomeScreen() {
  const app = useApp();
  const { U, cur, db, summary, B, pend, badge, flt, setFlt, q, setQ, setSheet, setTab, lastW, amt, ver } = app;
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const dq = useDeferredValue(q);

  const L = useMemo(() => {
    if (!cur) return [] as Bond[];
    return cur.bonds.filter(
      b =>
        matches(dq, b.n, b.holder, b.note) &&
        (flt === 'all'
          ? b.st === 'active'
          : flt === 'pend'
          ? pend(b)
          : flt === 'ren'
          ? b.st === 'active' && b.wins.length > 0 && !pend(b)
          : b.st !== 'active'),
    );
  }, [cur, dq, flt, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!U || !cur) return null;
  const s = summary();
  const won = B().filter(pend);
  const pc = won.length;
  const T = today();
  const nx = db.SCHED.filter(x => x.date >= T).sort((a, b) => a.date.localeCompare(b.date))[0];
  const dd = nx ? daysBetween(T, nx.date) : 0;

  const header = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginVertical: 2 }}>
        <H2 style={{ marginTop: 0, marginBottom: 0, flexShrink: 1 }}>Hello, {firstName(U.name)} 👋</H2>
        <Pressable
          onPress={() => setSheet({ kind: 'ws' })}
          style={{ borderWidth: 1, borderColor: c.gold, backgroundColor: c.yel, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 12, maxWidth: 180 }}>
          <Txt numberOfLines={1} style={{ color: c.gold, fontWeight: '700', fontSize: 12 }}>
            {cur.personal ? '👤' : '👪'} {cur.name} ▾
          </Txt>
        </Pressable>
      </View>

      <StatGrid>
        <Stat hero label="Total prize won (gross)" value={fmt(s.gross)} sub={`After tax (${db.filer ? 'Filer 15%' : 'Non-filer 35%'}): ${fmt(s.net)}`} />
        <Stat label="Bonds held" value={s.act.length} sub={`${fmt(s.heldVal)} value`} />
        <Stat label="Drawn so far" value={s.W.length} sub={`${s.uniq} bond${s.uniq === 1 ? '' : 's'}`} />
        <Stat label="Action needed" value={pc} sub="renew or delete" />
        <Stat label="Claims pending" value={s.pn} sub={`${fmt(s.pnet)} after tax`} />
      </StatGrid>

      {nx ? (
        <Banner
          bg={dd <= 7 ? c.yel : c.grey}
          fg={dd <= 7 ? c.gold : c.mut}
          onPress={() => setTab('set')}
          text={`⏰ Next draw: ${fmt(nx.den)} · ${fd(nx.date)}${nx.city ? ' · ' + nx.city : ''} — ${dd === 0 ? 'today' : 'in ' + dd + ' day' + (dd > 1 ? 's' : '')}${nx.remind ? ' 🔔' : ''}`}
        />
      ) : null}

      {!B().length ? <Res kind="y">No bonds in this workspace yet. Use the Add tab to get started.</Res> : null}

      {won.length ? (
        <View style={{ backgroundColor: c.grnbg, borderRadius: 16, padding: 12, marginVertical: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt style={{ color: c.grn, fontWeight: '800', fontSize: 15 }}>🏆 Won bonds ({won.length})</Txt>
            {won.length > 3 ? (
              <Pressable onPress={() => setFlt('pend')} hitSlop={8}>
                <Txt style={{ color: c.grn, fontWeight: '700', fontSize: 13 }}>See all ›</Txt>
              </Pressable>
            ) : null}
          </View>
          <Txt style={{ color: c.grn, fontSize: 12, marginBottom: 4 }}>Drawn after purchase — renew, claim or delete</Txt>
          {won.slice(0, 3).map(b => {
            const w = lastW(b);
            return (
              <Pressable
                key={b.id}
                onPress={() => setSheet({ kind: 'bond', id: b.id, m: 'view' })}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.line }}>
                <Txt style={{ fontFamily: fonts.mono, fontWeight: '700', color: c.ink }}>{b.n}</Txt>
                <Txt style={{ color: c.grn, fontWeight: '700', fontSize: 13 }}>
                  {w.rank} · {fmt(amt(b, w))} {w.claim ? '✓' : '· claim pending'}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Txt style={{ fontFamily: fonts.serif, fontWeight: '700', fontSize: 15, color: c.gold, marginTop: 10 }}>By denomination (incl. archived)</Txt>
      <DenomTable by={s.by} />

      <Chips<HomeFilter>
        options={[
          ['all', 'All'],
          ['pend', `Won${pc ? ` (${pc})` : ''}`],
          ['ren', 'Renewed'],
          ['arch', 'Archived'],
        ]}
        value={flt}
        onChange={setFlt}
      />
      <SearchBar value={q} onChange={setQ} placeholder="Search number, holder or note" count={`${L.length} bond${L.length === 1 ? '' : 's'}`} />
    </View>
  );

  return (
    <FlatList
      data={L}
      keyExtractor={b => String(b.id)}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 48 }}
      initialNumToRender={15}
      maxToRenderPerBatch={20}
      windowSize={9}
      renderItem={({ item: b }) => {
        const [st, k] = badge(b);
        return (
          <BondRow
            title={b.n}
            sub={`${fmt(b.d)}${b.holder ? ' · ' + b.holder : ''} · ${b.date ? 'Since ' + fd(b.date) : 'Date unknown'}${b.note ? ' · ' + b.note : ''}`}
            right={<Badge text={st} kind={k} />}
            onPress={() => setSheet({ kind: 'bond', id: b.id, m: 'view' })}
          />
        );
      }}
      ListEmptyComponent={<Note>{dq ? `No bonds match “${dq}”.` : 'No bonds found.'}</Note>}
    />
  );
}
