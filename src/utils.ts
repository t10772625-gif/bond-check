export const DEN = [750, 1500, 7500, 15000, 25000, 40000];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date as YYYY-MM-DD in local time. */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** 1234567 -> "1,234,567" (no Intl dependency). */
export const commas = (n: number) => {
  const neg = n < 0;
  const s = String(Math.round(Math.abs(n)));
  return (neg ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export const fmt = (n: number | string | undefined | null) => 'Rs. ' + commas(Number(n || 0));

/** "2026-10-19" -> "19 Oct 2026" */
export const fd = (s?: string | null) => {
  if (!s) return 'Date unknown';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
};

const toUTC = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export const addDays = (s: string, n: number) => new Date(toUTC(s) + n * 864e5).toISOString().slice(0, 10);

export const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 864e5);

export const norm = (s: string) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

export const split = (s: string) => {
  const m = norm(s).match(/^([A-Z]*)(\d{5,8})$/);
  return m ? { p: m[1], d: m[2] } : null;
};

export const nums = (t: string) => [...new Set(String(t).split(/[\s,;]+/).map(norm).filter(Boolean))];

export function genRange(a: string, b: string): string[] | null {
  const x = split(a);
  const y = split(b);
  if (!x || !y || x.p !== y.p) return null;
  const s = +x.d;
  const e = +y.d;
  if (e < s || e - s > 2000) return null;
  const o: string[] = [];
  for (let i = s; i <= e; i++) o.push(x.p + String(i).padStart(x.d.length, '0'));
  return o;
}

export const newCode = () => 'BOND-' + Math.random().toString(36).slice(2, 7).toUpperCase().padEnd(5, 'X');

export const firstName = (n: string) => n.split(' ')[0];

export const plural = (n: number, word: string, many = word + 's') => `${n} ${n === 1 ? word : many}`;
