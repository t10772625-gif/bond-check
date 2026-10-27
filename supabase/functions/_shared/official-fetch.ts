import { OFFICIAL_INTERMEDIATE_CA } from './official-ca.mjs';

// Complete the server's broken chain. Certificate, expiry and hostname
// verification stay enabled. This client is used only by the official allowlist.
const client = Deno.createHttpClient({ caCerts: [OFFICIAL_INTERMEDIATE_CA] });
export const fetchOfficial = (input: string | URL | Request, init?: RequestInit) =>
  fetch(input, { ...init, client });
