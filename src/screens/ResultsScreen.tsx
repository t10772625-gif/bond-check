import React, { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, BondRow, DH, H2, Note, Res, SearchBar, matches } from '../components/ui';
import { useApp } from '../store/AppStore';
import type { Bond, Win } from '../types';
import { fd, fmt } from '../utils';

type Item = { k: 'head'; key: string; text: string } | { k: 'row'; key: string; b: Bond; w: Win };

export default function ResultsScreen() {
  const { B, summary, amt, db, setSheet, ver } = useApp();
  const insets = useSafeAreaInsets();
  const [rq, setRq] = useState('');
  const dq = useDeferredValue(rq);
  const s = summary();

  const { items, rows } = useMemo(() => {
    const m: Record<string, { w: Win; d: number; l: [Bond, Win][] }> = {};
    B().forEach(b =>
      b.wins.forEach(w => {
        const city = db.DRAWS.find(d => d.no === w.no && d.den === b.d)?.city;
        const status = w.claim ? 'claimed' : 'pending';
        if (!matches(dq, b.n, b.holder, b.note, '#' + w.no, w.rank, city, status)) return;
        const k = b.d + '-' + w.no;
        (m[k] = m[k] || { w, d: b.d, l: [] }).l.push([b, w]);
      }),
    );
    const ks = Object.keys(m).sort((a, b) => m[b].w.date.localeCompare(m[a].w.date));
    const out: Item[] = [];
    let count = 0;
    ks.forEach(k => {
      const x = m[k];
      const dr = db.DRAWS.find(d => d.no === x.w.no && d.den === x.d);
      const tot = x.l.reduce((a, [b, w]) => a + amt(b, w), 0);
      out.push({ k: 'head', key: 'h' + k, text: `Draw #${x.w.no} · ${fmt(x.d)} · ${fd(x.w.date)}${dr && dr.city ? ' · ' + dr.city : ''} — ${fmt(tot)}` });
      x.l.forEach(([b, w], i) => {
        out.push({ k: 'row', key: `r${k}-${b.id}-${i}`, b, w });
        count++;
      });
    });
    return { items: out, rows: count };
  }, [dq, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <FlatList
      data={items}
      keyExtractor={x => x.key}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 48 }}
      ListHeaderComponent={
        <View>
          <H2>Win History</H2>
          <Res kind="g">{`${s.W.length} win${s.W.length === 1 ? '' : 's'} · ${fmt(s.gross)} gross · ${fmt(s.net)} after tax`}</Res>
          <SearchBar value={rq} onChange={setRq} placeholder="Search number, holder, draw #, city, pending…" count={dq ? `${rows} match${rows === 1 ? '' : 'es'}` : undefined} />
        </View>
      }
      renderItem={({ item }) => {
        if (item.k === 'head') return <DH>{item.text}</DH>;
        const { b, w } = item;
        const dn = b.st !== 'active' ? 'Archived' : w.date <= (b.date || '') ? 'Renewed ✓' : 'Renew needed';
        return (
          <BondRow
            title={b.n}
            sub={`${w.rank} prize · ${fmt(amt(b, w))} · ${w.claim ? 'Claimed ' + fd(w.claim.date) : 'Claim pending'}${b.holder ? ' · ' + b.holder : ''}`}
            right={<Badge kind={w.claim ? 'w' : 'g'} text={w.claim ? 'Claimed ✓' : dn} />}
            onPress={() => setSheet({ kind: 'bond', id: b.id, m: 'view' })}
          />
        );
      }}
      ListEmptyComponent={<Note>{dq ? `No wins match “${dq}”.` : 'No wins in this workspace yet.'}</Note>}
    />
  );
}
