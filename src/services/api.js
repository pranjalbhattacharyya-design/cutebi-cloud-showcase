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
  async delete(endpoint) {
    const res = await fetch(`${BASE_URL}${endpoint}`, { method: 'DELETE' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }
};
