import type { Bond, DB } from '../types';
import type { BondDraft } from './types';

export const SUPPORTED_DENOMINATIONS = [100, 200, 750, 1500, 25000, 40000];
export function normalizeBond(input: BondDraft) {
  if (!SUPPORTED_DENOMINATIONS.includes(input.d))
    throw new Error(`Rs${input.d} is not supported by automatic checking`);
  if (typeof input.n !== 'string')
    throw new Error('Bond numbers must be text with all six digits');
  const match = input.n
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .match(/^([A-Z]*)(\d{6})$/);
  if (!match)
    throw new Error(
      'Enter exactly six digits; an optional series prefix is allowed',
    );
  const series = (input.series || match[1]).trim().toUpperCase();
  if (
    !/^[A-Z]*$/.test(series) ||
    (match[1] && input.series && match[1] !== series)
  )
    throw new Error('Series and number prefix disagree');
  if (!input.date)
    throw new Error(
      'Enter the purchase date; only later draws can count as your wins',
    );
  if (input.date) {
    const date = new Date(`${input.date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
      !Number.isFinite(+date) ||
      date.toISOString().slice(0, 10) !== input.date
    )
      throw new Error('Invalid purchase date');
  }
  return {
    denomination: input.d,
    number: match[2],
    series,
    purchased_on: input.date || null,
    note: input.note.trim(),
    holder: input.holder.trim(),
  };
}
export function migrationPreview(
  db: DB,
  workspace: string,
  existing: Bond[] = [],
) {
  const seen = new Set(
    existing.map(b => {
      try {
        const n = normalizeBond(b);
        return `${n.denomination}:${n.series}:${n.number}`;
      } catch {
        return '';
      }
    }),
  );
  const valid: { legacy_id: string; bond: ReturnType<typeof normalizeBond> }[] =
    [];
  const invalid: { id: number; number: string; reason: string }[] = [];
  const duplicates: { id: number; number: string }[] = [];
  const counts: Record<string, number> = {};
  for (const bond of db.groups[workspace]?.bonds ?? []) {
    try {
      const value = normalizeBond(bond);
      const key = `${value.denomination}:${value.series}:${value.number}`;
      if (seen.has(key)) {
        duplicates.push({ id: bond.id, number: bond.n });
        continue;
      }
      seen.add(key);
      counts[value.denomination] = (counts[value.denomination] ?? 0) + 1;
      valid.push({ legacy_id: `${workspace}:${bond.id}`, bond: value });
    } catch (error) {
      invalid.push({
        id: bond.id,
        number: String(bond.n),
        reason: (error as Error).message,
      });
    }
  }
  return { valid, invalid, duplicates, counts };
}
