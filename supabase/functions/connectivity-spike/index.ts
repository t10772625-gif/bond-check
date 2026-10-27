import { authorize, body } from '../_shared/runtime.ts';
import { decodeOfficial, officialFetch } from '../_shared/core.mjs';
import { fetchOfficial } from '../_shared/official-fetch.ts';
import { convertDocument } from '../_shared/documents.ts';
Deno.serve(async (request: Request) => {
  try {
    await authorize(request, true);
    const { urls, extract_pdf = false } = await body(request);
    if (!Array.isArray(urls) || !urls.length || urls.length > 3)
      throw new Error('Supply one list, TXT and PDF URL (maximum three URLs)');
    const observations = [];
    for (const url of urls) {
      const started = Date.now();
      try {
        const result = await officialFetch(url, { fetchImpl: fetchOfficial });
        const conversionStarted = Date.now();
        const converted = extract_pdf ? await convertDocument('pdf', result.bytes) : null;
        observations.push({
          url: result.url,
          status: result.status,
          latency_ms: Date.now() - started,
          content_type: result.headers.get('content-type'),
          bytes: result.bytes?.length,
          ...(converted ? { text_characters: converted.text.length, conversion_ms: Date.now() - conversionStarted } : {}),
          preview: decodeOfficial(
            result.bytes?.slice(0, 200) ?? new Uint8Array(),
          ),
        });
      } catch (error) {
        observations.push({
          url,
          latency_ms: Date.now() - started,
          error: (error as Error).message,
        });
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return Response.json({
      at: new Date().toISOString(),
      region: Deno.env.get('SB_REGION') ?? 'unknown',
      observations,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 401 });
  }
});
