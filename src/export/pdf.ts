/** Tiny text/table PDF writer (A4, Helvetica) in pure JS. */
import { latin1 } from './bytes';

export type PdfBlock =
  | { kind: 'title'; text: string }
  | { kind: 'sub'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'kv'; rows: [string, string][] }
  | { kind: 'table'; cols: { title: string; width: number; right?: boolean }[]; rows: string[][] }
  | { kind: 'space'; h: number };

const W = 595;
const H = 842;
const M = 40;

/** Keep only characters Helvetica/WinAnsi can show. */
const clean = (s: string) =>
  String(s)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/·/g, '-')
    .replace(/[^\x20-\x7E]/g, '');

const pdfStr = (s: string) => '(' + clean(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';

/** Rough Helvetica width estimate so long cells can be cut. */
const textW = (s: string, size: number) => clean(s).length * size * 0.52;
const fit = (s: string, width: number, size: number) => {
  let t = clean(s);
  if (textW(t, size) <= width) return t;
  while (t.length > 1 && textW(t + '..', size) > width) t = t.slice(0, -1);
  return t + '..';
};

export function buildPdf(blocks: PdfBlock[], footer: string): Uint8Array {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = H - M;

  const newPage = () => {
    if (ops.length) pages.push(ops.join('\n'));
    ops = [];
    y = H - M;
  };
  const ensure = (h: number) => {
    if (y - h < M + 20) newPage();
  };
  const text = (x: number, yy: number, s: string, size: number, bold = false, color = '0.08 0.14 0.11') => {
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg ${x.toFixed(1)} ${yy.toFixed(1)} Td ${pdfStr(s)} Tj ET`);
  };
  const rect = (x: number, yy: number, w: number, h: number, color: string) => ops.push(`${color} rg ${x} ${yy} ${w} ${h} re f`);
  const line = (x1: number, yy: number, x2: number) => ops.push(`0.85 0.82 0.76 RG 0.5 w ${x1} ${yy} m ${x2} ${yy} l S`);

  blocks.forEach(b => {
    if (b.kind === 'title') {
      ensure(30);
      text(M, y - 22, b.text, 22, true, '0.04 0.42 0.29');
      y -= 32;
    } else if (b.kind === 'sub') {
      ensure(16);
      text(M, y - 11, b.text, 10, false, '0.36 0.42 0.38');
      y -= 16;
    } else if (b.kind === 'heading') {
      ensure(34);
      y -= 10;
      text(M, y - 13, b.text, 13, true, '0.69 0.49 0.08');
      y -= 22;
    } else if (b.kind === 'space') {
      y -= b.h;
    } else if (b.kind === 'kv') {
      b.rows.forEach(([k, v]) => {
        ensure(18);
        text(M, y - 12, k, 10, false, '0.36 0.42 0.38');
        text(M + 230, y - 12, v, 10, true);
        line(M, y - 17, W - M);
        y -= 19;
      });
    } else if (b.kind === 'table') {
      const total = b.cols.reduce((s, c) => s + c.width, 0);
      const scale = (W - 2 * M) / total;
      const widths = b.cols.map(c => c.width * scale);
      const header = () => {
        ensure(40);
        rect(M, y - 18, W - 2 * M, 18, '0.04 0.42 0.29');
        let x = M;
        b.cols.forEach((c, i) => {
          const t = fit(c.title, widths[i] - 8, 9);
          const tx = c.right ? x + widths[i] - 4 - textW(t, 9) : x + 4;
          text(tx, y - 13, t, 9, true, '1 1 1');
          x += widths[i];
        });
        y -= 18;
      };
      header();
      b.rows.forEach((r, ri) => {
        if (y - 16 < M + 20) {
          newPage();
          header();
        }
        if (ri % 2) rect(M, y - 16, W - 2 * M, 16, '0.96 0.95 0.91');
        let x = M;
        r.forEach((cell, i) => {
          const t = fit(cell, widths[i] - 8, 9);
          const tx = b.cols[i]?.right ? x + widths[i] - 4 - textW(t, 9) : x + 4;
          text(tx, y - 11.5, t, 9);
          x += widths[i] || 0;
        });
        y -= 16;
      });
      if (!b.rows.length) {
        ensure(16);
        text(M + 4, y - 12, 'Nothing to show', 9, false, '0.36 0.42 0.38');
        y -= 16;
      }
    }
  });
  newPage();

  // Assemble objects
  const objs: string[] = [];
  const add = (s: string) => {
    objs.push(s);
    return objs.length;
  };
  const catalogId = add('');
  const pagesId = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  pages.forEach((content, i) => {
    const foot = `BT /F1 8 Tf 0.5 0.5 0.5 rg ${M} 24 Td ${pdfStr(`${footer}  -  Page ${i + 1} of ${pages.length}`)} Tj ET`;
    const stream = content + '\n' + foot;
    const cId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(
      add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cId} 0 R >>`),
    );
  });
  objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => (out += String(o).padStart(10, '0') + ' 00000 n \n'));
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return latin1(out);
}
