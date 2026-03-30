const isProd = window.location.hostname !== 'localhost';
const BASE_URL = isProd ? '/api' : 'http://localhost:8000/api';

export const apiClient = {
  async get(endpoint) {
    const res = await fetch(`${BASE_URL}${endpoint}`);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text || 'no response body'}`);
    }
    return res.json();
  },
  async post(endpoint, data) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = '';
      try { detail = JSON.parse(text)?.detail; } catch {}
      throw new Error(detail || `HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  },
  async upload(endpoint, file, originalFilename) {
    const formData = new FormData();
    formData.append('file', file);
    if (originalFilename) {
      formData.append('original_filename', originalFilename);
    }
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let detail = '';
      try { detail = JSON.parse(text)?.detail; } catch {}
      throw new Error(detail || `HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    return res.json();
  },

  // ── Direct-upload flow (legacy — kept for local/Supabase mode) ────────────
  async prepareUpload(filename, displayName) {
    const params = new URLSearchParams({ filename });
    if (displayName) params.append('display_name', displayName);
    return this.get(`/upload/prepare?${params}`);
  },
  async uploadToStorage(signedUrl, csvBlob) {
    const res = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/csv' },
      body: csvBlob,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase direct upload failed (${res.status}): ${text.slice(0, 200)}`);
    }
  },
  async registerDataset(payload) {
    return this.post('/register-dataset', payload);
  },

  // ── BigQuery "Get Data" flow ──────────────────────────────────────────────

  /** List all tables available in the cutebi_gold BQ dataset */
  async getBqTables() {
    return this.get('/bq/tables');
  },

  /** Register a BQ table as a CuteBI dataset (persists to Postgres) */
  async registerBqTable(bqTable, displayName) {
    return this.post('/bq/register', { bq_table: bqTable, display_name: displayName });
  },

  /**
   * Fetch MAX(date) for a list of BQ dataset/column pairs.
   * Replaces the browser WASM DuckDB date warmup scan.
   * @param {Array<{key, ds_id, col}>} queries
   * @returns {Object} e.g. { "Fact Sale::Date": "2026-03-31" }
   */
  async getBqMaxDates(queries) {
    return this.post('/bq/maxdates', { queries });
  },

  async delete(endpoint) {
    const res = await fetch(`${BASE_URL}${endpoint}`, { method: 'DELETE' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }
};
