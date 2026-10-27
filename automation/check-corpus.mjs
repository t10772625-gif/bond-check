// check-corpus.mjs  -  run the parser over EVERY result file and print a verification table.
//
//   node check-corpus.mjs sources.txt
//
// sources.txt: one per line:  <denomination> <url-or-local-path>      (lines starting with # are ignored)
//   750 https://savings.gov.pk/wp-content/uploads/2026/07/Rs-750-107-draw.txt
//   200 ./samples/rs200-106.txt
// Exit code 1 if any file needs review. PDFs / .doc are listed as MANUAL (they need pdftotext/OCR).
import { readFile } from 'node:fs/promises';
import { decodeBytes, parseDrawText, validate } from './prizebond-parser.mjs';
import { officialFetch } from '../supabase/functions/_shared/core.mjs';

const list = (await readFile(process.argv[2] ?? 'sources.txt', 'utf8'))
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

let bad = 0;
console.log('den   draw  held        first/second/third  ph   status   notes');
for (const line of list) {
  const match = line.match(/^(\d+)\s+(.+)$/);
  if (!match) { bad++; console.log(`INVALID corpus entry: ${line}`); continue; }
  const [, den, src] = match;
  const label = `${den.padEnd(5)} `;
  if (/\.(pdf|docx?|xlsx?)$/i.test(src)) { console.log(`${label}${'-'.padEnd(5)} ${'-'.padEnd(10)}  ${'-'.padEnd(18)}  -    MANUAL   ${src} (needs pdftotext/OCR/Excel path)`); bad++; continue; }
  try {
    if (/^https?:/i.test(src)) await new Promise(resolve => setTimeout(resolve, 1000));
    const bytes = /^https?:/i.test(src) ? (await officialFetch(src)).bytes : await readFile(src);
    const p = parseDrawText(decodeBytes(bytes), { denomination: Number(den) });
    const v = validate(p);
    if (!v.ok) bad++;
    const c = `${p.first.length}/${p.second.length}/${p.third.length}`;
    console.log(`${label}${String(p.meta.drawNo ?? '?').padEnd(5)} ${(p.meta.heldOn ?? '?').padEnd(10)}  ${c.padEnd(18)}  ${String(p.placeholders).padEnd(4)} ${(v.ok ? 'ok' : 'REVIEW').padEnd(8)} ${[...v.issues, ...v.warnings.map((w) => 'warn: ' + w)].join('; ')}`);
  } catch (e) { bad++; console.log(`${label}ERROR ${src}: ${e.message}`); }
}
console.log(bad ? `\n${bad} of ${list.length} need attention` : `\nall ${list.length} verified`);
process.exit(bad ? 1 : 0);
