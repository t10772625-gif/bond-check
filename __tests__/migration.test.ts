import { migrationPreview, normalizeBond } from '../src/cloud/migration';
import { seed } from '../src/store/seed';
import { previewCsv } from '../src/cloud/csv';

test('bond normalization preserves zeros, separates series and rejects lost digits', () => {
  expect(
    normalizeBond({
      n: 'AB007447',
      d: 750,
      date: '2016-01-15',
      note: '',
      holder: '',
    }),
  ).toMatchObject({ number: '007447', series: 'AB', denomination: 750 });
  for (const n of ['7447', '01234', '0001234'])
    expect(() =>
      normalizeBond({ n, d: 750, date: '', note: '', holder: '' }),
    ).toThrow();
  expect(() =>
    normalizeBond({ n: '007447', d: 7500, date: '', note: '', holder: '' }),
  ).toThrow('not supported');
});

test('migration reports invalid rows and duplicates without mutating or dropping the original', () => {
  const db = seed();
  const original = db.groups['BOND-ME001'].bonds[0];
  db.groups['BOND-ME001'].bonds = [
    { ...original, n: 'AB000001' },
    { ...original, id: 999, n: 'AB000001' },
    { ...original, id: 1000, n: 'AB12345' },
    { ...original, id: 1001, n: 'CD000001' },
  ];
  const before = JSON.stringify(db);
  const preview = migrationPreview(db, 'BOND-ME001');
  expect(preview.valid.map(row => row.bond.number)).toEqual([
    '000001',
    '000001',
  ]);
  expect(preview.valid.map(row => row.bond.series)).toEqual(['AB', 'CD']);
  expect(preview.invalid).toHaveLength(1);
  expect(preview.duplicates).toHaveLength(1);
  expect(preview.valid[0].legacy_id).toBe('BOND-ME001:' + original.id);
  expect(JSON.stringify(db)).toBe(before);
});

test('CSV preserves zero-prefixed numbers and quoted cells; invalid rows remain visible', () => {
  const preview = previewCsv(
    'number,denomination,series,purchased_on,note\n007447,750,AB,2016-01-15,"file 1, top shelf"\n007447,750,AB,2016-01-15,duplicate\n7447,750,,2016-01-15,bad\n000381,200,,2016-01-15,valid',
  );
  expect(preview.valid).toHaveLength(2);
  expect(preview.valid[0].n).toBe('007447');
  expect(preview.valid[0].note).toBe('file 1, top shelf');
  expect(preview.duplicates).toBe(1);
  expect(preview.invalid).toHaveLength(1);
  expect(() => previewCsv('number,denomination\n"000123,750')).toThrow(
    'unclosed',
  );
});

test('CSV rejects ambiguous headers and enforces its row limit even without a trailing newline', () => {
  expect(() => previewCsv('number,denomination,purchased_on,number\n000001,100,2020-01-01,000002')).toThrow('duplicate column');
  const rows = Array.from({ length: 10001 }, (_, index) => `${String(index).padStart(6, '0')},100,2020-01-01`);
  expect(() => previewCsv('number,denomination,purchased_on\n' + rows.join('\n'))).toThrow('10,000');
  expect(previewCsv('number,denomination,purchased_on,archived\n000001,100,2020-01-01,true').valid[0].archived).toBe(true);
});
