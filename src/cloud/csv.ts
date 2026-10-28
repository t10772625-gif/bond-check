import type { Bond } from '../types';
import { normalizeBond } from './migration';
import type { BondDraft } from './types';

export function previewCsv(text: string, existing: Bond[] = []) {
  if (text.length > 1024 * 1024) throw new Error('Import up to 1 MB of CSV at a time');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      if (rows.length > 10001) throw new Error('Import up to 10,000 bonds at a time');
      row = [];
      cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted value');
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  if (rows.length > 10001) throw new Error('Import up to 10,000 bonds at a time');
  const header = rows.shift()?.map(value => value.trim().toLowerCase()) ?? [];
  if (new Set(header).size !== header.length) throw new Error('CSV has duplicate column headings');
  if (
    !header.includes('number') ||
    !header.includes('denomination') ||
    !header.includes('purchased_on')
  )
    throw new Error(
      'CSV needs number, denomination and purchased_on column headings',
    );
  const seen = new Set(
    existing.map(b => {
      try {
        const value = normalizeBond(b);
        return `${value.denomination}:${value.series}:${value.number}`;
      } catch {
        return '';
      }
    }),
  );
  const valid: BondDraft[] = [];
  const invalid: { row: number; reason: string }[] = [];
  let duplicates = 0;
  rows.forEach((values, index) => {
    try {
      if (values.length !== header.length)
        throw new Error('Column count differs from the header');
      const fields = Object.fromEntries(
        header.map((key, i) => [key, values[i].trim()]),
      );
      const draft: BondDraft = {
        n: fields.number,
        d: Number(fields.denomination.replace(/,/g, '')),
        series: fields.series ?? '',
        date: fields.purchased_on ?? '',
        holder: fields.holder ?? '',
        note: fields.note ?? '',
        ...(fields.archived ? { archived: /^(true|1|yes|archived)$/i.test(fields.archived) } : {}),
      };
      const bond = normalizeBond(draft);
      const key = `${bond.denomination}:${bond.series}:${bond.number}`;
      if (seen.has(key)) {
        duplicates++;
        return;
      }
      seen.add(key);
      valid.push(draft);
    } catch (error) {
      invalid.push({ row: index + 2, reason: (error as Error).message });
    }
  });
  return { valid, invalid, duplicates };
}
