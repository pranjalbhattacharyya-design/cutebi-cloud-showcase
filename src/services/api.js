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
    // Send the original filename (e.g. 'Fact Sale.xlsx') so the backend
    // can store the correct display name even if we converted to CSV first
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

  // ── Direct-upload flow (bypasses Vercel for file bytes) ─────────────────
  // Step 1: Get a Supabase signed upload URL from backend (fast, <1s)
  async prepareUpload(filename, displayName) {
    const params = new URLSearchParams({ filename });
    if (displayName) params.append('display_name', displayName);
    return this.get(`/upload/prepare?${params}`);
  },

  // Step 2: PUT the CSV bytes directly to Supabase (browser→Supabase, no Vercel)
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

  // Step 3: Tell backend to save metadata + register DuckDB view (fast, <1s)
  async registerDataset(payload) {
    return this.post('/register-dataset', payload);
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
