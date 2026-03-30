const isProd = window.location.hostname !== 'localhost';
const BASE_URL = isProd ? '/api' : 'http://localhost:8000/api';

export const apiClient = {
  async get(endpoint) {
    const res = await fetch(`${BASE_URL}${endpoint}`);
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    return res.json();
  },
  async post(endpoint, data) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `API Error: ${res.statusText}`);
    }
    return res.json();
  },
  async upload(endpoint, file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `API Error: ${res.statusText}`);
    }
    return res.json();
  },
  async delete(endpoint) {
    const res = await fetch(`${BASE_URL}${endpoint}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    return res.json();
  }
};
