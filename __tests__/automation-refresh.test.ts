import { refreshAfterSync } from '../src/cloud/refresh';

test('official-site outages still refresh server corrections and preserve the visible error', async () => {
  let displayedWins = 2;
  const outage = new Error('Official site certificate is untrusted');
  const reload = jest.fn(async () => {
    displayedWins = 0;
  });
  await expect(
    refreshAfterSync(async () => {
      throw outage;
    }, reload),
  ).rejects.toBe(outage);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(displayedWins).toBe(0);
});

test('database failure remains visible even when discovery also fails', async () => {
  const databaseFailure = new Error('Supabase unavailable');
  await expect(
    refreshAfterSync(
      async () => {
        throw new Error('Official site down');
      },
      async () => {
        throw databaseFailure;
      },
    ),
  ).rejects.toBe(databaseFailure);
});
