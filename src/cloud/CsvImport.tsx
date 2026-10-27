import React, { useState } from 'react';
import { Modal, ScrollView } from 'react-native';
import { Btn, H2, Input, Note, Res } from '../components/ui';
import { useApp } from '../store/AppStore';
import { previewCsv } from './csv';

export function CsvImport() {
  const { automation, B, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  let preview: ReturnType<typeof previewCsv> | null = null;
  let error = '';
  if (text.trim()) {
    try {
      preview = previewCsv(text, B());
    } catch (failure) {
      error = (failure as Error).message;
    }
  }
  if (!automation.configured) return null;
  return (
    <>
      <Btn variant="alt" title="Import CSV" onPress={() => setOpen(true)} />
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
          <H2>Import bonds from CSV</H2>
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
                title={
                  busy ? 'Saving…' : `Save ${preview.valid.length} valid bonds`
                }
                onPress={async () => {
                  if (busy || !preview?.valid.length) return;
                  setBusy(true);
                  try {
                    await automation.repository.add(preview.valid);
                    await automation.reload();
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
                    setBusy(false);
                  }
                }}
              />
            </>
          ) : null}
          <Btn variant="alt" title="Cancel" onPress={() => setOpen(false)} />
        </ScrollView>
      </Modal>
    </>
  );
}
