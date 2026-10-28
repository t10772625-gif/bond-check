import { decodeBytes, parseDrawText, validate } from './prizebond-parser.mjs';

export const DENOMINATIONS = [100, 200, 750, 1500, 25000, 40000];
const ranks = { txt: 0, xlsx: 1, xls: 2, pdf: 3, docx: 4, doc: 5, manual: 0 };
export const MAX_BYTES = 5 * 1024 * 1024;

export function officialUrl(value, base = 'https://savings.gov.pk/') {
  const url = new URL(value, base);
  if (
    url.protocol !== 'https:' ||
    !['savings.gov.pk', 'www.savings.gov.pk'].includes(url.hostname) ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  ) {
    throw new Error(
      'Only HTTPS files on the official National Savings site are allowed',
    );
  }
  return url;
}

const unescapeHtml = value =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
export function anchors(html, base) {
  const out = [];
  for (const match of html.matchAll(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    try {
      out.push({
        url: officialUrl(unescapeHtml(match[1]), base).href,
        label: unescapeHtml(
          match[2]
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
        ),
      });
    } catch {
      /* Unrelated external links are not result candidates. */
    }
  }
  return out;
}

export function extractAllDrawLinks(html, base) {
  const seen = new Set();
  return anchors(html, base)
    .flatMap(anchor => {
      const kind = new URL(anchor.url).pathname
        .match(/\.(txt|pdf|docx?|xlsx?)$/i)?.[1]
        .toLowerCase();
      const match = anchor.label.match(/\b(\d{2})[-/](\d{2})[-/](\d{4})\b/)
        ?? decodeURIComponent(new URL(anchor.url).pathname).match(/(?:^|[^\d])(\d{2})[-_](\d{2})[-_](20\d{2})(?!\d)/);
      const compact = `${anchor.label} ${new URL(anchor.url).pathname}`.match(/(?:^|[^\d])(\d{2})(\d{2})(\d{2})(?!\d)/);
      if (!kind || (!match && !compact)) return [];
      const date = match ? `${match[3]}-${match[2]}-${match[1]}`
        : `20${compact[3]}-${compact[2]}-${compact[1]}`;
      if (!match) {
        const pathYear = new URL(anchor.url).pathname.match(/\/((?:19|20)\d{2})\//)?.[1];
        if (pathYear && pathYear !== date.slice(0, 4)) return [];
      }
      const parsed = new Date(`${date}T00:00:00Z`);
      if (
        !Number.isFinite(+parsed) ||
        parsed.toISOString().slice(0, 10) !== date ||
        seen.has(anchor.url)
      )
        return [];
      seen.add(anchor.url);
      return [
        {
          ...anchor,
          date,
          kind,
          is_revised: /revised|updated|corrected/i.test(
            anchor.url + anchor.label,
          ),
        },
      ];
    })
    .sort((a, b) => b.date.localeCompare(a.date) || compareCandidates(a, b));
}

export function compareCandidates(a, b) {
  return (
    (ranks[a.kind] ?? 99) - (ranks[b.kind] ?? 99) ||
    Number(b.is_revised) - Number(a.is_revised) ||
    a.url.localeCompare(b.url)
  );
}

export function discoverSourcePages(html, base) {
  const found = new Map();
  for (const link of anchors(html, base)) {
    const text = `${link.label} ${new URL(link.url).pathname}`.replace(
      /,/g,
      '',
    );
    if (/\.(txt|pdf|docx?|xlsx?)$/i.test(new URL(link.url).pathname)) continue;
    for (const denomination of DENOMINATIONS) {
      if (!new RegExp(`(?:^|[^0-9])${denomination}(?![0-9])`).test(text))
        continue;
      if (!/draw|result/i.test(text)) continue;
      if (denomination >= 25000 && !/premium|registered/i.test(text)) continue;
      const previous = found.get(denomination);
      if (previous && previous.list_url !== link.url) {
        // Ambiguity is surfaced rather than choosing a similarly named page.
        found.set(denomination, { denomination, ambiguous: true });
      } else if (!previous)
        found.set(denomination, {
          denomination,
          list_url: link.url,
          is_premium: denomination >= 25000,
        });
    }
  }
  return [...found.values()];
}

export async function readLimited(response, limit = MAX_BYTES) {
  if (Number(response.headers.get('content-length')) > limit)
    throw new Error('Official file exceeds 5 MB');
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Official file exceeds 5 MB');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export async function officialFetch(
  value,
  { fetchImpl = fetch, headers = {}, reserve, timeout = 20000 } = {},
) {
  let url = officialUrl(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (reserve) await reserve();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetchImpl(url.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'PrizeBondChecker/1.0 (personal use)',
          ...headers,
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirects === 3)
          throw new Error('Invalid or excessive official-site redirects');
        url = officialUrl(location, url.href);
        continue;
      }
      if (response.status === 304)
        return {
          notModified: true,
          status: 304,
          url: url.href,
          headers: response.headers,
        };
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Official site returned HTTP ${response.status}`);
      }
      const bytes = await readLimited(response);
      const prefix = new TextDecoder()
        .decode(bytes.slice(0, 512))
        .replace(/^\uFEFF/, '')
        .trimStart();
      if (/^<(?:!doctype|html|head|body)\b/i.test(prefix)) {
        if (
          !/text\/html/i.test(response.headers.get('content-type') ?? '') ||
          /\.(txt|pdf|docx?|xlsx?)(?:\?|$)/i.test(url.pathname)
        ) {
          throw new Error(
            'Official server returned an HTML error page instead of a result file',
          );
        }
      }
      return {
        bytes,
        status: response.status,
        url: url.href,
        headers: response.headers,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Too many redirects');
}

export const sha256 = async bytes =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');

export function parseWithStructure(text, draw, structures) {
  // Some official TXT files use classic-Mac CR line endings (Rs100 draw 49).
  // Normalize decoded text only; stored raw bytes/hashes are unchanged.
  text = text.replace(/\r\n?/g, '\n');
  if (/^\s*<(?:!doctype|html)\b/i.test(text))
    throw new Error('HTML is not an official result text file');
  const header = parseDrawText(text, {
    denomination: draw.denomination,
    listDate: draw.draw_date,
  });
  const drawNo = draw.draw_no ?? header.meta.drawNo ?? null;
  const options = structures
    .filter(
      p =>
        p.denomination === draw.denomination && p.from_draw_no <= (drawNo ?? 0),
    )
    .sort((a, b) => b.from_draw_no - a.from_draw_no);
  const structure = options[0];
  const ambiguous =
    drawNo == null &&
    structures.filter(p => p.denomination === draw.denomination).length > 1;
  const expected = structure
    ? {
        first: structure.first_count,
        second: structure.second_count,
        third: ambiguous ? null : structure.third_count,
      }
    : null;
  const parsed = parseDrawText(text, {
    denomination: draw.denomination,
    ...(drawNo ? { drawNo } : {}),
    listDate: draw.draw_date,
    ...(expected ? { expected } : {}),
  });
  const verification = validate(parsed, expected);
  if (expected?.third == null)
    verification.issues.push(
      'Third-prize count is not configured for this draw',
    );
  if (
    draw.draw_no &&
    header.meta.drawNo &&
    draw.draw_no !== header.meta.drawNo
  ) {
    verification.issues.push(
      `Draw number differs: stored ${draw.draw_no}, file ${header.meta.drawNo}`,
    );
  }
  if (header.meta.heldOn && header.meta.heldOn !== draw.draw_date) {
    verification.issues.push(
      `Draw date differs: listed ${draw.draw_date}, file ${header.meta.heldOn}; verify the official date before counting this result`,
    );
  }
  verification.ok = verification.issues.length === 0;
  return {
    parsed,
    verification,
    status: verification.ok ? 'ok' : 'needs_review',
  };
}

export function resultNumbers(result) {
  const numbers = new Map();
  for (const [index, tier] of ['first', 'second', 'third'].entries()) {
    for (const number of result.parsed[tier]) {
      // A duplicate across tiers is ambiguous; retain the highest prize as provisional.
      if (!numbers.has(number))
        numbers.set(number, {
          number,
          tier: index + 1,
          provisional: !result.verification.ok,
        });
    }
  }
  for (const suspect of result.parsed.suspects) {
    if (suspect.candidate && !numbers.has(suspect.candidate))
      numbers.set(suspect.candidate, {
        number: suspect.candidate,
        tier: ['first', 'second', 'third'].indexOf(suspect.tier) + 1,
        provisional: true,
      });
    // A layout-damaged official TXT can join fixed-width cells. Retain each
    // six-digit possibility without upgrading the uncertain draw to verified.
    if (/^\d{12,30}$/.test(suspect.token) && suspect.token.length % 6 === 0) {
      for (const number of suspect.token.match(/.{6}/g)) {
        if (!numbers.has(number)) numbers.set(number, {
          number, tier: ['first', 'second', 'third'].indexOf(suspect.tier) + 1,
          provisional: true,
        });
      }
    }
  }
  return [...numbers.values()];
}

export function selectResult(candidates) {
  const parsed = candidates.filter(c => c.result).sort(compareCandidates);
  let chosen =
    parsed.find(c => c.result.verification.ok) ??
    parsed
      .slice()
      .sort(
        (a, b) =>
          a.result.verification.issues.length -
            b.result.verification.issues.length || compareCandidates(a, b),
      )[0];
  if (!chosen) return null;
  chosen = {
    ...chosen,
    result: {
      ...chosen.result,
      verification: {
        ...chosen.result.verification,
        issues: [...chosen.result.verification.issues],
        warnings: [...chosen.result.verification.warnings],
      },
    },
  };
  const signature = c =>
    JSON.stringify(
      resultNumbers(c.result)
        .map(n => [n.number, n.tier])
        .sort((a, b) => a[0].localeCompare(b[0])),
    );
  const disagreements = parsed.filter(
    c =>
      c !== chosen &&
      c.result.verification.ok &&
      signature(c) !== signature(chosen),
  );
  // An explicitly revised candidate supersedes its older same-kind original; other disagreements require review.
  const unresolved = disagreements.filter(
    c => !(chosen.is_revised && !c.is_revised && c.kind === chosen.kind),
  );
  if (unresolved.length) {
    chosen.result.verification.issues.push(
      'Independently valid official candidates disagree; manual verification required',
    );
    chosen.result.verification.ok = false;
    chosen.result.status = 'needs_review';
  }
  if (disagreements.length)
    chosen.result.verification.warnings.push(
      'Official candidate files have different winning-number sets',
    );
  return chosen;
}

export function completeness(status, now = Date.now()) {
  const last = status?.heartbeat?.last_discovery_ok;
  const stale =
    !last ||
    !Number.isFinite(Date.parse(last)) ||
    now - Date.parse(last) > 3 * 86400000;
  return {
    stale,
    complete: Boolean(
      status &&
        status.total > 0 &&
        status.total === status.verified &&
        !status.pending_jobs &&
        !status.failed_jobs &&
        !status.attention &&
        !status.missing_sources &&
        !stale,
    ),
  };
}

export function decodeOfficial(bytes) {
  return decodeBytes(bytes);
}
