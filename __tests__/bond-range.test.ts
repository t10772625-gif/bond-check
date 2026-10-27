import { genRange } from '../src/utils';
import { normalizeBond } from '../src/cloud/migration';

test('range keeps leading zeros and includes exactly 2000 numbers at the limit', () => {
  const range = genRange('000001', '002000');
  expect(range).toHaveLength(2000);
  expect(range?.[0]).toBe('000001');
  expect(range?.[1999]).toBe('002000');
  expect(genRange('000001', '002001')).toBeNull();
});

test('series ranges preserve the prefix and reject reversed or mixed-series ranges', () => {
  expect(genRange('AB007447', 'AB007449')).toEqual([
    'AB007447',
    'AB007448',
    'AB007449',
  ]);
  expect(genRange('AB007447', 'CD007449')).toBeNull();
  expect(genRange('000200', '000100')).toBeNull();
});

test('purchase date is required and impossible calendar dates are rejected', () => {
  const bond = { n: '007447', d: 750, date: '', note: '', holder: '' };
  expect(() => normalizeBond(bond)).toThrow('purchase date');
  expect(() => normalizeBond({ ...bond, date: '2016-02-30' })).toThrow(
    'Invalid purchase date',
  );
});
