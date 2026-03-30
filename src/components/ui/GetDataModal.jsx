import React, { useState, useEffect } from 'react';
import { Database, X, Plus, CheckCircle2, Loader2, Search, Table2, BarChart3 } from 'lucide-react';
import { apiClient } from '../../services/api';

/**
 * GetDataModal — BigQuery table browser.
 * Opens instead of the old file-upload dialog.
 * Lists tables from `cutebi_gold` and registers them as CuteBI datasets.
 */
export default function GetDataModal({ isOpen, onClose, onDatasetAdded }) {
  const [tables, setTables]         = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [search, setSearch]         = useState('');
  const [registering, setRegistering] = useState({}); // { table_id: 'loading'|'done' }

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    apiClient.getBqTables()
      .then(data => { setTables(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = tables.filter(t =>
    t.display_name.toLowerCase().includes(search.toLowerCase()) ||
    t.table_id.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (table) => {
    if (registering[table.table_id] === 'done') return;
    setRegistering(prev => ({ ...prev, [table.table_id]: 'loading' }));
    try {
      const ds = await apiClient.registerBqTable(table.table_id, table.display_name);
      setRegistering(prev => ({ ...prev, [table.table_id]: 'done' }));
      onDatasetAdded(ds);
    } catch (err) {
      setRegistering(prev => ({ ...prev, [table.table_id]: null }));
      alert(`Failed to add ${table.display_name}: ${err.message}`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="t-panel border t-border shadow-2xl flex flex-col"
        style={{
          width: 520,
          maxHeight: '85vh',
          borderRadius: 'var(--theme-radius-panel)',
          animation: 'slideUp 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b t-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="t-accent-bg p-2 shadow" style={{ borderRadius: 'var(--theme-radius-button)' }}>
              <Database size={18} />
            </div>
            <div>
              <h2 className="text-base font-black t-text-main tracking-tight">Get Data</h2>
              <p className="text-[11px] t-text-muted font-medium">Browse BigQuery · cutebi_gold</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="t-text-muted hover:t-text-main transition-colors p-1 rounded-md hover:bg-black/5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b t-border shrink-0">
          <div className="flex items-center gap-2 t-panel border t-border px-3 py-2" style={{ borderRadius: 'var(--theme-radius-button)' }}>
            <Search size={14} className="t-text-muted shrink-0" />
            <input
              autoFocus
              type="text"
              placeholder="Search tables…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm t-text-main placeholder:t-text-muted"
            />
          </div>
        </div>

        {/* Table list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={28} className="t-accent animate-spin" />
              <p className="text-sm t-text-muted font-medium">Connecting to BigQuery…</p>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
              <strong>Error:</strong> {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-10 t-text-muted text-sm">No tables found.</div>
          )}
          {!loading && !error && filtered.map(table => {
            const state = registering[table.table_id];
            const isDone = state === 'done';
            const isLoading = state === 'loading';
            return (
              <div
                key={table.table_id}
                className={`flex items-center justify-between px-4 py-3 mb-2 border t-border transition-all cursor-pointer group
                  ${isDone ? 'opacity-60 pointer-events-none' : 'hover:border-[var(--theme-accent)] hover:bg-[var(--theme-accent)]/5'}`}
                style={{ borderRadius: 'var(--theme-radius-button)' }}
                onClick={() => !isDone && !isLoading && handleAdd(table)}
              >
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                  <div className={`shrink-0 p-1.5 rounded-md ${isDone ? 'bg-green-100' : 'bg-[var(--theme-accent)]/10 group-hover:bg-[var(--theme-accent)]/20'} transition-colors`}>
                    {isDone ? (
                      <CheckCircle2 size={16} className="text-green-600" />
                    ) : (
                      <Table2 size={16} className="t-accent" />
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold t-text-main truncate">{table.display_name}</p>
                    <p className="text-[11px] t-text-muted font-mono">{table.table_id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-[11px] t-text-muted font-medium">
                      <BarChart3 size={11} />
                      {table.num_rows?.toLocaleString()} rows
                    </div>
                    <div className="text-[10px] t-text-muted opacity-60">
                      {table.schema?.length} cols
                    </div>
                  </div>
                  {isLoading ? (
                    <Loader2 size={16} className="t-accent animate-spin" />
                  ) : isDone ? (
                    <CheckCircle2 size={16} className="text-green-600" />
                  ) : (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus size={16} className="t-accent" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t t-border shrink-0 flex items-center justify-between">
          <p className="text-[11px] t-text-muted">
            {tables.length} table{tables.length !== 1 ? 's' : ''} in <span className="font-mono font-bold">cutebi_gold</span>
          </p>
          <button
            onClick={onClose}
            className="t-button px-4 py-1.5 text-xs font-bold transition-all"
            style={{ borderRadius: 'var(--theme-radius-button)' }}
          >
            Done
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
