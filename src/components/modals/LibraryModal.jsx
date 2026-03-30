import React, { useState, useEffect } from 'react';
import { Search, Database, Plus, X, FileText, CheckCircle } from 'lucide-react';

const LibraryModal = ({ isOpen, onClose, onSelect, existingDatasetIds = [] }) => {
  const [library, setLibrary] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetch('http://localhost:8000/api/library')
        .then(res => res.json())
        .then(data => {
          setLibrary(data);
          setLoading(false);
        })
        .catch(err => {
          console.error("Library fetch failed:", err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = library.filter(ds => 
    ds.name.toLowerCase().includes(search.toLowerCase()) || 
    ds.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-200">
              <Database size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Platinum Data Library</h2>
              <p className="text-sm text-slate-500 font-medium">Browse and reuse high-performance backend datasets</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="relative group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
            <input 
              type="text"
              placeholder="Search by name or dataset ID..."
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 placeholder:text-slate-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-slate-500 font-medium animate-pulse">Consulting the Platinum Repository...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 px-8 bg-white rounded-2xl border border-dashed border-slate-200 mx-4 mt-4">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                 <Search size={32} />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">No datasets found</h3>
              <p className="text-slate-500 mt-1">Try adjusting your search or upload a new file to the library.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map(ds => {
                const isExisting = existingDatasetIds.includes(ds.id);
                return (
                  <div 
                    key={ds.id}
                    className={`group p-4 bg-white border rounded-2xl transition-all duration-200 ${
                      isExisting 
                        ? 'border-indigo-100 bg-indigo-50/20 opacity-80 cursor-default' 
                        : 'border-slate-200 hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-500/10 cursor-pointer'
                    }`}
                    onClick={() => !isExisting && onSelect(ds)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="p-2.5 bg-slate-50 rounded-xl text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors shrink-0">
                        <FileText size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-800 truncate leading-tight mb-1" title={ds.name}>
                          {ds.name}
                        </h4>
                        <div className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded tracking-normal normal-case font-mono">{ds.id}</span>
                          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                          <span>{ds.headers?.length || 0} columns</span>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center h-full">
                        {isExisting ? (
                          <div className="p-1.5 bg-green-50 text-green-500 rounded-lg" title="Already in Report">
                            <CheckCircle size={18} />
                          </div>
                        ) : (
                          <div className="p-1.5 bg-slate-50 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white rounded-lg transition-all transform group-hover:scale-110">
                            <Plus size={18} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-white flex justify-between items-center text-[12px] font-medium text-slate-400 px-6">
          <p>Displaying {filtered.length} of {library.length} platinum datasets</p>
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"></div> System Online</span>
            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Parquet Optimized</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LibraryModal;
