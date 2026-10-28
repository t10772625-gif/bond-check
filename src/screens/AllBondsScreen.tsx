import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import {
  Badge,
  BondRow,
  Btn,
  Check,
  FullModal,
  Note,
  SearchBar,
  Select,
  Row,
  matches,
} from '../components/ui';
import { useApp } from '../store/AppStore';
import { DEN, fd, fmt } from '../utils';

export default function AllBondsScreen({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { B, badge, setSheet, ver, confirm, deleteBonds } = useApp();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (!visible) { setSelecting(false); setSelected(new Set()); }
  }, [visible]);
  const [search, setSearch] = useState('');
  const [denomination, setDenomination] = useState(0);
  const query = useDeferredValue(search);
  const all = B();
  const rows = useMemo(
    () =>
      B().filter(
        b =>
          (!denomination || b.d === denomination) &&
          matches(query, b.n, b.holder, b.note, b.date, b.d),
      ).sort((a, b) => b.id - a.id),
    // Legacy portfolio arrays are mutable; ver intentionally invalidates this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, denomination, ver],
  );
  const selectedIds = all.filter(b => selected.has(b.id)).map(b => b.id);
  const toggle = (id: number) => setSelected(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allShownSelected = rows.length > 0 && rows.every(b => selected.has(b.id));
  return (
    <FullModal
      visible={visible}
      onClose={onClose}
      title="All bonds"
      subtitle={`${all.length} bonds · active and archived`}
    >
      <FlatList
        data={rows}
        keyExtractor={bond => String(bond.id)}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={9}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View>
            <Btn variant="alt" title={selecting ? 'Cancel selection' : 'Select bonds'} onPress={() => {
              if (deleting) return;
              setSelecting(!selecting); setSelected(new Set());
            }} />
            {selecting ? <>
              <Row>
                <Btn sm variant="alt" title={allShownSelected ? 'Deselect all shown' : `Select all shown (${rows.length})`} onPress={() => {
                  if (deleting) return;
                  setSelected(previous => {
                    const next = new Set(previous);
                    rows.forEach(b => { if (allShownSelected) next.delete(b.id); else next.add(b.id); });
                    return next;
                  });
                }} />
                <Btn sm variant="red" title={deleting ? 'Deleting…' : `Delete selected (${selectedIds.length})`} onPress={() => {
                  if (deleting || !selectedIds.length) return;
                  confirm({ title: `Delete ${selectedIds.length} bonds?`, message: 'These bonds will move to Recently deleted. You can restore them from Settings. Other accounts are not affected.', buttons: [
                    { text: 'Cancel', style: 'alt' },
                    { text: 'Move to trash', style: 'red', onPress: () => {
                      setDeleting(true);
                      deleteBonds(selectedIds).then(ok => { if (ok) { setSelected(new Set()); setSelecting(false); } }).finally(() => setDeleting(false));
                    } },
                  ] });
                }} />
              </Row>
              <Note>{`${selectedIds.length} selected · Select all applies to the current search and denomination.`}</Note>
            </> : null}
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search number, holder, date or note"
              count={`${rows.length} shown`}
            />
            <Select
              value={denomination}
              onChange={setDenomination}
              options={[
                { value: 0, label: 'All denominations' },
                ...DEN.map(value => ({ value, label: fmt(value) })),
              ]}
            />
          </View>
        }
        renderItem={({ item: bond }) => {
          const [status, kind] = badge(bond);
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {selecting ? <Check value={selected.has(bond.id)} onChange={() => { if (!deleting) toggle(bond.id); }} /> : null}
            <View style={{ flex: 1 }}><BondRow
              title={bond.n}
              sub={`${fmt(bond.d)} · Purchased ${fd(bond.date)}${
                bond.holder ? ' · ' + bond.holder : ''
              }`}
              right={<Badge text={status} kind={kind} />}
              onPress={() => {
                if (selecting) { if (!deleting) toggle(bond.id); return; }
                onClose();
                setSheet({ kind: 'bond', id: bond.id, m: 'view' });
              }}
            />
            </View></View>
          );
        }}
        ListEmptyComponent={
          <Note>
            {query
              ? 'No bonds match your search.'
              : 'No bonds in this denomination.'}
          </Note>
        }
      />
    </FullModal>
  );
}
