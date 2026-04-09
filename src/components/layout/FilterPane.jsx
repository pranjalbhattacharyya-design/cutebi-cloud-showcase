import React from 'react';
import { X, Filter, Plus, Trash2, Layout, Database, ChevronRight, ChevronDown } from 'lucide-react';
import { useAppState } from '../../contexts/AppStateContext';
import { useDataEngine } from '../../hooks/useDataEngine';
import MultiSelect from '../ui/MultiSelect';

export default function FilterPane({ isOpen, onClose }) {
  const {
    pageFilters, setPageFilters,
    globalFilters, setGlobalFilters,
    activePageId, pages,
    globalSemanticFields, activeDatasetId
  } = useAppState();

  const { getUniqueValuesForDim } = useDataEngine();

  const [dimValuesCache, setDimValuesCache] = React.useState({});
  const [fetchingDims] = React.useState(new Set());
  const [expandedSections, setExpandedSections] = React.useState({ page: true, report: true });

  const currentPage = pages.find(p => p.id === activePageId);
  const currentPageFilters = pageFilters[activePageId] || {};

  const dimensions = React.useMemo(() => globalSemanticFields.filter(f => f.type === 'dimension'), [globalSemanticFields]);

  // Fetch distinct values for multi-selects
  const fetchValues = async (dimId) => {
    if (dimValuesCache[dimId] || fetchingDims.has(dimId)) return;
    fetchingDims.add(dimId);
    const field = dimensions.find(d => d.value === dimId);
    const targetDsId = field?.originDatasetId || activeDatasetId;
    try {
      const values = await getUniqueValuesForDim(targetDsId, dimId);
      setDimValuesCache(prev => ({ ...prev, [dimId]: values || [] }));
    } catch (err) {
      console.error('[FilterPane] Failed to fetch values', dimId, err);
    } finally {
      fetchingDims.delete(dimId);
    }
  };

  const updatePageFilter = (fieldId, values) => {
    setPageFilters(prev => {
      const next = { ...prev };
      const page = { ...(next[activePageId] || {}) };
      if (!values || values.length === 0) delete page[fieldId];
      else page[fieldId] = values;
      next[activePageId] = page;
      return next;
    });
  };

  const updateReportFilter = (fieldId, values) => {
    setGlobalFilters(prev => {
      const next = { ...prev };
      if (!values || values.length === 0) delete next[fieldId];
      else next[fieldId] = values;
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-[var(--theme-panel-bg)] border-l t-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between p-4 border-b t-border">
        <div className="flex items-center gap-2">
          <Filter size={18} className="t-accent" />
          <h2 className="text-sm font-black t-text-main uppercase tracking-widest">Authored Filters</h2>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
          <X size={18} className="t-text-muted" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Page Level Section */}
        <section>
          <button 
            onClick={() => setExpandedSections(s => ({ ...s, page: !s.page }))}
            className="flex items-center justify-between w-full mb-3 group"
          >
            <div className="flex items-center gap-2">
              <Layout size={14} className="t-text-muted transition-colors group-hover:t-accent" />
              <span className="text-[11px] font-black t-text-main uppercase tracking-widest">
                Filters on this Page
              </span>
              <span className="text-[10px] bg-black/5 px-1.5 py-0.5 rounded-full t-text-muted font-bold">
                {currentPage?.name}
              </span>
            </div>
            {expandedSections.page ? <ChevronDown size={14} className="t-text-muted"/> : <ChevronRight size={14} className="t-text-muted"/>}
          </button>

          {expandedSections.page && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="relative group/add">
                <select 
                  className="w-full bg-black/5 border t-border px-3 py-2 text-xs font-bold t-text-main outline-none appearance-none hover:bg-black/10 transition-all"
                  style={{ borderRadius: 'var(--theme-radius-button)' }}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      updatePageFilter(val, []);
                      fetchValues(val);
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="">+ Add Page Filter...</option>
                  {dimensions.map(d => (
                    <option key={d.value} value={d.value} disabled={!!currentPageFilters[d.value]}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-3">
                {Object.entries(currentPageFilters).map(([fieldId, selected]) => {
                  const field = dimensions.find(d => d.value === fieldId);
                  if (!field) return null;
                  return (
                    <div key={fieldId} className="bg-white/40 p-3 border t-border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black t-text-main truncate pr-2 uppercase italic">{field.label}</span>
                        <button onClick={() => updatePageFilter(fieldId, null)} className="text-red-400 hover:text-red-600">
                          <Trash2 size={12}/>
                        </button>
                      </div>
                      <MultiSelect 
                        placeholder="Select values..."
                        options={(dimValuesCache[fieldId] || []).map(v => ({ value: String(v), label: String(v) }))}
                        value={selected}
                        onChange={(vals) => updatePageFilter(fieldId, vals)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Report Level Section */}
        <section>
          <button 
            onClick={() => setExpandedSections(s => ({ ...s, report: !s.report }))}
            className="flex items-center justify-between w-full mb-3 group"
          >
            <div className="flex items-center gap-2">
              <Database size={14} className="t-text-muted transition-colors group-hover:orange-400" />
              <span className="text-[11px] font-black t-text-main uppercase tracking-widest">
                Filters on all Pages
              </span>
              <span className="text-[10px] bg-black/5 px-1.5 py-0.5 rounded-full t-text-muted font-bold uppercase">
                Report
              </span>
            </div>
            {expandedSections.report ? <ChevronDown size={14} className="t-text-muted"/> : <ChevronRight size={14} className="t-text-muted"/>}
          </button>

          {expandedSections.report && (
            <div className="space-y-3 animate-in fade-in duration-200">
               <select 
                  className="w-full bg-black/5 border t-border px-3 py-2 text-xs font-bold t-text-main outline-none appearance-none hover:bg-black/10 transition-all"
                  style={{ borderRadius: 'var(--theme-radius-button)' }}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      updateReportFilter(val, []);
                      fetchValues(val);
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="">+ Add Report Filter...</option>
                  {dimensions.map(d => (
                    <option key={d.value} value={d.value} disabled={!!globalFilters[d.value]}>
                      {d.label}
                    </option>
                  ))}
                </select>

                <div className="flex flex-col gap-3">
                {Object.entries(globalFilters).map(([fieldId, selected]) => {
                  const field = dimensions.find(d => d.value === fieldId);
                  if (!field) return null;
                  return (
                    <div key={fieldId} className="bg-white/40 p-3 border t-border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black t-text-main truncate pr-2 uppercase italic">{field.label}</span>
                        <button onClick={() => updateReportFilter(fieldId, null)} className="text-red-400 hover:text-red-600">
                          <Trash2 size={12}/>
                        </button>
                      </div>
                      <MultiSelect 
                        placeholder="Select values..."
                        options={(dimValuesCache[fieldId] || []).map(v => ({ value: String(v), label: String(v) }))}
                        value={selected}
                        onChange={(vals) => updateReportFilter(fieldId, vals)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="p-4 bg-black/5 border-t t-border">
         <p className="text-[9px] t-text-muted italic leading-tight uppercase font-black tracking-tighter opacity-70">
           Note: Slicers on the dashboard act as top-level interactive filters and are merged with these authored constraints.
         </p>
      </div>
    </div>
  );
}
