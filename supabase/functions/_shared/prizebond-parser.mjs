// prizebond-parser.mjs  (v2)
// Dependency-free ES module. Works in Node 18+, Deno / Supabase Edge Functions, React Native (Hermes).
//
// Pipeline:  extractDrawLinks(html) -> download bytes -> decodeBytes -> parseDrawText
//            -> validate -> buildIndex -> matchBonds (+ nearMisses for OCR'd PDFs)

// ---------- 0. listing page ----------------------------------------------------------
// Each denomination list page (savings.gov.pk/rs-750-prize-bond-draw/ etc.) is server-rendered:
// every draw is an <a href="...txt|pdf|doc">dd-mm-yyyy</a>. File names are NOT predictable,
// so always scrape the list instead of building URLs. Verify against view-source once.
const KIND_RANK = { txt: 0, xlsx: 1, xls: 2, pdf: 3, docx: 4, doc: 5 }; // lower = preferred

export function extractDrawLinks(html, baseUrl = 'https://savings.gov.pk') {
  const re = /<a\b[^>]*href=["']([^"']+\.(txt|pdf|docx?|xlsx?))["'][^>]*>([\s\S]*?)<\/a>/gi;
  const byDate = new Map();
  for (const m of html.matchAll(re)) {
    const label = m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const d = label.match(/(\d{2})-(\d{2})-(\d{4})/);
    if (!d) continue;
    const date = `${d[3]}-${d[2]}-${d[1]}`; // ISO
    const kind = m[2].toLowerCase();
    const url = new URL(m[1], baseUrl).href;
    const prev = byDate.get(date);
    if (!prev || KIND_RANK[kind] < KIND_RANK[prev.kind]) byDate.set(date, { date, kind, url, label });
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// ---------- 1. bytes -> text ---------------------------------------------------------
export function decodeBytes(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  // Reading UTF-8 as cp1252 is what produces "â€“" in headers; if real UTF-8 fails, fall back.
  return utf8.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(bytes) : utf8;
}

// ---------- 2. prize structure (per series, per draw) --------------------------------
// Counts of common numbers: first / second / third. They CHANGE over time (Rs100 third prizes went
// 1696 -> 1199 from the 51st draw), so this table is config, not truth. A denomination that is not
// configured always comes back "needs review".
export const PRIZE_STRUCTURE = {
  100: (n) => ({ first: 1, second: 3, third: n == null ? null : n < 51 ? 1696 : 1199 }),
  200: () => ({ first: 1, second: 5, third: 2394 }),
  750: () => ({ first: 1, second: 3, third: 1696 }),
  1500: () => ({ first: 1, second: 3, third: 1696 }),
  // Premium (registered) bonds. NOTE: Rs25,000 has TWO first prizes, Rs40,000 has one.
  25000: () => ({ first: 2, second: 5, third: 700 }),
  40000: () => ({ first: 1, second: 3, third: 660 }),
};
export function expectedFor(denomination, drawNo) {
  const f = PRIZE_STRUCTURE[denomination];
  return f ? f(drawNo) : null;
}

// ---------- 3. parse -----------------------------------------------------------------
// Headings must START the line: the 97th Rs200 preamble contains the sentence
// "...the number for the second prize will get the second prize in each series".
const HEADING = [
  { tier: 'first', re: /^\W*(?:first|1st)\s+pri[zc]es?\b/i },
  { tier: 'second', re: /^\W*(?:second|2nd)\s+pri[zc]es?\b/i },
  // Many files have no "Third Prize" heading at all, only "PART - II" or nothing.
  { tier: 'third', re: /^\W*(?:(?:third|3rd)\s+pri[zc]es?\b|PART\s*-?\s*II\b)/i },
];
const PLACEHOLDER = /^[X*]{3,}$/i; // XXXXX / XXXXXX / xxxxxx / ******

const DRAWNO_RES = [
  /\b(\d{1,3})\s*(?:st|nd|rd|th)[ \t]+draw\b/i, //  "107th DRAW", "53rd Draw", "BONDS-97th DRAW"
  /\bdraw[ \t]*(?:no\.?|number)[ \t]*[:.]?[ \t]*(\d{1,3})/i, // "Draw No:98th", "Draw No.98th"
  /\b(\d{1,3})[ \t]+draw\b/i, //                    "National Prize bond 102 Draw"
];
const AMOUNT = String.raw`(\d{1,3}(?:,\s?\d{3})+|\d+)`; // "25,000"  "40, 000" (sic, 33rd Rs40000)  "750"
const DENOM_RES = [
  // "Rs 200 Denomination", "Rs.25,000/-DENOMINATION", "Rs.750/- PRIZE BOND"
  new RegExp(String.raw`\bRs\.?\s*${AMOUNT}\s*(?:\/-?)?\s*(?:denomination|prize\s+bond)`, 'i'),
  // "Draw Result of 40,000 Prize Denomination Premium..." (32nd Rs40000, no "Rs")
  new RegExp(String.raw`\b${AMOUNT}\s+prize\s+denomination`, 'i'),
];
const DATE_RES = [
  /held\s+on\s+(\d{2})[-.\/](\d{2})[-.\/](\d{4})/i,
  /\bDate\s*:\s*(\d{2})[-.\/](\d{2})[-.\/](\d{4})/i,
  /\bon\s+(\d{2})[-.\/](\d{2})[-.\/](\d{4})/i,
];

function headerMeta(lines) {
  const meta = {};
  for (const line of lines.slice(0, 15)) {
    if (meta.drawNo == null)
      for (const re of DRAWNO_RES) { const m = line.match(re); if (m) { meta.drawNo = Number(m[1]); break; } }
    if (meta.denomination == null)
      for (const re of DENOM_RES) { const m = line.match(re); if (m) { meta.denomination = Number(m[1].replace(/[,\s]/g, '')); break; } }
    if (meta.heldOn == null)
      for (const re of DATE_RES) {
        const m = line.match(re);
        if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) { meta.heldOn = `${m[3]}-${m[2]}-${m[1]}`; break; }
      }
  }
  return meta;
}

// "(1199 Prizes of Rs.1,000/- each)" => per-series third-prize count declared by the file itself.
function declaredThirdCount(lines) {
  for (const line of lines.slice(0, 80)) {
    const m = line.match(/[(\-]\s*(\d[\d,]*)\s*prizes?(?:\(s\))?(?:\s+of\b|\s*\))/i);
    if (m) { const n = Number(m[1].replace(/,/g, '')); if (n <= 5000) return n; }
  }
  return null;
}

/**
 * @param {string} raw  decoded text of a result file
 * @param {{denomination?:number, drawNo?:number, expected?:{first:number,second:number,third:number|null}, listDate?:string}} [opts]
 *   denomination/drawNo/listDate come from the list page and win over the file header
 *   (headers lie: the 107th Rs200 file says "PREMIUM PRIZE BONDS").
 */
export function parseDrawText(raw, opts = {}) {
  const lines = raw.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  const meta = headerMeta(lines);
  const warnings = [];
  if (opts.denomination) {
    if (meta.denomination && meta.denomination !== opts.denomination)
      warnings.push(`header says Rs${meta.denomination}, list page says Rs${opts.denomination}`);
    meta.denomination = opts.denomination;
  }
  if (opts.drawNo) meta.drawNo = opts.drawNo;
  if (opts.listDate && meta.heldOn && opts.listDate !== meta.heldOn)
    warnings.push(`file says held ${meta.heldOn}, list page says ${opts.listDate}`);

  const expected = opts.expected ?? expectedFor(meta.denomination, meta.drawNo);
  const declaredThird = declaredThirdCount(lines);
  const out = { meta, expected, declaredThird, warnings, first: [], second: [], third: [], suspects: [], placeholders: 0, ignored: 0 };
  const secondSeen = () => out.second.length + out.suspects.filter((s) => s.tier === 'second').length;

  let tier = null;
  for (const [i, line] of lines.entries()) {
    const t = line.trim();
    if (!t) continue;

    const hit = HEADING.find((h) => h.re.test(t));
    if (hit) { tier = hit.tier; continue; }

    // "01 Prize:\t516806" and "05 Prizes\t381066 ..." carry numbers behind a label.
    // "1696 Prizes of 9300/- each" leaves "of 9300/- each" which is not data, so it is skipped.
    const body = t.replace(/^\d+\s*prizes?\s*:?\s*/i, '');
    const toks = body.split(/\s+/).filter(Boolean);
    // A "data line" contains ONLY digit tokens / placeholders. Anything with words is skipped.
    // Never strip commas first: "300,192" would become a fake 6-digit number.
    if (!toks.length || !toks.every((k) => /^\d+$/.test(k) || PLACEHOLDER.test(k))) continue;
    if (!tier) { out.ignored += toks.length; continue; } // numbers before any heading are noise

    // Fallback when the prize structure is unknown: a grid row after some second-prize numbers.
    if (!expected && tier === 'second' && secondSeen() > 0 && toks.length >= 4) tier = 'third';

    for (const k of toks) {
      // Count-based switch: once all second-prize numbers are in, everything else is third prize.
      // (Rs200 has FIVE second prizes on one line, Rs1500 grids have 5 columns, so no column rule works.)
      if (expected && tier === 'second' && secondSeen() >= expected.second) tier = 'third';
      if (PLACEHOLDER.test(k)) out.placeholders++;
      else if (/^\d{6}$/.test(k)) out[tier].push(k);
      else if (k.length <= 3) out.ignored++; // page numbers etc.
      else out.suspects.push({
        token: k, tier, line: i + 1,
        candidate: k.length < 6 ? k.padStart(6, '0') : null, // e.g. 7447 -> 007447 (to be confirmed)
      });
    }
  }
  return out;
}

// ---------- 4. validate --------------------------------------------------------------
export function validate(p, expected = p.expected) {
  const issues = [];
  const warnings = [...p.warnings];
  if (!expected) issues.push(`no prize structure configured for Rs${p.meta.denomination ?? '?'}`);
  else {
    for (const k of ['first', 'second']) if (p[k].length !== expected[k]) issues.push(`${k}: expected ${expected[k]}, got ${p[k].length}`);
    if (expected.third == null) warnings.push('third-prize count unknown for this draw, not checked');
    else if (p.third.length !== expected.third) issues.push(`third: expected ${expected.third}, got ${p.third.length}`);
    if (p.declaredThird != null && expected.third != null) {
      const total = expected.first + expected.second + expected.third; // some files print the TOTAL (2400) here
      if (p.declaredThird !== expected.third && p.declaredThird !== total)
        warnings.push(`file declares ${p.declaredThird} third prizes, config says ${expected.third} (config outdated?)`);
    }
  }
  const seen = new Set();
  for (const n of [...p.first, ...p.second, ...p.third]) {
    if (seen.has(n)) issues.push(`duplicate number ${n}`);
    seen.add(n);
  }
  for (const s of p.suspects)
    issues.push(`suspicious token "${s.token}" in ${s.tier} (line ${s.line})` + (s.candidate ? ` -> maybe ${s.candidate}` : ''));
  return { ok: issues.length === 0, issues, warnings };
}

// ---------- 5. match -----------------------------------------------------------------
export function buildIndex(p) {
  const idx = new Map();
  for (const tier of ['first', 'second', 'third']) for (const n of p[tier]) idx.set(n, tier);
  return idx;
}

// Series letters are irrelevant: one common draw applies to every series, so a number wins in
// all series. Prefer a false alarm to a miss: zero-padded suspects are reported as `possible`.
export function matchBonds(bonds, index, parsed = { suspects: [] }) {
  const prov = new Map(parsed.suspects.filter((s) => s.candidate).map((s) => [s.candidate, s.tier]));
  const wins = [], possible = [];
  for (const b of bonds) {
    const n = String(b.number).padStart(6, '0');
    if (index.has(n)) wins.push({ bond: b, tier: index.get(n) });
    else if (prov.has(n)) possible.push({ bond: b, tier: prov.get(n), reason: 'file had a short number, zero-padded' });
  }
  return { wins, possible };
}

// For OCR'd PDFs only: bonds that differ from a winning number by exactly one digit.
export function nearMisses(bonds, winningNumbers) {
  const out = [];
  for (const b of bonds) {
    const n = String(b.number).padStart(6, '0');
    for (const w of winningNumbers) {
      let d = 0;
      for (let i = 0; i < 6 && d < 2; i++) if (n[i] !== w[i]) d++;
      if (d === 1) out.push({ bond: b, close_to: w });
    }
  }
  return out;
}
