// The emailed token is verified here; the browser receives a result, never a redirect.
const headers = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
Deno.serve(async request => {
  if (request.method !== 'GET') return new Response('Use the confirmation link in your email.', { status: 405, headers });
  const token = new URL(request.url).searchParams.get('token_hash');
  if (!token || !/^[a-f0-9]{32,256}$/i.test(token))
    return new Response('BondCheck\n\nThis confirmation link is incomplete. Open the latest confirmation email, or use Resend email in BondCheck.', { status: 400, headers });
  try {
    const response = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/verify', {
      method: 'POST',
      headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_hash: token, type: 'email' }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return new Response('BondCheck\n\nThis link has expired or was already used. If you already confirmed your email, log in to BondCheck. Otherwise request a new email with Resend email in the app.', { status: 400, headers });
    const result = await response.json();
    if (!result.user?.email_confirmed_at)
      return new Response('BondCheck\n\nEmail confirmation could not be completed. Request a new confirmation email in the app.', { status: 400, headers });
    return new Response('BondCheck\n\nEmail verified successfully.\n\nReturn to the BondCheck app and log in. Your private account is ready.', { status: 200, headers });
  } catch {
    return new Response('BondCheck\n\nConfirmation is temporarily unavailable. Please try this link again in a moment.', { status: 503, headers });
  }
});
