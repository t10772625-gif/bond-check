import React, { useState } from 'react';
import { Modal, ScrollView } from 'react-native';
import { Btn, H2, Input, Note, Res } from '../components/ui';
import { useApp } from '../store/AppStore';
import { normalizeBond } from './migration';
import type { BondDraft } from './types';

export function BackupRestore() {
  const { automation, B, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const valid: BondDraft[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  let error = '';
  if (text.trim()) {
    try {
      const parsed = JSON.parse(text);
      const rows = parsed.snapshot?.bonds ?? parsed.bonds ?? parsed;
      if (!Array.isArray(rows))
        throw new Error('This JSON does not contain a bond backup');
      const seen = new Set(
        B().map(b => {
          const n = normalizeBond(b);
          return `${n.denomination}:${n.series}:${n.number}`;
        }),
      );
      rows.forEach((row, index) => {
        try {
          if (!row || typeof row !== 'object')
            throw new Error('Invalid bond row');
          const draft: BondDraft = {
            n: row.n ?? row.number,
            d: row.d ?? row.denomination,
            date: row.date ?? row.purchased_on ?? '',
            series: row.series ?? '',
            holder: row.holder ?? '',
            note: row.note ?? '',
          };
          const n = normalizeBond(draft);
          const key = `${n.denomination}:${n.series}:${n.number}`;
          if (seen.has(key)) {
            duplicates++;
            return;
          }
          seen.add(key);
          valid.push(draft);
        } catch (failure) {
          invalid.push(`Row ${index + 1}: ${(failure as Error).message}`);
        }
      });
    } catch (failure) {
      error = (failure as Error).message;
    }
  }
  return (
    <>
      <Btn
        variant="alt"
        title="Restore bonds from backup"
        onPress={() => setOpen(true)}
      />
      <Modal
        visible={open}
        onRequestClose={() => setOpen(false)}
        animationType="slide"
      >
        <ScrollView
          contentContainerStyle={{
            padding: 24,
            paddingTop: 48,
            paddingBottom: 48,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <H2>Restore bond backup</H2>
          <Note>
            Paste the backup JSON, review each invalid row and confirm the bonds
            to add. Restored bonds are matched against stored server history.
          </Note>
          <Input
            multiline
            numberOfLines={12}
            value={text}
            onChangeText={setText}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {error ? <Res kind="r">{error}</Res> : null}
          <Note>{`${valid.length} new valid bonds · ${duplicates} duplicates · ${invalid.length} invalid rows`}</Note>
          {invalid.map((message, i) => (
            <Res key={i} kind="r">
              {message}
            </Res>
          ))}
          <Btn
            title={busy ? 'Restoring…' : `Restore ${valid.length} bonds`}
            onPress={async () => {
              if (busy || error || !valid.length) return;
              setBusy(true);
              try {
                await automation.repository.add(valid);
                await automation.reload();
                if (!invalid.length) {
                  setOpen(false);
                  setText('');
                }
                toast('Bonds restored and checked against stored history');
              } catch (failure) {
                toast((failure as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
          <Btn variant="alt" title="Cancel" onPress={() => setOpen(false)} />
        </ScrollView>
      </Modal>
    </>
  );
}
