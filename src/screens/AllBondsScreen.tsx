import React, { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import {
  Badge,
  BondRow,
  FullModal,
  Note,
  SearchBar,
  Select,
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
  const { B, badge, setSheet, ver } = useApp();
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
      ),
    // Legacy portfolio arrays are mutable; ver intentionally invalidates this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, denomination, ver],
  );
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
            <BondRow
              title={bond.n}
              sub={`${fmt(bond.d)} · Purchased ${fd(bond.date)}${
                bond.holder ? ' · ' + bond.holder : ''
              }`}
              right={<Badge text={status} kind={kind} />}
              onPress={() => {
                onClose();
                setSheet({ kind: 'bond', id: bond.id, m: 'view' });
              }}
            />
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
