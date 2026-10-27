export async function refreshAfterSync(
  sync: () => Promise<void>,
  reload: () => Promise<void>,
) {
  let fetchFailure: unknown;
  try {
    await sync();
  } catch (failure) {
    fetchFailure = failure;
  }
  await reload();
  if (fetchFailure) throw fetchFailure;
}
