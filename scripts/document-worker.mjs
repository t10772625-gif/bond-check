import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Database } from '../supabase/functions/_shared/db.mjs';
import { Pipeline } from '../supabase/functions/_shared/pipeline.mjs';
import { loadSettings } from './env.mjs';

const execute = promisify(execFile);
const settings = await loadSettings();
if (!settings.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is required only in the server/CI environment',
  );
const db = new Database(
  settings.SUPABASE_URL,
  settings.SUPABASE_SERVICE_ROLE_KEY,
);
const converter = async (kind, bytes) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bondcheck-document-'));
  try {
    const input = path.join(directory, 'input.' + kind);
    await writeFile(input, bytes);
    if (kind === 'pdf') {
      const output = path.join(directory, 'output.txt');
      await execute('pdftotext', ['-layout', input, output], {
        timeout: 60000,
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true,
      });
      const text = await readFile(output, 'utf8');
      // Scans stay needs_ocr. OCR is deliberately not auto-approved.
      return {
        text,
        warnings: text.trim()
          ? []
          : ['PDF has no usable text layer; OCR/manual review required'],
      };
    }
    if (kind === 'doc') {
      const { stdout } = await execute('antiword', [input], {
        timeout: 60000,
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true,
      });
      return { text: stdout, warnings: [] };
    }
    const { stdout } = await execute(
      settings.PYTHON ?? 'python3',
      [path.resolve('scripts/convert-document.py'), kind, input],
      { timeout: 60000, maxBuffer: 20 * 1024 * 1024, windowsHide: true },
    );
    return JSON.parse(stdout);
  } finally {
    // Remove only this process's verified, newly created temporary directory.
    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== path.resolve(tmpdir()) ||
      !path.basename(resolved).startsWith('bondcheck-document-')
    )
      throw new Error('Unsafe temporary path');
    await rm(resolved, { recursive: true, force: true });
  }
};
const files = await db.select('draw_files', {
  kind: 'in.(pdf,xlsx,xls,doc,docx)',
  converted_sha256: 'is.null',
  limit: '6',
});
const pipeline = new Pipeline(db, { converter, preferStoredBytes: true });
let failed = 0;
for (const id of [...new Set(files.map(file => file.draw_id))].slice(0, 3)) {
  try {
    await pipeline.ingest(id);
    console.log(`Processed draw ${id}`);
  } catch (error) {
    failed++;
    console.error(`Draw ${id}: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
