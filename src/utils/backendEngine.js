import { apiClient } from '../services/api';

let queryQueue = [];
let batchTimeout = null;

/**
 * Execute a SQL query on the backend engine (Wait-and-Bundle approach)
 */
export async function queryDuckDB(sql) {
    if (!sql) return [];
    
    return new Promise((resolve, reject) => {
        // 1. Add this query to the queue
        queryQueue.push({ sql, resolve, reject });

        // 2. Start a 50ms window if one isn't already running
        if (!batchTimeout) {
            batchTimeout = setTimeout(flushQueryQueue, 50);
        }
    });
}

async function flushQueryQueue() {
    // 1. Grab all queries currently in the queue and clear it
    const currentQueue = [...queryQueue];
    queryQueue = [];
    batchTimeout = null;
    
    if (currentQueue.length === 0) return;

    try {
        const sqlArray = currentQueue.map(q => q.sql);
        
        window.dispatchEvent(new CustomEvent('cutebi-debug', { 
            detail: { type: 'info', category: 'Engine', message: `Bundling ${sqlArray.length} queries into single network request...` } 
        }));

        const results = await apiClient.post('/query/batch', { queries: sqlArray });

        if (results && results.error) {
            throw new Error(results.error);
        }

        const dataArray = results.data || results;

        // Resolve each promise with its respective data
        currentQueue.forEach((q, i) => {
            q.resolve(dataArray[i] || []);
        });

    } catch (e) {
        console.error("Batch Query API Error:", e);
        window.dispatchEvent(new CustomEvent('cutebi-debug', { 
            detail: { type: 'error', category: 'Engine', message: `Batch Error: ${e.message}` } 
        }));
        currentQueue.forEach(q => q.reject(e));
    }
}

/**
 * Helper to initialize (noop now as backend handles it)
 */
export async function initDuckDB() {
    return { status: 'backend-ready' };
}

export async function getDuckDB() {
    return { status: 'backend-ready' };
}

/**
 * Register a CSV file (uploads to backend)
 */
export async function registerCSV(name, buffer, file) {
    if (file) {
        const ds = await apiClient.upload('/upload', file);
        return ds; 
    }
    throw new Error("Direct buffer registration not supported on backend. Please provide file object.");
}

export async function registerJSON(name, buffer, file) {
    if (file) {
        const ds = await apiClient.upload('/upload', file);
        return ds;
    }
    throw new Error("Direct buffer registration not supported on backend. Please provide file object.");
}
