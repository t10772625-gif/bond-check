import type { Bond, DB } from '../types';

type Extra = Partial<Pick<Bond, 'note' | 'holder' | 'by' | 'wins'>>;

export const makeBond = (db: DB, n: string, d: number, date: string, x: Extra = {}): Bond => ({
  id: db.uid++,
  n,
  d,
  date,
  series: '',
  note: x.note || '',
  holder: x.holder || '',
  by: x.by || '',
  wins: x.wins || [],
  st: 'active',
});

/** Demo data, same as the HTML prototype. */
export function seed(): DB {
  const db: DB = { users: [], groups: {}, DRAWS: [], PRIZE: {}, SCHED: [], uid: 1, sess: null, filer: true };
  const a: Bond[] = [];
  for (let i = 123400; i <= 123460; i++) {
    if ([123405, 123411, 123420, 123421].includes(i)) continue;
    const x: Extra = { by: 'Demo User', holder: 'Me' };
    if (i === 123407) x.wins = [{ no: 106, date: '2026-04-15', rank: '1st', claim: { date: '2026-04-25', rcv: 1275000 } }];
    if (i === 123415) x.wins = [{ no: 107, date: '2026-07-15', rank: '1st', claim: null }];
    if (i === 123433) x.wins = [{ no: 107, date: '2026-07-15', rank: '2nd', claim: null }];
    const b = makeBond(db, 'BD' + i, 750, i === 123407 ? '2026-04-20' : '2026-01-10', x);
    if (i === 123400) b.note = 'Almirah, file 3';
    a.push(b);
  }
  ['AB445010', 'AB445011', 'AB445012'].forEach(n =>
    a.push(makeBond(db, n, 1500, '2026-03-01', { by: 'Demo User', holder: 'Me' })),
  );
  const fam = [555001, 555002, 555003, 555004, 555005, 555006].map(i =>
    makeBond(db, 'BD' + i, 750, '2026-02-01', { by: 'Dad', holder: i < 555004 ? 'Dad' : 'Uncle' }),
  );
  db.groups = {
    'BOND-ME001': {
      name: 'Demo User’s Bonds',
      personal: true,
      bonds: a,
      trash: [],
      members: [{ id: 'demo@bondcheck.pk', name: 'Demo User', role: 'Owner' }],
    },
    'BOND-ABBU7': {
      name: 'Dad’s Family',
      bonds: fam,
      trash: [],
      members: [
        { id: 'dad@family', name: 'Dad', role: 'Owner' },
        { id: 'uncle@family', name: 'Uncle', role: 'Editor' },
      ],
    },
  };
  db.users = [{ name: 'Demo User', id: 'demo@bondcheck.pk', pw: '123456', own: 'BOND-ME001', ws: ['BOND-ME001'] }];
  db.DRAWS = [
    { no: 108, den: 750, date: '2026-10-15', city: 'Rawalpindi', w: { BD123441: '1st', BD123407: '2nd', BD123415: '3rd', BD555003: '3rd', BD129999: '3rd' } },
    { no: 107, den: 750, date: '2026-07-15', city: 'Lahore', w: { BD123415: '1st', BD123433: '2nd' } },
    { no: 106, den: 750, date: '2026-04-15', city: 'Quetta', w: { BD123407: '1st' } },
    { no: 106, den: 1500, date: '2026-05-15', city: 'Sialkot', w: { AB445011: '1st' } },
  ];
  db.PRIZE = {
    750: { '1st': 1500000, '2nd': 500000, '3rd': 9300 },
    1500: { '1st': 3000000, '2nd': 1000000, '3rd': 18500 },
  };
  db.SCHED = [{ id: 1, den: 1500, date: '2026-11-16', city: '', remind: true }];
  return db;
}
