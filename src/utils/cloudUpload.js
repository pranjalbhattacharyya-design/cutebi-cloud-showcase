/**
 * cloudUpload.js
 *
 * Direct-upload pipeline (bypasses Vercel's 10-second timeout):
 *
 *   Step 1 – prepare:   GET /api/upload/prepare  → signed Supabase URL   (<1s, Vercel)
 *   Step 2 – upload:    PUT  <signed URL>          → file bytes go straight to Supabase (no Vercel)
 *   Step 3 – register:  POST /api/register-dataset → metadata saved to Postgres + DuckDB view  (<1s, Vercel)
 *
 * Usage:
 *   import { cloudUploadFile } from '../utils/cloudUpload';
 *   const result = await cloudUploadFile(csvFile, originalName, (msg) => showToast(msg));
 *   // result: { id, name, original_file_name, table_name, headers, sample_data, public_url, engine }
 */

import { apiClient } from '../services/api';

/**
 * Parse headers and up to 5 sample rows from a CSV File/Blob in the browser.
 * Uses the native CSV parsing via comma-separation (covers SheetJS output).
 */
async function parseCsvMeta(csvBlob) {
  const text = await csvBlob.text();
  // Strip BOM if present
  const clean = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const lines = clean.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { headers: [], sample_data: [] };

  // Simple CSV row parser (handles quoted fields)
  const parseRow = (line) => {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const headers = parseRow(lines[0]);
  const sample_data = [];
  for (let i = 1; i < Math.min(6, lines.length); i++) {
    const row = parseRow(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] ?? ''; });
    sample_data.push(obj);
  }
  return { headers, sample_data };
}

/**
 * Upload a CSV file (or Blob) directly to Supabase Storage, bypassing Vercel.
 *
 * @param {File|Blob} csvFile       - The CSV file/blob to upload.
 * @param {string}    originalName  - The original display name (e.g. 'Fact Sale.xlsx').
 * @param {Function}  [onStatus]    - Optional callback for status messages.
 * @returns {Promise<object>}       - The registered dataset metadata from the backend.
 */
export async function cloudUploadFile(csvFile, originalName, onStatus = () => {}) {
  const csvName = csvFile.name || originalName;

  // Step 1: Get signed URL from backend
  onStatus(`[Upload] Preparing cloud upload for "${originalName}"...`);
  const prep = await apiClient.prepareUpload(csvName, originalName);
  const { ds_id, signed_url, public_url } = prep;

  // Step 2: Browser → Supabase directly (no Vercel involved)
  onStatus(`[Upload] Sending "${originalName}" directly to Supabase...`);
  await apiClient.uploadToStorage(signed_url, csvFile);
  onStatus(`[Upload] ✅ "${originalName}" stored in Supabase.`);

  // Parse headers + sample from the CSV in-browser (no round-trip needed)
  const { headers, sample_data } = await parseCsvMeta(csvFile);

  // Step 3: Register metadata on backend
  onStatus(`[Upload] Registering "${originalName}" in workspace...`);
  const result = await apiClient.registerDataset({
    ds_id,
    display_name: originalName,
    public_url,
    headers,
    sample_data,
  });

  onStatus(`[Upload] ✅ "${originalName}" ready!`);
  return result;
}
