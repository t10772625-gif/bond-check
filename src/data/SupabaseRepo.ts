import type { Bond, Rank, Win } from '../types';
import type {
  BondDraft,
  CloudDraw,
  CloudSnapshot,
  DrawFile,
  PipelineStatus,
} from '../cloud/types';
import { SupabaseApi } from '../cloud/api';
import { normalizeBond } from '../cloud/migration';
import type { BondRepository } from './BondRepository';

interface StoredWin {
  id: string;
  draw_id: string;
  tier: number;
  prize_amount: number;
  provisional: boolean;
  acknowledged_at: string | null;
  claim_date: string | null;
  claim_received: number | null;
  draws: CloudDraw;
}
interface StoredBond {
  id: string;
  local_id: number;
  number: string;
  denomination: number;
  series: string;
  purchased_on: string | null;
  note: string;
  holder: string;
  archived: boolean;
  deleted_at: string | null;
  wins: StoredWin[];
}
function dateConflict(draw: CloudDraw) {
  return !!draw.held_on && draw.held_on !== draw.draw_date;
}
function toBond(row: StoredBond): Bond {
  const wins: Win[] = row.wins
    .map(win => ({
      no: win.draws.draw_no ?? 0,
      date: win.draws.draw_date,
      rank: (['1st', '2nd', '3rd'] as Rank[])[win.tier - 1],
      claim: win.claim_date
        ? { date: win.claim_date, rcv: win.claim_received ?? 0 }
        : null,
      cloudId: win.id,
      drawId: win.draw_id,
      amount: win.prize_amount,
      provisional: win.provisional || dateConflict(win.draws),
      acknowledged: !!win.acknowledged_at,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    id: Number(row.local_id),
    cloudId: row.id,
    n: row.series + row.number,
    d: row.denomination,
    series: row.series,
    date: row.purchased_on ?? '',
    holder: row.holder,
    note: row.note,
    by: '',
    wins,
    st: row.archived ? 'archived' : 'active',
  };
}
export class SupabaseRepo implements BondRepository {
  constructor(readonly api: SupabaseApi) {}
  private rows() {
    return this.api.select<StoredBond>(
      'bonds',
      { select: '*,wins(*,draws(*))', order: 'local_id.desc' },
      true,
    );
  }
  async list() {
    return (await this.rows()).filter(b => !b.deleted_at).map(toBond);
  }
  async snapshot(): Promise<CloudSnapshot> {
    const [rows, draws, files, status] = await Promise.all([
      this.rows(),
      this.api.select<CloudDraw>('draws', { order: 'id.asc' }, true),
      this.api.select<DrawFile>(
        'draw_files',
        { select: 'id,draw_id,url,kind,label,parse_status,issues,sha256' },
        true,
      ),
      this.api.rpc<PipelineStatus>('pipeline_status'),
    ]);
    const reviewedDraws: CloudDraw[] = draws.map(draw => dateConflict(draw) ? {
      ...draw,
      status: 'needs_review',
      issues: [...draw.issues, `Draw date differs: listed ${draw.draw_date}, file ${draw.held_on}; official date needs verification`],
    } : draw);
    const conflictingVerified = draws.filter(draw => dateConflict(draw) && ['ok', 'ok_manual'].includes(draw.status)).length;
    return {
      bonds: rows.filter(b => !b.deleted_at).map(toBond),
      trash: rows.filter(b => b.deleted_at).map(toBond),
      draws: reviewedDraws.sort((a, b) => b.draw_date.localeCompare(a.draw_date)),
      files,
      status: { ...status, verified: Math.max(0, status.verified - conflictingVerified), attention: status.attention + conflictingVerified },
      fetchedAt: new Date().toISOString(),
    };
  }
  async add(drafts: BondDraft[]) {
    const normalized = drafts.map(normalizeBond);
    // One transaction through one PostgREST INSERT: no partially uploaded range.
    await this.api.request('/rest/v1/bonds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalized),
    });
  }
  async update(
    bond: Bond,
    draft: Partial<BondDraft> & {
      archived?: boolean;
      deleted_at?: string | null;
    },
  ) {
    if (!bond.cloudId)
      throw new Error('This is a local bond; use the migration preview first');
    const values = {
      ...normalizeBond({ ...bond, ...draft }),
      ...(draft.archived !== undefined ? { archived: draft.archived } : {}),
      ...(draft.deleted_at !== undefined
        ? { deleted_at: draft.deleted_at }
        : {}),
    };
    const updated = await this.api.request<StoredBond[]>(
      `/rest/v1/bonds?id=eq.${encodeURIComponent(bond.cloudId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(values),
      },
    );
    if (!Array.isArray(updated) || updated.length !== 1)
      throw new Error('This bond has changed or is no longer available. Refresh and try again.');
  }
  remove(bond: Bond) {
    return this.update(bond, { deleted_at: new Date().toISOString() });
  }
}
