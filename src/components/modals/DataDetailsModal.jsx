import React from 'react';
import { X, Database, FileText, CheckCircle, Plus, Info, Table } from 'lucide-react';

const DataDetailsModal = ({ isOpen, onClose, dataset, onImport, isAlreadyImported }) => {
  if (!isOpen || !dataset) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="t-panel rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border t-border" style={{ borderRadius: 'var(--theme-radius-panel)' }}>
        
        {/* Header */}
        <div className="p-6 border-b t-border flex items-center justify-between bg-black/5">
          <div className="flex items-center gap-4">
            <div className="p-3 t-accent-bg rounded-2xl text-white shadow-lg shadow-[var(--theme-accent)]/20">
              <Database size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black t-text-main tracking-tight">{dataset.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold t-text-muted uppercase tracking-widest">Dataset ID:</span>
                <span className="px-2 py-0.5 bg-black/5 rounded text-[10px] font-mono t-text-muted font-bold">{dataset.id}</span>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-black/5 rounded-full transition-all t-text-muted hover:t-text-main hover:rotate-90"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Col: Metadata & Description */}
            <div className="lg:col-span-1 space-y-6">
                <section>
                    <h3 className="text-[10px] font-black uppercase t-text-muted tracking-widest mb-3 flex items-center gap-2">
                        <Info size={14} /> Description
                    </h3>
                    <p className="text-sm t-text-main leading-relaxed bg-black/5 p-4 rounded-2xl border t-border" style={{ borderRadius: 'calc(var(--theme-radius-panel) / 2)' }}>
                        {dataset.description || "No description provided for this dataset. Use the BI tool to add documentation for your team."}
                    </p>
                </section>

                <section>
                    <h3 className="text-[10px] font-black uppercase t-text-muted tracking-widest mb-3 flex items-center gap-2">
                        <Table size={14} /> Schema Stats
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-[var(--theme-panel-bg)] border t-border rounded-2xl shadow-sm">
                            <div className="text-2xl font-black t-text-main">{dataset.headers?.length || 0}</div>
                            <div className="text-[10px] font-bold t-text-muted uppercase">Columns</div>
                        </div>
                        <div className="p-4 bg-[var(--theme-panel-bg)] border t-border rounded-2xl shadow-sm">
                            <div className="text-2xl font-black t-text-main">{dataset.sample_data?.length || 0}</div>
                            <div className="text-[10px] font-bold t-text-muted uppercase">Sample Rows</div>
                        </div>
                    </div>
                </section>

                <section>
                    <h3 className="text-[10px] font-black uppercase t-text-muted tracking-widest mb-3">Columns</h3>
                    <div className="flex flex-wrap gap-2">
                        {(dataset.headers || []).map(h => (
                            <span key={h} className="px-2.5 py-1 bg-black/5 t-text-muted text-[11px] font-bold rounded-lg border t-border">
                                {h}
                            </span>
                        ))}
                    </div>
                </section>
            </div>

            {/* Right Col: Data Preview */}
            <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase t-text-muted tracking-widest flex items-center gap-2">
                         Data Preview (First 5 Rows)
                    </h3>
                    <span className="text-[10px] font-bold t-accent bg-black/5 px-2 py-0.5 rounded-full uppercase tracking-tighter">Live from Backend</span>
                </div>

                <div className="border t-border rounded-2xl overflow-hidden bg-black/5 shadow-inner max-w-full">
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                                <tr className="bg-black/5">
                                    {(dataset.headers || []).map(h => (
                                        <th key={h} className="p-3 text-[10px] font-black uppercase t-text-muted border-b t-border whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y t-border bg-[var(--theme-panel-bg)]">
                                {(dataset.sample_data || []).map((row, i) => (
                                    <tr key={i} className="hover:bg-black/5 transition-colors">
                                        {(dataset.headers || []).map(h => (
                                            <td key={h} className="p-3 text-[12px] t-text-muted truncate max-w-[200px]" title={row[h]}>
                                                {row[h]?.toString() || ''}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {(!dataset.sample_data || dataset.sample_data.length === 0) && (
                        <div className="p-10 text-center">
                            <Database size={32} className="mx-auto t-text-muted mb-3 opacity-20" />
                            <p className="text-sm t-text-muted italic">No sample data available for preview.</p>
                        </div>
                    )}
                </div>
            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t t-border bg-black/5 flex justify-between items-center px-8">
          <div className="text-xs t-text-muted font-medium">
             This dataset is shared with everyone in the <b>{dataset.workspace_id || 'active'}</b> workspace.
          </div>
          <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-bold t-text-muted hover:t-text-main transition-colors"
                >
                Close
              </button>
              {isAlreadyImported ? (
                  <button 
                    disabled
                    className="flex items-center gap-2 px-8 py-2.5 bg-black/5 t-accent rounded-full text-sm font-black shadow-sm"
                    >
                    <CheckCircle size={18} /> Already in Report
                  </button>
              ) : (
                  <button 
                    onClick={() => onImport(dataset)}
                    className="flex items-center gap-2 px-8 py-2.5 t-accent-bg text-white rounded-full text-sm font-black shadow-lg shadow-[var(--theme-accent)]/20 hover:opacity-90 active:scale-95 transition-all"
                    >
                    <Plus size={18} /> Add to Report
                  </button>
              )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default DataDetailsModal;
