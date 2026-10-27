import {
  compareCandidates,
  decodeOfficial,
  discoverSourcePages,
  officialFetch,
  parseWithStructure,
  resultNumbers,
  selectResult,
  sha256,
} from './core.mjs';
import { registerSourcePage } from './discovery.mjs';

export class Pipeline {
  constructor(db, { converter, fetchImpl, preferStoredBytes = false } = {}) {
    this.db = db;
    this.converter = converter;
    this.fetchImpl = fetchImpl;
    this.preferStoredBytes = preferStoredBytes;
  }
  async event(level, kind, message, draw_id = null, data = null) {
    await this.db.insert('pipeline_events', {
      level,
      kind,
      message,
      draw_id,
      data,
    });
  }
  async fetch(url, headers = {}) {
    return officialFetch(url, {
      headers,
      fetchImpl: this.fetchImpl,
      reserve: async () => {
        const delay = await this.db.rpc('reserve_fetch_slot');
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      },
    });
  }
  async enqueue(kind, payload = {}) {
    await this.db.rpc('enqueue_job', { p_kind: kind, p_payload: payload });
  }
  async discover() {
    let sources = await this.db.select('sources', {
      active: 'eq.true',
      order: 'denomination.asc',
    });
    if (sources.some(source => !source.list_url)) {
      const page = await this.fetch('https://savings.gov.pk/download-draws/');
      const detected = discoverSourcePages(
        decodeOfficial(page.bytes),
        page.url,
      );
      for (const source of detected) {
        if (source.ambiguous) {
          await this.event(
            'warning',
            'source_ambiguous',
            `Several list pages match Rs${source.denomination}; configure sources.list_url explicitly.`,
          );
        } else if (
          sources.some(
            s => s.denomination === source.denomination && !s.list_url,
          )
        ) {
          await this.db.update(
            'sources',
            { denomination: `eq.${source.denomination}` },
            { list_url: source.list_url },
          );
        }
      }
      sources = await this.db.select('sources', {
        active: 'eq.true',
        order: 'denomination.asc',
      });
    }
    let discovered = 0;
    const failures = [];
    for (const source of sources) {
      try {
        if (!source.list_url)
          throw new Error(
            'List page has not been discovered; configure the official source URL',
          );
        const headers = {};
        if (source.etag) headers['If-None-Match'] = source.etag;
        if (source.last_modified)
          headers['If-Modified-Since'] = source.last_modified;
        const page = await this.fetch(source.list_url, headers);
        if (!page.notModified) {
          discovered += await registerSourcePage(this.db, source, page.bytes, page.url, page.headers);
        } else {
          await this.db.update(
            'sources',
            { denomination: `eq.${source.denomination}` },
            { last_discovered_at: new Date().toISOString() },
          );
        }
        const recent = await this.db.select('draws', {
          denomination: `eq.${source.denomination}`,
          order: 'draw_date.desc',
          limit: '3',
        });
        for (const draw of recent)
          await this.enqueue('ingest_draw', { draw_id: draw.id });
      } catch (error) {
        failures.push({
          denomination: source.denomination,
          error: error.message,
        });
        await this.event(
          'error',
          'discovery_failed',
          `Rs${source.denomination}: ${error.message}`,
        );
      }
    }
    await this.event(
      failures.length ? 'warning' : 'info',
      'discovery',
      `${discovered} new candidate files; ${failures.length} sources unresolved`,
      null,
      { failures },
    );
    if (!failures.length && sources.length === 6)
      await this.db.update(
        'heartbeat',
        { id: 'eq.1' },
        { last_discovery_ok: new Date().toISOString() },
      );
    return { new_files: discovered, failures };
  }
  async candidate(file, draw, structures) {
    let bytes;
    let digest = file.sha256;
    let storagePath = file.storage_path;
    if (file.url.startsWith('manual://') || file.device_fetched_at || (this.preferStoredBytes && storagePath)) {
      if (!storagePath) throw new Error('Manual file has no stored bytes');
      bytes = await this.db.download('draw-raw', storagePath);
    } else {
      const headers = {};
      if (file.etag) headers['If-None-Match'] = file.etag;
      if (file.last_modified) headers['If-Modified-Since'] = file.last_modified;
      let response = await this.fetch(file.url, headers);
      if (response.notModified && storagePath)
        bytes = await this.db.download('draw-raw', storagePath);
      else {
        if (response.notModified) response = await this.fetch(file.url);
        bytes = response.bytes;
        digest = await sha256(bytes);
        storagePath = `${draw.id}/${file.id}/${digest}.${file.kind}`;
        const existing = await this.db.select('draw_file_versions', {
          file_id: `eq.${file.id}`,
          sha256: `eq.${digest}`,
        });
        if (!existing.length) {
          try {
            await this.db.upload('draw-raw', storagePath, bytes);
          } catch (error) {
            if (!/HTTP 409|already exists|Duplicate/i.test(error.message))
              throw error;
          }
          await this.db.insert(
            'draw_file_versions',
            {
              file_id: file.id,
              sha256: digest,
              storage_path: storagePath,
              bytes: bytes.length,
            },
            { onConflict: 'file_id,sha256', ignore: true },
          );
        }
        await this.db.update(
          'draw_files',
          { id: `eq.${file.id}` },
          {
            sha256: digest,
            storage_path: storagePath,
            bytes: bytes.length,
            http_status: response.status,
            etag: response.headers.get('etag'),
            last_modified: response.headers.get('last-modified'),
            fetched_at: new Date().toISOString(),
            ...(file.sha256 !== digest ? { converted_sha256: null } : {}),
          },
        );
      }
    }
    let text;
    let conversionWarnings = [];
    if (file.kind === 'txt' || file.kind === 'manual')
      text = decodeOfficial(bytes);
    else if (this.converter && (!this.converter.supports || this.converter.supports.includes(file.kind))) {
      const converted = await this.converter(file.kind, bytes);
      text = converted.text;
      conversionWarnings = converted.warnings ?? [];
      await this.db.update(
        'draw_files',
        { id: `eq.${file.id}` },
        { converted_sha256: digest },
      );
    } else {
      await this.db.update(
        'draw_files',
        { id: `eq.${file.id}` },
        {
          parse_status: file.kind === 'pdf' ? 'needs_ocr' : 'review',
          issues: [
            `Requires ${
              file.kind === 'pdf'
                ? 'PDF text extraction or OCR'
                : 'document conversion'
            } in the document worker`,
          ],
        },
      );
      return { ...file, needsConversion: true };
    }
    if (!text?.trim()) {
      await this.db.update(
        'draw_files',
        { id: `eq.${file.id}` },
        {
          parse_status: 'needs_ocr',
          issues: ['No readable document text; OCR or manual review required'],
        },
      );
      return { ...file, needsConversion: true };
    }
    const result = parseWithStructure(text, draw, structures);
    result.verification.warnings.push(...conversionWarnings);
    if (conversionWarnings.some(w => /numeric cells|OCR/i.test(w))) {
      result.verification.issues.push(
        'Converted numeric/OCR values require explicit manual verification',
      );
      result.verification.ok = false;
      result.status = 'needs_review';
    }
    const counts = {
      first: result.parsed.first.length,
      second: result.parsed.second.length,
      third: result.parsed.third.length,
    };
    await this.db.update(
      'draw_files',
      { id: `eq.${file.id}` },
      {
        parse_status: result.verification.ok ? 'ok' : 'review',
        parsed_counts: counts,
        issues: result.verification.issues,
        warnings: result.verification.warnings,
      },
    );
    return { ...file, sha256: digest, result };
  }
  async ingest(drawId) {
    const draw = (await this.db.select('draws', { id: `eq.${drawId}` }))[0];
    if (!draw) throw new Error('Draw not found');
    const files = (
      await this.db.select('draw_files', { draw_id: `eq.${drawId}` })
    ).sort(compareCandidates);
    const structures = await this.db.select('prize_structures', {
      denomination: `eq.${draw.denomination}`,
    });
    const results = [];
    for (const file of files) {
      try {
        results.push(await this.candidate(file, draw, structures));
      } catch (error) {
        await this.db.update(
          'draw_files',
          { id: `eq.${file.id}` },
          { parse_status: 'failed', issues: [error.message] },
        );
        await this.event('error', 'download_failed', error.message, drawId, {
          file_id: file.id,
        });
        results.push({ ...file, error: error.message });
      }
    }
    const chosen = selectResult(results);
    if (chosen) {
      const { parsed, verification } = chosen.result;
      await this.db.rpc('replace_draw_result', {
        p_draw: drawId,
        p_file: chosen.id,
        p_status: chosen.result.status,
        p_numbers: resultNumbers(chosen.result),
        p_counts: {
          first: parsed.first.length,
          second: parsed.second.length,
          third: parsed.third.length,
        },
        p_issues: verification.issues,
        p_warnings: [
          ...verification.warnings,
          ...results
            .filter(r => r.needsConversion)
            .map(r => `Alternate ${r.kind} file awaits conversion`),
        ],
        p_suspects: parsed.suspects,
        p_draw_no: parsed.meta.drawNo ?? null,
        p_held_on: parsed.meta.heldOn ?? null,
        p_sha256: chosen.sha256,
      });
      await this.event(
        verification.ok ? 'info' : 'warning',
        'ingested',
        `Result ${chosen.result.status}`,
        drawId,
        { file_id: chosen.id, issues: verification.issues },
      );
    } else {
      const convertible = results.some(r => r.needsConversion);
      const status = convertible
        ? files.some(f => f.kind === 'pdf')
          ? 'needs_ocr'
          : 'incomplete'
        : 'failed';
      const issues = results.flatMap(r =>
        r.error
          ? [r.error]
          : r.needsConversion
          ? [`${r.kind} file requires conversion`]
          : [],
      );
      await this.db.rpc('replace_draw_result', {
        p_draw: drawId,
        p_file: null,
        p_status: status,
        p_numbers: [],
        p_counts: {},
        p_issues: issues.length ? issues : ['No readable result candidates'],
        p_warnings: [],
        p_suspects: [],
        p_draw_no: draw.draw_no,
        p_held_on: null,
      });
      if (!convertible)
        throw new Error(issues.join('; ') || 'No readable result candidates');
    }
  }
  async backfill() {
    const draws = await this.db.select(
      'draws',
      { status: 'not.in.(ok,ok_manual)' },
      { all: true },
    );
    for (const draw of draws)
      await this.enqueue('ingest_draw', { draw_id: draw.id });
    return draws.length;
  }
  async work(limit = 1) {
    const jobs = await this.db.rpc('claim_jobs', {
      p_limit: Math.min(limit, 3),
    });
    const outcome = [];
    for (const job of jobs) {
      try {
        if (job.kind === 'discover') {
          const result = await this.discover();
          if (result.failures.length)
            throw new Error(`${result.failures.length} sources unresolved`);
        } else if (job.kind === 'ingest_draw')
          await this.ingest(job.payload.draw_id);
        else if (job.kind === 'backfill') await this.backfill();
        else if (job.kind === 'match_draw')
          await this.db.rpc('recompute_matches', {
            p_draw: job.payload.draw_id,
          });
        else if (job.kind === 'rematch_bond')
          await this.db.rpc('recompute_matches', {
            p_bond: job.payload.bond_id,
          });
        else if (job.kind === 'reconcile')
          await this.db.rpc('recompute_matches');
        await this.db.rpc('finish_job', {
          p_id: job.id,
          p_lease: job.lease_token,
        });
        outcome.push({ id: job.id, status: 'done' });
      } catch (error) {
        await this.db.rpc('finish_job', {
          p_id: job.id,
          p_lease: job.lease_token,
          p_error: error.message,
        });
        await this.event(
          'error',
          'job_failed',
          error.message,
          job.payload.draw_id ?? null,
          { job_id: job.id },
        );
        outcome.push({ id: job.id, status: 'retry_or_failed' });
      }
    }
    return outcome;
  }
}
