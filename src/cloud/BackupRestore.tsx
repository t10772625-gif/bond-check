import React, { useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { Btn, FullModal, Input, Note, Res } from '../components/ui';
import { useApp } from '../store/AppStore';
import { normalizeBond } from './migration';
import type { BondDraft } from './types';

export function BackupRestore() {
  const { automation, B, toast, setTab, setAllBondsOpen } = useApp();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const valid: BondDraft[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  let error = '';
  if (text.trim()) {
    try {
      if (text.length > 1024 * 1024) throw new Error('Restore up to 1 MB of backup text at a time');
      const parsed = JSON.parse(text);
      const rows = parsed.snapshot?.bonds ?? parsed.bonds ?? parsed;
      if (!Array.isArray(rows))
        throw new Error('This JSON does not contain a bond backup');
      if (rows.length > 10000) throw new Error('Restore up to 10,000 bonds at a time');
      const seen = new Set(
        [...B(), ...(automation.snapshot?.trash ?? [])].map(b => {
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
            archived: row.archived === true || row.st === 'archived',
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
      <FullModal
        visible={open}
        onClose={() => { if (!saving.current) setOpen(false); }}
        title="Restore bond backup"
      >
        <ScrollView
          contentContainerStyle={{
            padding: 24,
            paddingBottom: 48,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Note>
            Paste the backup JSON, review each invalid row and confirm the bonds
            to add. Restored bonds are matched against stored server history.
          </Note>
          <Note>This restores holdings and archive status. Claim receipts in the backup are for reference and must be entered separately.</Note>
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
            disabled={busy || !!error || !!invalid.length || !valid.length}
            title={busy ? 'Restoring…' : invalid.length ? 'Fix invalid rows before restoring' : `Restore ${valid.length} bonds`}
            onPress={async () => {
              if (saving.current || error || invalid.length || !valid.length) return;
              saving.current = true;
              setBusy(true);
              const owner = automation.api.session?.user.id;
              try {
                await automation.repository.add(valid);
                if (automation.api.session?.user.id !== owner) return;
                await automation.reload(true);
                if (automation.api.session?.user.id !== owner) return;
                setTab('home'); setAllBondsOpen(true);
                if (!invalid.length) {
                  setOpen(false);
                  setText('');
                }
                toast('Bonds restored and checked against stored history');
              } catch (failure) {
                toast((failure as Error).message);
              } finally {
                saving.current = false;
                setBusy(false);
              }
            }}
          />
          <Btn variant="alt" title="Cancel" disabled={busy} onPress={() => setOpen(false)} />
        </ScrollView>
      </FullModal>
    </>
  );
}
