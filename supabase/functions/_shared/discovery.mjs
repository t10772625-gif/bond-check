import { decodeOfficial, extractAllDrawLinks } from './core.mjs';

// Both server fetching and authenticated device fetching use this ingestion path.
export async function registerSourcePage(db, source, bytes, url, headers = new Headers()) {
  const links = extractAllDrawLinks(decodeOfficial(bytes), url);
  if (!links.length) throw new Error('No dated official result links found; inspect the source page');
  if (source.last_link_count > 10 && links.length < source.last_link_count * 0.8)
    throw new Error(`Result links fell from ${source.last_link_count} to ${links.length}; inspect the source page`);
  const dates = [...new Set(links.map(link => link.date))];
  await db.insert('draws', dates.map(date => ({ denomination: source.denomination, draw_date: date })),
    { onConflict: 'denomination,draw_date', ignore: true });
  const draws = await db.select('draws', { denomination: `eq.${source.denomination}` }, { all: true });
  const byDate = new Map(draws.map(draw => [draw.draw_date, draw]));
  const existing = await db.select('draw_files', { select: 'id,url,draw_id' }, { all: true });
  const known = new Set(existing.map(file => file.url));
  const added = links.filter(link => !known.has(link.url));
  if (added.length) {
    await db.insert('draw_files', added.map(link => ({
      draw_id: byDate.get(link.date).id, url: link.url, kind: link.kind,
      label: link.label, is_revised: link.is_revised,
    })), { onConflict: 'url', ignore: true });
    for (const id of new Set(added.map(link => byDate.get(link.date).id)))
      await db.rpc('enqueue_job', { p_kind: 'ingest_draw', p_payload: { draw_id: id } });
  }
  await db.update('sources', { denomination: `eq.${source.denomination}` }, {
    etag: headers.get('etag'), last_modified: headers.get('last-modified'),
    last_discovered_at: new Date().toISOString(), last_link_count: links.length,
  });
  return added.length;
}
