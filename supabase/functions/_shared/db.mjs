export class Database {
  constructor(url, key, token = key) {
    if (!/^https?:\/\//.test(url)) throw new Error('SUPABASE_URL is required');
    this.url = url.replace(/\/$/, '');
    this.key = key;
    this.token = token;
  }
  async request(path, { headers = {}, ...init } = {}) {
    const response = await fetch(this.url + path, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(25000),
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.token}`,
        ...headers,
      },
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok)
      throw Object.assign(new Error(
        `Supabase HTTP ${response.status}: ${
          data?.message ??
          data?.error_description ??
          data?.error ??
          'request failed'
        }`,
      ), { status: response.status, code: data?.code });
    return data;
  }
  async select(table, query = {}, { all = false } = {}) {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      if (offset > 500000)
        throw new Error('Query exceeds supported page count');
      const params = new URLSearchParams({
        select: '*',
        ...query,
        ...(all ? { limit: '1000', offset: String(offset) } : {}),
      });
      const page = await this.request(`/rest/v1/${table}?${params}`);
      if (!Array.isArray(page))
        throw new Error('Supabase returned an invalid table response');
      rows.push(...page);
      if (!all || page.length < 1000) return rows;
    }
  }
  insert(table, rows, { onConflict, ignore = false } = {}) {
    const query = onConflict
      ? '?on_conflict=' + encodeURIComponent(onConflict)
      : '';
    return this.request(`/rest/v1/${table}${query}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: `return=representation${
          onConflict
            ? ',resolution=' + (ignore ? 'ignore' : 'merge') + '-duplicates'
            : ''
        }`,
      },
      body: JSON.stringify(rows),
    });
  }
  update(table, filter, values) {
    return this.request(`/rest/v1/${table}?${new URLSearchParams(filter)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(values),
    });
  }
  rpc(name, args = {}) {
    return this.request(`/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
  }
  async upload(bucket, path, bytes, contentType = 'application/octet-stream') {
    return this.request(`/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
      body: bytes,
    });
  }
  async download(bucket, path) {
    const response = await fetch(
      `${this.url}/storage/v1/object/${bucket}/${path}`,
      {
        signal: AbortSignal.timeout(25000),
        headers: { apikey: this.key, Authorization: `Bearer ${this.token}` },
      },
    );
    if (!response.ok)
      throw new Error(`Stored file unavailable: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
