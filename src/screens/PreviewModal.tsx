import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Badge, Btn, Check, Chips, FullModal, Row, SearchBar, Txt, matches } from '../components/ui';
import { StagedItem, StagedState, useApp } from '../store/AppStore';
import { fonts, useTheme } from '../theme';
import { fd, fmt, norm, split } from '../utils';

type View_ = 'all' | 'sel' | 'unsel' | 'issues';
const ROW_H = 56;

interface RowProps {
  item: StagedItem;
  index: number;
  state: StagedState;
  editing: boolean;
  onToggle: (key: number) => void;
  onEdit: (key: number) => void;
  onRemove: (key: number) => void;
  onSaveEdit: (key: number, value: string) => void;
  onCancelEdit: () => void;
}

function EditRow({ item, onSaveEdit, onCancelEdit }: Pick<RowProps, 'item' | 'onSaveEdit' | 'onCancelEdit'>) {
  const { c } = useTheme();
  const [val, setVal] = useState(item.n);
  return (
    <View style={{ height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: c.yel, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <TextInput
        value={val}
        onChangeText={setVal}
        autoFocus
        autoCapitalize="characters"
        autoCorrect={false}
        onSubmitEditing={() => onSaveEdit(item.key, val)}
        style={{ flex: 1, fontFamily: fonts.mono, fontSize: 16, fontWeight: '700', color: c.ink, borderWidth: 1.5, borderColor: c.em2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: c.surf }}
      />
      <Pressable onPress={() => onSaveEdit(item.key, val)} hitSlop={6} style={{ backgroundColor: c.em, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ color: '#fff', fontWeight: '800' }}>✓ OK</Text>
      </Pressable>
      <Pressable onPress={onCancelEdit} hitSlop={6} style={{ padding: 6 }}>
        <Text style={{ color: c.mut, fontWeight: '800', fontSize: 16 }}>✕</Text>
      </Pressable>
    </View>
  );
}

const PreviewRow = memo(function PreviewRow({ item, index, state, editing, onToggle, onEdit, onRemove, onSaveEdit, onCancelEdit }: RowProps) {
  const { c } = useTheme();
  const bad = state !== 'ok';
  const bg = state === 'invalid' ? c.redbg : state === 'ok' ? c.surf : c.grey;
  if (editing) return <EditRow item={item} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit} />;

  return (
    <View style={{ height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, backgroundColor: bg, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <Txt style={{ width: 34, fontSize: 11, color: c.mut }}>{index + 1}</Txt>
      <Check value={item.on && !bad} onChange={() => onToggle(item.key)} />
      <Pressable style={{ flex: 1 }} onPress={() => onToggle(item.key)}>
        <Txt
          numberOfLines={1}
          style={{
            fontFamily: fonts.mono,
            fontWeight: '700',
            fontSize: 16,
            color: state === 'invalid' ? c.red : bad || !item.on ? c.mut : c.ink,
            textDecorationLine: !item.on && !bad ? 'line-through' : 'none',
          }}>
          {item.n}
        </Txt>
        {state === 'invalid' ? <Txt style={{ fontSize: 11, color: c.red }}>Invalid format — tap ✏️ to fix</Txt> : null}
      </Pressable>
      {state === 'exists' ? (
        <View style={{ alignSelf: 'center' }}>
          <Badge kind="n" text="already added" />
        </View>
      ) : null}
      {state === 'dup' ? (
        <View style={{ alignSelf: 'center' }}>
          <Badge kind="g" text="repeated" />
        </View>
      ) : null}
      <Pressable onPress={() => onEdit(item.key)} hitSlop={8} style={{ padding: 4 }}>
        <Text style={{ fontSize: 17 }}>✏️</Text>
      </Pressable>
      <Pressable onPress={() => onRemove(item.key)} hitSlop={8} style={{ padding: 4 }}>
        <Text style={{ fontSize: 18, color: c.red, fontWeight: '800' }}>✕</Text>
      </Pressable>
    </View>
  );
});

export default function PreviewModal() {
  const app = useApp();
  const { staged, setStaged, previewOpen, setPreviewOpen, stagedStates, saveStaged, discardStaged, addForm, toast, cur, B, confirm } = app;
  const { c } = useTheme();
  const [ps, setPs] = useState('');
  const [view, setView] = useState<View_>('all');
  const [editKey, setEditKey] = useState<number | null>(null);
  const dq = useDeferredValue(ps);
  useEffect(() => {
    if (previewOpen) {
      setPs('');
      setView('all');
      setEditKey(null);
    }
  }, [previewOpen]);

  const items = useMemo(() => staged?.items ?? [], [staged]);
  const states = useMemo(() => stagedStates(items), [items, B().length]); // eslint-disable-line react-hooks/exhaustive-deps
  const stateByKey = useMemo(() => {
    const m = new Map<number, StagedState>();
    items.forEach((it, i) => m.set(it.key, states[i]));
    return m;
  }, [items, states]);

  const counts = useMemo(() => {
    let save = 0, unsel = 0, invalid = 0, exists = 0, dup = 0;
    items.forEach((it, i) => {
      const s = states[i];
      if (s === 'invalid') invalid++;
      else if (s === 'exists') exists++;
      else if (s === 'dup') dup++;
      else if (it.on) save++;
      else unsel++;
    });
    return { save, unsel, invalid, exists, dup };
  }, [items, states]);

  const shown = useMemo(
    () =>
      items
        .map((it, i) => ({ it, i }))
        .filter(({ it, i }) => {
          const s = states[i];
          if (view === 'sel' && !(it.on && s === 'ok')) return false;
          if (view === 'unsel' && !(!it.on && s === 'ok')) return false;
          if (view === 'issues' && s === 'ok') return false;
          return matches(dq, it.n);
        }),
    [items, states, view, dq],
  );

  const update = useCallback(
    (fn: (list: StagedItem[]) => StagedItem[], removedDelta = 0) =>
      setStaged(st => (st ? { ...st, items: fn(st.items), removed: st.removed + removedDelta } : st)),
    [setStaged],
  );

  const onToggle = useCallback(
    (key: number) => {
      const s = stateByKey.get(key);
      if (s === 'invalid') return toast('Invalid number — tap ✏️ to fix it first');
      if (s === 'exists') return toast('Already in this workspace — it will be skipped');
      if (s === 'dup') return toast('Repeated in this list — only the first one is saved');
      update(list => list.map(x => (x.key === key ? { ...x, on: !x.on } : x)));
    },
    [stateByKey, toast, update],
  );

  const onRemove = useCallback(
    (key: number) => {
      let removed: { item: StagedItem; index: number } | null = null;
      setStaged(st => {
        if (!st) return st;
        const index = st.items.findIndex(x => x.key === key);
        if (index < 0) return st;
        removed = { item: st.items[index], index };
        return { ...st, items: st.items.filter(x => x.key !== key), removed: st.removed + 1 };
      });
      setTimeout(() => {
        const r = removed as { item: StagedItem; index: number } | null;
        if (!r) return;
        toast(r.item.n + ' removed from list', 'Undo', () =>
          setStaged(st => {
            if (!st || st.items.some(x => x.key === r.item.key)) return st;
            const next = st.items.slice();
            next.splice(Math.min(r.index, next.length), 0, r.item);
            return { ...st, items: next, removed: Math.max(0, st.removed - 1) };
          }),
        );
      }, 0);
    },
    [setStaged, toast],
  );

  const onSaveEdit = useCallback(
    (key: number, value: string) => {
      const n = norm(value);
      if (!split(n)) return toast('Invalid format. Use letters + 5–8 digits, e.g. BD123430');
      if (items.some(x => x.key !== key && x.n === n)) return toast(n + ' is already in this list');
      update(list => list.map(x => (x.key === key ? { ...x, n, on: true } : x)));
      setEditKey(null);
      toast('Updated to ' + n);
    },
    [items, toast, update],
  );

  const onEdit = useCallback((key: number) => setEditKey(key), []);
  const onCancelEdit = useCallback(() => setEditKey(null), []);

  /** Select all / clear / invert — applies to the rows currently shown (after search & filter). */
  const bulk = (m: 0 | 1 | 2) => {
    const keys = new Set(shown.filter(({ i }) => states[i] === 'ok').map(({ it }) => it.key));
    update(list => list.map(x => (keys.has(x.key) ? { ...x, on: m === 1 ? true : m === 0 ? false : !x.on } : x)));
  };

  const removeUnselected = () => {
    const drop = items.filter((it, i) => !(it.on && states[i] === 'ok'));
    if (!drop.length) return toast('Nothing to remove');
    confirm({
      icon: '🧹',
      title: 'Clean up the list?',
      message: `${drop.length} unticked, invalid or already-added numbers will be removed from this list. Your selected numbers stay.`,
      buttons: [
        {
          text: `Remove ${drop.length} numbers`,
          style: 'red',
          onPress: () => {
            const keys = new Set(drop.map(d => d.key));
            update(list => list.filter(x => !keys.has(x.key)), drop.length);
          },
        },
        { text: 'Cancel', style: 'alt' },
      ],
    });
  };

  const confirmSave = () => {
    if (!counts.save) return toast('No valid new numbers selected');
    const skipped = counts.unsel + counts.invalid + counts.exists + counts.dup;
    const rows: [string, string][] = [
      ['Workspace', cur?.name || ''],
      ['Bonds to save', String(counts.save)],
      ['Denomination', fmt(addForm.den)],
      ['Total value', fmt(counts.save * addForm.den)],
      ['Purchase date', addForm.dt ? fd(addForm.dt) : 'Unknown'],
    ];
    if (addForm.holder) rows.push(['Holder', addForm.holder]);
    if (addForm.note) rows.push(['Note', addForm.note]);
    if (staged?.removed) rows.push(['Removed by you', String(staged.removed)]);
    if (skipped) rows.push(['Skipped', [counts.unsel && `${counts.unsel} unticked`, counts.exists && `${counts.exists} already added`, counts.invalid && `${counts.invalid} invalid`, counts.dup && `${counts.dup} repeated`].filter(Boolean).join(', ')]);
    confirm({
      icon: '💾',
      title: `Save ${counts.save} bond${counts.save === 1 ? '' : 's'}?`,
      message: 'Check the details below. Only ticked, valid and new numbers are saved.',
      rows,
      buttons: [
        { text: `Yes, save ${counts.save}`, style: 'primary', onPress: saveStaged },
        { text: 'Review again', style: 'alt' },
      ],
    });
  };

  const confirmDiscard = () =>
    confirm({
      icon: '🗑',
      title: 'Discard this list?',
      message: 'The whole preview list will be deleted. Nothing is added to your bonds.',
      buttons: [
        { text: 'Discard list', style: 'red', onPress: discardStaged },
        { text: 'Keep it', style: 'alt' },
      ],
    });

  const close = () => {
    setEditKey(null);
    setPreviewOpen(false);
    if (staged) toast('Draft kept — open it again from the Add tab');
  };

  if (!staged) return null;
  const first = items[0]?.n || '';
  const last = items[items.length - 1]?.n || '';
  const subtitle = `${staged.source === 'range' ? `${first}–${last}` : 'Pasted numbers'} · ${items.length} bonds${staged.removed ? ` · ${staged.removed} removed` : ''}${staged.msg ? ' · ' + staged.msg : ''}`;
  const problems = counts.invalid + counts.exists + counts.dup;

  const header = (
    <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
        <Badge kind="w" text={`✓ ${counts.save} to save`} />
        {counts.unsel ? <Badge text={`${counts.unsel} unticked`} /> : null}
        {counts.exists ? <Badge kind="n" text={`${counts.exists} already added`} /> : null}
        {counts.invalid ? <Badge kind="n" text={`${counts.invalid} invalid`} /> : null}
        {counts.dup ? <Badge kind="g" text={`${counts.dup} repeated`} /> : null}
      </View>
      <Txt style={{ fontSize: 12, color: c.mut, marginVertical: 4 }}>
        {fmt(addForm.den)} · {addForm.dt ? 'Since ' + fd(addForm.dt) : 'Date unknown'}
        {addForm.holder ? ' · ' + addForm.holder : ''}
        {addForm.note ? ' · ' + addForm.note : ''} — change these on the Add screen
      </Txt>
      <SearchBar
        value={ps}
        onChange={setPs}
        placeholder="Search number, e.g. 430"
        count={dq ? `${shown.length} match${shown.length === 1 ? '' : 'es'}` : undefined}
      />
      <Chips<View_>
        options={[
          ['all', `All (${items.length})`],
          ['sel', `Selected (${counts.save})`],
          ['unsel', `Unticked (${counts.unsel})`],
          ['issues', `Problems (${problems})`],
        ]}
        value={view}
        onChange={setView}
      />
      <Row style={{ marginTop: 0 }}>
        <Btn sm variant="alt" title="Select all" onPress={() => bulk(1)} />
        <Btn sm variant="alt" title="Clear" onPress={() => bulk(0)} />
        <Btn sm variant="alt" title="Invert" onPress={() => bulk(2)} />
      </Row>
      <Txt style={{ fontSize: 11, color: c.mut, marginBottom: 6 }}>
        Tick = save · ✏️ = fix number · ✕ = remove from list{dq || view !== 'all' ? ' · buttons apply to the rows shown' : ''}
      </Txt>
    </View>
  );

  return (
    <FullModal
      visible={previewOpen}
      onClose={close}
      title="Review bonds"
      subtitle={subtitle}
      footer={
        <>
          <Btn title={`💾 Save ${counts.save} bond${counts.save === 1 ? '' : 's'}`} onPress={confirmSave} />
          <Row style={{ marginBottom: 0 }}>
            <Btn sm variant="alt" title="‹ Back (keep draft)" onPress={close} />
            <Btn sm variant="alt" title="Remove unticked" onPress={removeUnselected} />
            <Btn sm variant="red" title="Discard" onPress={confirmDiscard} />
          </Row>
        </>
      }>
      {header}
      <FlatList
        style={{ flex: 1 }}
        data={shown}
        keyExtractor={x => String(x.it.key)}
        keyboardShouldPersistTaps="handled"
        getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
        initialNumToRender={20}
        maxToRenderPerBatch={30}
        windowSize={11}
        extraData={editKey}
        renderItem={({ item: { it, i } }) => (
          <PreviewRow
            item={it}
            index={i}
            state={states[i]}
            editing={editKey === it.key}
            onToggle={onToggle}
            onEdit={onEdit}
            onRemove={onRemove}
            onSaveEdit={onSaveEdit}
            onCancelEdit={onCancelEdit}
          />
        )}
        ListEmptyComponent={<Txt style={{ textAlign: 'center', color: c.mut, padding: 24 }}>{dq ? `No number matches “${dq}”.` : 'Nothing here.'}</Txt>}
      />
    </FullModal>
  );
}
