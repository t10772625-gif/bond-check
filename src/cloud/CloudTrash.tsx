import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Btn, FullModal, Note, SearchBar, Txt, matches } from '../components/ui';
import { useApp } from '../store/AppStore';
import { fd, fmt } from '../utils';

export function CloudTrash({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { automation, toast, confirm } = useApp();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const all = automation.snapshot?.trash ?? [];
  const rows = all.filter(b => matches(query, b.n, b.d, b.holder, b.note));
  return <FullModal visible={visible} onClose={onClose} title="Recently deleted" subtitle={`${all.length} bonds · restore any holding below`}>
    <FlatList data={rows} keyExtractor={b => b.cloudId!} initialNumToRender={12} maxToRenderPerBatch={15} windowSize={7}
      keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      ListHeaderComponent={<>
        <SearchBar value={query} onChange={setQuery} placeholder="Search deleted bonds" />
        {all.length ? <Btn variant="red" title={busy ? 'Working…' : 'Empty recently deleted'} disabled={busy} onPress={() => confirm({
          title: `Permanently delete ${all.length} bonds?`,
          message: 'This permanently removes these deleted holdings and their saved claim history. Other accounts are not affected.',
          buttons: [{ text: 'Keep them', style: 'alt' }, { text: 'Delete permanently', style: 'red', onPress: () => {
            setBusy(true);
            automation.api.request('/rest/v1/bonds?deleted_at=not.is.null', { method: 'DELETE' })
              .then(() => automation.reload()).then(() => toast('Recently deleted emptied'))
              .catch(error => toast(error.message)).finally(() => setBusy(false));
          } }],
        })} /> : null}
      </>}
      renderItem={({ item: b }) => <View style={{ paddingVertical: 12 }}>
        <Txt style={{ fontWeight: '700' }}>{b.n} · {fmt(b.d)}</Txt>
        <Note>{`Purchased ${fd(b.date)}${b.holder ? ' · ' + b.holder : ''}`}</Note>
        <Btn variant="alt" title="Restore bond" disabled={busy} onPress={async () => {
          setBusy(true);
          try { await automation.repository.update(b, { deleted_at: null }); await automation.reload(); toast('Bond restored with its saved claim history'); }
          catch (error) { toast((error as Error).message); }
          finally { setBusy(false); }
        }} />
      </View>}
      ListEmptyComponent={<Note>{query ? 'No deleted bonds match your search.' : 'No recently deleted bonds.'}</Note>}
    />
  </FullModal>;
}
