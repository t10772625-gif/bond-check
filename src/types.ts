export type Role = 'Owner' | 'Editor' | 'Viewer';
export type Rank = '1st' | '2nd' | '3rd';

export interface Claim {
  date: string;
  rcv: number;
}

export interface Win {
  no: number;
  date: string;
  rank: Rank;
  claim: Claim | null;
}

export interface Bond {
  id: number;
  n: string;
  d: number;
  date: string;
  series: string;
  note: string;
  holder: string;
  by: string;
  wins: Win[];
  st: 'active' | 'archived';
}

export interface Member {
  id: string;
  name: string;
  role: Role;
}

export interface Workspace {
  name: string;
  personal?: boolean;
  bonds: Bond[];
  trash: Bond[];
  members: Member[];
}

export interface User {
  name: string;
  id: string;
  pw: string;
  own: string;
  ws: string[];
}

export interface Draw {
  no: number;
  den: number;
  date: string;
  city: string;
  w: Record<string, Rank>;
}

export interface Sched {
  id: number;
  den: number;
  date: string;
  city: string;
  remind: boolean;
}

export interface DB {
  users: User[];
  groups: Record<string, Workspace>;
  DRAWS: Draw[];
  PRIZE: Record<string, Partial<Record<Rank, number>>>;
  SCHED: Sched[];
  uid: number;
  sess: string | null;
  filer: boolean;
}

export type Tab = 'home' | 'add' | 'check' | 'results' | 'set';
export type Phase = 'splash' | 'auth' | 'locked' | 'loading' | 'app' | 'logout';
export type BondMode = 'view' | 'claim' | 'renew' | 'edit' | 'del';

export type SheetState =
  | { kind: 'bond'; id: number; m: BondMode; wi?: number }
  | { kind: 'ws' }
  | { kind: 'import' }
  | { kind: 'export' }
  | { kind: 'logout' }
  | null;

export interface CheckResult {
  dr: Draw;
  won: number[];
  already: number[];
  old: number[];
  nf: number[];
  arch: number[];
  other: string[];
  inv: string[];
  notmine: number;
  total: number;
}

export interface WinRow {
  b: Bond;
  w: Win;
  i: number;
  a: number;
}

export interface Summary {
  A: Bond[];
  act: Bond[];
  W: WinRow[];
  by: Record<string, { c: number; v: number; w: number; p: number }>;
  gross: number;
  net: number;
  rcv: number;
  pn: number;
  pnet: number;
  bought: number;
  boughtVal: number;
  heldVal: number;
  uniq: number;
}
