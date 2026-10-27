import type { Bond, DB, Workspace } from '../types';
import type { BondDraft } from '../cloud/types';
import { normalizeBond } from '../cloud/migration';

export interface BondRepository {
  list(): Promise<Bond[]>;
  add(drafts: BondDraft[]): Promise<void>;
  update(
    bond: Bond,
    draft: Partial<BondDraft> & {
      archived?: boolean;
      deleted_at?: string | null;
    },
  ): Promise<void>;
  remove(bond: Bond): Promise<void>;
}

// Adapter over the existing in-memory workspace and its AsyncStorage persistence.
export class LocalStorageRepo implements BondRepository {
  constructor(
    private database: () => DB,
    private workspace: () => Workspace,
    private persist: () => void,
  ) {}
  async list() {
    return this.workspace().bonds;
  }
  async add(drafts: BondDraft[]) {
    for (const draft of drafts) {
      normalizeBond(draft);
      if (this.workspace().bonds.some(b => b.n === draft.n && b.d === draft.d))
        throw new Error('Bond already exists');
      this.workspace().bonds.push({
        ...draft,
        id: this.database().uid++,
        series: draft.series ?? '',
        by: '',
        wins: [],
        st: 'active',
      });
    }
    this.persist();
  }
  async update(bond: Bond, draft: Partial<BondDraft> & { archived?: boolean }) {
    normalizeBond({ ...bond, ...draft });
    Object.assign(bond, draft);
    if (draft.archived !== undefined)
      bond.st = draft.archived ? 'archived' : 'active';
    this.persist();
  }
  async remove(bond: Bond) {
    const workspace = this.workspace();
    workspace.bonds = workspace.bonds.filter(b => b.id !== bond.id);
    workspace.trash.unshift(bond);
    this.persist();
  }
}
