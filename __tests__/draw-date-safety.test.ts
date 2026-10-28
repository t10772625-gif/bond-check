import { SupabaseApi } from '../src/cloud/api';
import { SupabaseRepo } from '../src/data/SupabaseRepo';

test('conflicting official dates stay possible and are removed from verified coverage', async () => {
  const draw = { id: 'draw', draw_no: 90, denomination: 200, draw_date: '2022-06-16', held_on: '2022-06-15', status: 'ok', issues: [], warnings: [], suspects: [], parsed_counts: {} };
  const api = new SupabaseApi('https://example.supabase.co', 'public-key');
  jest.spyOn(api, 'select').mockImplementation(async (table: string) => table === 'bonds' ? [{
    id: 'bond', local_id: 1, number: '000001', series: '', denomination: 200,
    purchased_on: '2020-01-01', note: '', holder: '', archived: false, deleted_at: null,
    wins: [{ id: 'win', draw_id: 'draw', tier: 1, prize_amount: 750000, provisional: false, claim_date: null, draws: draw }],
  }] : table === 'draws' ? [draw] : []);
  jest.spyOn(api, 'rpc').mockResolvedValue({ verified: 1, total: 1, attention: 0 });
  const snapshot = await new SupabaseRepo(api).snapshot();
  expect(snapshot.bonds[0].wins[0].provisional).toBe(true);
  expect(snapshot.draws[0].status).toBe('needs_review');
  expect(snapshot.status.verified).toBe(0);
  expect(snapshot.status.attention).toBe(1);
});
