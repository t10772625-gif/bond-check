import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareCandidates,
  completeness,
  decodeOfficial,
  discoverSourcePages,
  extractAllDrawLinks,
  officialFetch,
  officialUrl,
  parseWithStructure,
  resultNumbers,
  selectResult,
  sha256,
} from '../supabase/functions/_shared/core.mjs';

const structure = {
  denomination: 750,
  from_draw_no: 0,
  first_count: 1,
  second_count: 3,
  third_count: 1696,
};
const draw = { denomination: 750, draw_date: '2026-10-15' };
function fixture({ short = false, first = '347425' } = {}) {
  return (
    `108th DRAW OF Rs.750/- DENOMINATION\nHELD ON 15-10-2026\nFirst Prize\n${first}\nSecond Prize\n${
      short ? '7447' : '007447'
    } 827353 876615\nThird Prize\n` +
    Array.from({ length: 1696 }, (_, i) => String(i + 100000)).join('\n')
  );
}
test('a file/list draw-date conflict cannot become verified prize money', () => {
  const text = fixture().replace('HELD ON 15-10-2026', 'HELD ON 14-10-2026');
  const result = parseWithStructure(text, draw, [structure]);
  assert.equal(result.status, 'needs_review');
  assert.equal(result.verification.ok, false);
  assert.match(result.verification.issues.join(' '), /Draw date differs/);
  assert.ok(resultNumbers(result).every(number => number.provisional));
});
test('discovery keeps every format and revised file; validates dates and host', () => {
  const html = `<a href="/a.txt?download=1&amp;x=2">15-10-2026 (Text)</a>
    <a href='/a.pdf'>15-10-2026 (PDF)</a><a href='/Revised-a.txt'>15-10-2026 revised</a>
    <a href='/bad.txt'>31-02-2026</a><a href='https://evil.example/a.txt'>15-10-2026</a>`;
  const links = extractAllDrawLinks(html, 'https://savings.gov.pk/list/');
  assert.equal(links.length, 3);
  assert.equal(links[0].is_revised, true);
  assert.equal(links[1].url, 'https://savings.gov.pk/a.txt?download=1&x=2');
  assert.equal(links[2].kind, 'pdf');
});
test('list source discovery excludes withdrawn and ambiguous premium pages', () => {
  const html = `<a href='/100-draws'>Rs100 draws</a><a href='/7500-draws'>Rs7500 draws</a>
    <a href='/25000-premium-results'>Rs25,000 premium results</a><a href='/40000-old-draws'>Rs40000 results</a>`;
  const sources = discoverSourcePages(html, 'https://savings.gov.pk/');
  assert.deepEqual(
    sources.map(s => s.denomination),
    [100, 25000],
  );
});
test('strict URL allowlist rejects lookalike hosts, credentials, ports, HTTP', () => {
  for (const url of [
    'http://savings.gov.pk/a',
    'https://savings.gov.pk.evil.test/a',
    'https://user@savings.gov.pk/a',
    'https://savings.gov.pk:444/a',
    'file:///tmp/a',
    'https://127.0.0.1/a',
  ])
    assert.throws(() => officialUrl(url));
});
test('redirect to another origin is rejected before the second fetch', async () => {
  let calls = 0;
  await assert.rejects(
    officialFetch('https://savings.gov.pk/a.txt', {
      fetchImpl: async () => {
        calls++;
        return new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example/file' },
        });
      },
    }),
    /Only HTTPS/,
  );
  assert.equal(calls, 1);
});
test('200 HTML error pages and oversized responses never become result text', async () => {
  await assert.rejects(
    officialFetch('https://savings.gov.pk/a.txt', {
      fetchImpl: async () =>
        new Response('<!DOCTYPE html><html>blocked', {
          headers: { 'content-type': 'text/html' },
        }),
    }),
    /HTML error/,
  );
  await assert.rejects(
    officialFetch('https://savings.gov.pk/a.txt', {
      fetchImpl: async () =>
        new Response('small', { headers: { 'content-length': '5242881' } }),
    }),
    /5 MB/,
  );
});
test('stream size limits apply even without a Content-Length header', async () => {
  await assert.rejects(
    officialFetch('https://savings.gov.pk/a.txt', {
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(5242881));
              controller.close();
            },
          }),
        ),
    }),
    /5 MB/,
  );
});
test('complete Rs750 fixture validates and preserves six-digit strings', () => {
  const result = parseWithStructure(fixture(), draw, [structure]);
  assert.equal(result.status, 'ok');
  assert.equal(resultNumbers(result).length, 1700);
  assert.ok(
    resultNumbers(result).some(n => n.number === '007447' && !n.provisional),
  );
});

