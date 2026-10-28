import React, { useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { Btn, FullModal, Input, Note, Res } from '../components/ui';
import { useApp } from '../store/AppStore';
import { previewCsv } from './csv';

export function CsvImport() {
  const { automation, B, toast, setTab, setAllBondsOpen } = useApp();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  let preview: ReturnType<typeof previewCsv> | null = null;
  let error = '';
  if (text.trim()) {
    try {
      preview = previewCsv(text, [...B(), ...(automation.snapshot?.trash ?? [])]);
    } catch (failure) {
      error = (failure as Error).message;
    }
  }
  if (!automation.configured) return null;
  return (
    <>
      <Btn variant="alt" title="Import CSV" onPress={() => setOpen(true)} />
      <FullModal
        visible={open}
        onClose={() => { if (!saving.current) setOpen(false); }}
        title="Import bonds from CSV"
      >
        <ScrollView
          contentContainerStyle={{
            padding: 24,
            paddingBottom: 48,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Note>
            Paste the original text. Required headers:
            number,denomination,purchased_on. Optional: series,holder,note. Keep
            numbers as six-digit text.
          </Note>
          <Input
            multiline
            numberOfLines={10}
            value={text}
            onChangeText={setText}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {error ? <Res kind="r">{error}</Res> : null}
          {preview ? (
            <>
              <Note>{`${preview.valid.length} new valid bonds · ${preview.duplicates} duplicates · ${preview.invalid.length} invalid rows`}</Note>
              {preview.invalid.map(row => (
                <Res
                  key={row.row}
                  kind="r"
                >{`Row ${row.row}: ${row.reason}`}</Res>
              ))}
              <Btn
                disabled={busy || !!preview.invalid.length || !preview.valid.length}
                title={
                  busy ? 'Saving…' : preview.invalid.length ? 'Fix invalid rows before saving' : `Save ${preview.valid.length} valid bonds`
                }
                onPress={async () => {
                  if (saving.current || !preview?.valid.length || preview.invalid.length) return;
                  saving.current = true;
                  setBusy(true);
                  const owner = automation.api.session?.user.id;
                  try {
                    await automation.repository.add(preview.valid);
                    if (automation.api.session?.user.id !== owner) return;
                    await automation.reload(true);
                    if (automation.api.session?.user.id !== owner) return;
                    setTab('home'); setAllBondsOpen(true);
                    if (!preview.invalid.length) {
                      setOpen(false);
                      setText('');
                    }
                    toast(
                      preview.invalid.length
                        ? 'Valid bonds saved. Invalid rows remain in this preview.'
                        : 'CSV bonds saved and checked against stored history',
                    );
                  } catch (failure) {
                    toast((failure as Error).message);
                  } finally {
                    saving.current = false;
                    setBusy(false);
                  }
                }}
              />
            </>
          ) : null}
          <Btn variant="alt" title="Cancel" disabled={busy} onPress={() => setOpen(false)} />
        </ScrollView>
      </FullModal>
    </>
  );
}
