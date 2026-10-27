import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, DateInput, H2, Input, Label, Note, Row, Select, Seg, Txt } from '../components/ui';
import { AddMode, useApp } from '../store/AppStore';
import { useTheme } from '../theme';
import { DEN, fmt, genRange } from '../utils';
import { CsvImport } from '../cloud/CsvImport';

const denOptions = DEN.map(d => ({ value: d, label: fmt(d) }));

export default function AddScreen() {
  const { addForm: f, setAddForm, addSingle, stage, staged, setPreviewOpen, discardStaged, stagedStates, confirm } = useApp();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();

  const rangeCount = f.mode === 'range' ? genRange(f.ra, f.rb)?.length ?? 0 : 0;
  let draftSave = 0;
  if (staged) {
    const st = stagedStates(staged.items);
    draftSave = staged.items.filter((it, i) => it.on && st[i] === 'ok').length;
  }

  const startPreview = () => {
    if (!staged) return stage();
    confirm({
      icon: '📝',
      title: 'You already have a draft',
      message: `A draft list of ${staged.items.length} numbers is waiting for review. Open it, or replace it with a new preview?`,
      buttons: [
        { text: 'Open my draft', style: 'primary', onPress: () => setPreviewOpen(true) },
        { text: 'Replace with new preview', style: 'red', onPress: stage },
        { text: 'Cancel', style: 'alt' },
      ],
    });
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 48 }}>
      <H2>Add Bonds</H2>
      <CsvImport />

      {staged ? (
        <Pressable
          onPress={() => setPreviewOpen(true)}
          style={{ backgroundColor: c.yel, borderWidth: 1, borderColor: c.gold, borderRadius: 16, padding: 12, marginBottom: 8 }}>
          <Txt style={{ color: c.gold, fontWeight: '800', fontSize: 14 }}>📝 Draft waiting for review</Txt>
          <Txt style={{ color: c.gold, fontSize: 13, marginTop: 2 }}>
            {staged.items.length} numbers · {draftSave} selected to save{staged.removed ? ` · ${staged.removed} removed` : ''}. Nothing is saved until you press Save.
          </Txt>
          <Row style={{ marginBottom: 0 }}>
            <Btn sm title="Open preview ›" onPress={() => setPreviewOpen(true)} />
            <Btn
              sm
              variant="red"
              title="Discard draft"
              onPress={() =>
                confirm({
                  icon: '🗑',
                  title: 'Discard draft?',
                  message: 'The preview list will be deleted. Nothing is added to your bonds.',
                  buttons: [
                    { text: 'Discard draft', style: 'red', onPress: discardStaged },
                    { text: 'Keep it', style: 'alt' },
                  ],
                })
              }
            />
          </Row>
        </Pressable>
      ) : null}

      <Seg<AddMode>
        options={[
          ['single', 'Single'],
          ['range', 'Range'],
          ['bulk', 'Paste'],
        ]}
        value={f.mode}
        onChange={mode => setAddForm({ mode })}
      />
      <Label>Denomination</Label>
      <Select value={f.den} options={denOptions} onChange={den => setAddForm({ den })} />
      <Note>Enter exactly six digits. Series letters are optional and ignored when matching official draws. Leading zeros are preserved.</Note>
      <Label>Purchase date (required)</Label>
      <DateInput value={f.dt} onChange={dt => setAddForm({ dt })} placeholder="When you bought these bonds" />
      <Note>Only draws after this date count as your wins. Earlier and same-day draws are excluded.</Note>
      <Label>Holder (optional)</Label>
      <Input value={f.holder} onChangeText={holder => setAddForm({ holder })} placeholder="Whose bond is this?" />
      <Label>Note / location (optional)</Label>
      <Input value={f.note} onChangeText={note => setAddForm({ note })} placeholder="e.g. Almirah, file 3" />

      {f.mode === 'single' ? (
        <>
          <Label>Bond number</Label>
          <Input value={f.single} onChangeText={single => setAddForm({ single })} placeholder="BD123400" upper mono autoCorrect={false} />
          <Btn title="Add bond" onPress={addSingle} />
        </>
      ) : f.mode === 'range' ? (
        <>
          <Row style={{ marginBottom: 0 }}>
            <View style={{ flex: 1 }}>
              <Label>From</Label>
              <Input value={f.ra} onChangeText={ra => setAddForm({ ra })} upper mono placeholder="BD123400" autoCorrect={false} />
            </View>
            <View style={{ flex: 1 }}>
              <Label>To</Label>
              <Input value={f.rb} onChangeText={rb => setAddForm({ rb })} upper mono placeholder="BD123500" autoCorrect={false} />
            </View>
          </Row>
          <Note>{rangeCount ? `${rangeCount} numbers in this range (max 2,000). Same letters needed on both sides.` : 'Same letters on both sides, up to 2,000 numbers.'}</Note>
          <Btn title="Preview range ›" onPress={startPreview} />
        </>
      ) : (
        <>
          <Label>Bond numbers</Label>
          <Input
            value={f.bulk}
            onChangeText={bulk => setAddForm({ bulk })}
            multiline
            numberOfLines={5}
            upper
            autoCorrect={false}
            placeholder="Paste numbers separated by commas, spaces or new lines"
          />
          <Btn title="Preview & remove duplicates ›" onPress={startPreview} />
        </>
      )}
      <Note>
        {f.mode === 'single'
          ? 'Numbers are cleaned automatically: “bd 123-400” becomes BD123400.'
          : 'A review list opens first. Remove numbers you do not have, fix typos, then press Save. Your list stays saved as a draft until then.'}
      </Note>
      <Note>📷 Photo scan (OCR) arrives in Version 2 and will always show a confirmation list first.</Note>
    </ScrollView>
  );
}