test('official CR-only line endings parse identically to LF without changing raw provenance', () => {
  const normal = parseWithStructure(fixture(), draw, [structure]);
  const classic = parseWithStructure(fixture().replace(/\n/g, '\r'), draw, [structure]);
  assert.equal(classic.status, 'ok');
  assert.deepEqual(resultNumbers(classic), resultNumbers(normal));
});
test('7447 creates a provisional 007447; incomplete counts never verify', () => {
  const result = parseWithStructure(fixture({ short: true }), draw, [
    structure,
  ]);
  assert.equal(result.status, 'needs_review');
  assert.ok(
    resultNumbers(result).some(
      n => n.number === '007447' && n.provisional && n.tier === 2,
    ),
  );
  assert.ok(resultNumbers(result).every(n => n.provisional));
  assert.equal(
    parseWithStructure(fixture().split('\n').slice(0, 30).join('\n'), draw, [
      structure,
    ]).status,
    'needs_review',
  );
});
test('unconfigured and ambiguous prize structures remain unresolved', () => {
  assert.equal(parseWithStructure(fixture(), draw, []).status, 'needs_review');
  const result = parseWithStructure(
    'First Prize\n123456\nSecond Prize\n123457 123458 123459\n',
    { denomination: 100, draw_date: '2026-01-01' },
    [
      { ...structure, denomination: 100 },
      { ...structure, denomination: 100, from_draw_no: 51, third_count: 1199 },
    ],
  );
  assert.ok(
    result.verification.issues.some(issue => issue.includes('not configured')),
  );
});
test('valid candidates disagreeing across formats require review; revised same-kind wins', () => {
  const first = {
    url: 'https://savings.gov.pk/a.txt',
    kind: 'txt',
    is_revised: false,
    result: parseWithStructure(fixture(), draw, [structure]),
  };
  const revised = {
    url: 'https://savings.gov.pk/revised.txt',
    kind: 'txt',
    is_revised: true,
    result: parseWithStructure(fixture({ first: '347426' }), draw, [structure]),
  };
  assert.ok(compareCandidates(revised, first) < 0);
  assert.equal(selectResult([first, revised]).result.status, 'ok');
  assert.equal(
    selectResult([first, { ...revised, kind: 'pdf' }]).result.status,
    'needs_review',
  );
});
test('completeness is false during empty history, failed jobs, missing sources and outages', () => {
  const now = Date.parse('2026-10-27T10:00:00Z');
  const status = {
    total: 12,
    verified: 12,
    attention: 0,
    pending_jobs: 0,
    failed_jobs: 0,
    missing_sources: 0,
    heartbeat: { last_discovery_ok: '2026-10-27T09:00:00Z' },
  };
  assert.equal(completeness(status, now).complete, true);
  for (const change of [
    { total: 0, verified: 0 },
    { pending_jobs: 1 },
    { failed_jobs: 1 },
    { missing_sources: 1 },
    { attention: 1 },
    { heartbeat: { last_discovery_ok: '2026-10-17T09:00:00Z' } },
  ])
    assert.equal(completeness({ ...status, ...change }, now).complete, false);
});
test('BOM decoding and raw-file hashes preserve byte-level provenance', async () => {
  const bytes = Uint8Array.from([
    255, 254, 48, 0, 48, 0, 55, 0, 52, 0, 52, 0, 55, 0,
  ]);
  assert.equal(decodeOfficial(bytes), '007447');
  assert.equal((await sha256(bytes)).length, 64);
  assert.notEqual(
    await sha256(bytes),
    await sha256(new TextEncoder().encode('007447')),
  );
});

test('joined official grid cells remain visible as provisional six-digit possibilities', () => {
  const result = parseWithStructure(fixture().replace('100000\n100001', '223401000656'), draw, [structure]);
  assert.equal(result.status, 'needs_review');
  const numbers = resultNumbers(result);
  assert.ok(numbers.some(n => n.number === '223401' && n.provisional));
  assert.ok(numbers.some(n => n.number === '000656' && n.provisional));
});
