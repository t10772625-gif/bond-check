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
  const { addForm: f, setAddForm, addSingle, stage, staged, setPreviewOpen, discardStaged, confirm, mutating } = useApp();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const count = f.mode === 'range' ? genRange(f.ra, f.rb)?.length ?? 0 : 0;
  const preview = () => {
    if (!staged) return stage();
    confirm({ title: 'You already have a draft', message: 'Open the saved preview or replace it with this list.', buttons: [
      { text: 'Open my draft', onPress: () => setPreviewOpen(true) },
      { text: 'Replace draft', style: 'red', onPress: stage },
      { text: 'Cancel', style: 'alt' },
    ] });
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 48 }}>
    <H2>Add bonds</H2>
    <Seg<AddMode> options={[[ 'single', 'Single' ], [ 'range', 'Range' ], [ 'bulk', 'Paste' ]]} value={f.mode} onChange={mode => setAddForm({ mode })} />
    {staged ? <View style={{ backgroundColor: c.yel, padding: 12, borderRadius: 12, marginVertical: 12 }}>
      <Pressable onPress={() => setPreviewOpen(true)}><Txt style={{ color: c.gold, fontWeight: '700' }}>{staged.items.length} numbers in your unsaved draft</Txt></Pressable>
      <Row><Btn sm title="Open preview" onPress={() => setPreviewOpen(true)} /><Btn sm variant="red" title="Discard draft" onPress={() => confirm({ title: 'Discard this draft?', message: 'No saved bonds will be affected.', buttons: [{ text: 'Keep draft', style: 'alt' }, { text: 'Discard draft', style: 'red', onPress: discardStaged }] })} /></Row>
    </View> : null}
    <Label>Denomination</Label>
    <Select value={f.den} options={denOptions} onChange={den => setAddForm({ den })} />
    {f.mode === 'single' ? <>
      <Label>Bond number</Label>
      <Input accessibilityLabel="Bond number" value={f.single} onChangeText={single => setAddForm({ single })} placeholder="007447 or AB007447" upper mono autoCorrect={false} />
    </> : f.mode === 'range' ? <>
      <Row>
        <View style={{ flex: 1 }}><Label>From</Label><Input accessibilityLabel="Range start" value={f.ra} onChangeText={ra => setAddForm({ ra })} upper mono placeholder="000001" autoCorrect={false} /></View>
        <View style={{ flex: 1 }}><Label>To</Label><Input accessibilityLabel="Range end" value={f.rb} onChangeText={rb => setAddForm({ rb })} upper mono placeholder="000100" autoCorrect={false} /></View>
      </Row>
      <Note>{count ? `${count} numbers, including both endpoints.` : 'Enter matching prefixes, or use digits only. Maximum 2,000 bonds per range.'}</Note>
    </> : <>
      <Label>Bond numbers</Label>
      <Input accessibilityLabel="Pasted bond numbers" value={f.bulk} onChangeText={bulk => setAddForm({ bulk })} maxLength={100000} multiline numberOfLines={4} upper autoCorrect={false} placeholder="Up to 10,000 numbers separated by commas, spaces or new lines" />
    </>}
    <Note>Use exactly six digits. Leading zeros are preserved; series letters are optional.</Note>
    <Label>{f.mode === 'range' ? 'Purchase date for this range (required)' : f.mode === 'bulk' ? 'Purchase date for these bonds (required)' : 'Purchase date (required)'}</Label>
    <DateInput value={f.dt} onChange={dt => setAddForm({ dt })} allowEmpty={false} placeholder="Type a date or choose it from the calendar" />
    <Note>Only draws strictly after this date count as your wins.</Note>
    <Label>Holder (optional)</Label>
    <Input accessibilityLabel="Bond holder" value={f.holder} onChangeText={holder => setAddForm({ holder })} placeholder="Whose bond is this?" maxLength={120} />
    <Label>Note / location (optional)</Label>
    <Input accessibilityLabel="Bond note" value={f.note} onChangeText={note => setAddForm({ note })} placeholder="e.g. Almirah, file 3" maxLength={2000} />
    <Btn disabled={mutating} title={mutating ? 'Saving…' : f.mode === 'single' ? 'Add bond' : f.mode === 'range' ? 'Preview range' : 'Preview pasted numbers'} onPress={f.mode === 'single' ? addSingle : preview} />
    <View style={{ marginTop: 16 }}><CsvImport /></View>
  </ScrollView>;
}
