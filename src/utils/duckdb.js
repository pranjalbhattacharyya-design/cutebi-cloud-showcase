import { apiClient } from '../services/api';

/**
 * Execute a SQL query on the backend DuckDB engine
 */
export async function queryDuckDB(sql) {
    if (!sql) return [];
    try {
        const results = await apiClient.post('/query', { sql });
        
        // Handle backend-reported DuckDB errors
        if (results && results.error) {
            window.dispatchEvent(new CustomEvent('cutebi-debug', { 
                detail: { 
                    type: 'error', 
                    category: 'Engine', 
                    message: `DuckDB Error: ${results.error}`, 
                    details: { 
                        sql: results.sql,
                        activeViews: results.active_views 
                    } 
                } 
            }));
            throw new Error(results.error);
        }

        return results.data || results;
    } catch (e) {
        console.error("DuckDB API Error:", e);
        throw e;
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
