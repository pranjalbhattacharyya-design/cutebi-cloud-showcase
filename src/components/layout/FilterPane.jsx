import React from 'react';
import { X, Filter, Plus, Trash2, Layout, Database, ChevronRight, ChevronDown } from 'lucide-react';
import { useAppState } from '../../contexts/AppStateContext';
import { useDataEngine } from '../../hooks/useDataEngine';
import MultiSelect from '../ui/MultiSelect';

// --- Shared Filter Row Component for Page/Report Authored Filters ---
const AuthoredFilterRow = ({ filter, idx, onChange, onRemove, dimensions, dimValuesCache }) => {
  const uid = React.useId();
  return (
    <div className="flex gap-2 items-center bg-white/40 p-2.5 border t-border rounded-lg group/row">
      <select
        className="flex-1 bg-transparent text-[11px] font-bold t-text-main outline-none min-w-0"
        value={filter.dimensionId}
        onChange={e => onChange(idx, 'dimensionId', e.target.value)}
      >
        <option value="">Select field...</option>
        {dimensions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      
      <select
        className="w-16 bg-transparent text-[11px] font-black t-accent outline-none flex-shrink-0"
        value={filter.operator || '='}
        onChange={e => onChange(idx, 'operator', e.target.value)}
      >
        <option value="=">=</option>
        <option value="!=">≠</option>
        <option value="contains">contains</option>
        <option value="IN">IN</option>
      </select>

      {filter.operator === 'IN' ? (
        <div className="flex-1 min-w-0">
          <MultiSelect
            placeholder="Values"
            options={(dimValuesCache[filter.dimensionId] || []).map(v => ({ value: String(v), label: String(v) }))}
            value={Array.isArray(filter.value) ? filter.value : []}
            onChange={vals => onChange(idx, 'value', vals)}
          />
        </div>
      ) : (
        <div className="flex-1 min-w-0 relative">
          <input
            list={`dl-auth-${uid}-${idx}`}
            className="w-full bg-transparent border-b t-border px-1 py-0.5 text-[11px] t-text-main outline-none"
            placeholder="value"
            value={Array.isArray(filter.value) ? '' : (filter.value || '')}
            onChange={e => onChange(idx, 'value', e.target.value)}
          />
          <datalist id={`dl-auth-${uid}-${idx}`}>
            {(dimValuesCache[filter.dimensionId] || []).map(opt => <option key={opt} value={opt}/>)}
          </datalist>
        </div>
      )}

      <button onClick={() => onRemove(idx)} className="p-1 t-text-muted hover:text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity">
        <Trash2 size={12}/>
      </button>
    </div>
  );
};

export default function FilterPane({ isOpen, onClose }) {
  const {
    pageFilters, setPageFilters,
    authoredReportFilters, setAuthoredReportFilters,
    activePageId, pages,
    globalSemanticFields, activeDatasetId
  } = useAppState();

  const { getUniqueValuesForDim } = useDataEngine();

  const [dimValuesCache, setDimValuesCache] = React.useState({});
  const fetchingDims = React.useRef(new Set());
  const [expandedSections, setExpandedSections] = React.useState({ page: true, report: true });

  const currentPage = pages.find(p => p.id === activePageId);
  const [localPageFilters, setLocalPageFilters] = React.useState([]);
  const [localReportFilters, setLocalReportFilters] = React.useState([]);

  React.useEffect(() => {
    if (isOpen) {
      setLocalPageFilters(pageFilters[activePageId] || []);
      setLocalReportFilters(authoredReportFilters || []);
    }
  }, [isOpen, activePageId]);

  const dimensions = React.useMemo(() => globalSemanticFields.filter(f => f.type === 'dimension'), [globalSemanticFields]);

  // Sync fetching logic with builder
  const activeDimIds = React.useMemo(() => {
    const ids = new Set();
    localPageFilters.forEach(f => { if (f.dimensionId) ids.add(f.dimensionId); });
    localReportFilters.forEach(f => { if (f.dimensionId) ids.add(f.dimensionId); });
    return Array.from(ids);
  }, [localPageFilters, localReportFilters]);

  React.useEffect(() => {
    const toFetch = activeDimIds.filter(id => !dimValuesCache[id] && !fetchingDims.current.has(id));
    toFetch.forEach(async (dimId) => {
      fetchingDims.current.add(dimId);
      const field = dimensions.find(d => d.value === dimId);
      const targetDsId = field?.originDatasetId || activeDatasetId;
      try {
        const values = await getUniqueValuesForDim(targetDsId, dimId);
        setDimValuesCache(prev => ({ ...prev, [dimId]: values || [] }));
      } catch (err) {
        console.error('[FilterPane] Failed to fetch values', dimId, err);
      } finally {
        fetchingDims.current.delete(dimId);
      }
    });
  }, [activeDimIds, activeDatasetId, getUniqueValuesForDim, dimensions, dimValuesCache]);

  const updatePageFilter = (idx, key, val) => {
    setLocalPageFilters(prev => {
      const pageList = [...prev];
      if (idx === -1) {
        pageList.push({ dimensionId: '', operator: '=', value: '' });
      } else {
        pageList[idx] = { ...pageList[idx], [key]: val };
        // Reset value type if operator changes
        if (key === 'operator') pageList[idx].value = val === 'IN' ? [] : '';
      }
      return pageList;
    });
  };

  const removePageFilter = (idx) => {
    setLocalPageFilters(prev => prev.filter((_, i) => i !== idx));
  };

  const updateReportFilter = (idx, key, val) => {
    setLocalReportFilters(prev => {
      const next = [...prev];
      if (idx === -1) {
        next.push({ dimensionId: '', operator: '=', value: '' });
      } else {
        next[idx] = { ...next[idx], [key]: val };
        if (key === 'operator') next[idx].value = val === 'IN' ? [] : '';
      }
      return next;
    });
  };

  const removeReportFilter = (idx) => {
    setLocalReportFilters(prev => prev.filter((_, i) => i !== idx));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-[var(--theme-panel-bg)] border-l t-border shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between p-4 border-b t-border">
        <div className="flex items-center gap-2">
          <Filter size={18} className="t-accent" />
          <div className="flex flex-col">
            <h2 className="text-sm font-black t-text-main uppercase tracking-widest leading-none">Authored Filters</h2>
            <span className="text-[9px] font-bold t-text-muted uppercase tracking-tighter">Report Constraints</span>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
          <X size={18} className="t-text-muted" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8 scrollbar-hide">
        {/* Page Level Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <button 
              onClick={() => setExpandedSections(s => ({ ...s, page: !s.page }))}
              className="flex items-center gap-2 group"
            >
              <Layout size={14} className="t-text-muted transition-colors group-hover:t-accent" />
              <span className="text-[11px] font-black t-text-main uppercase tracking-widest">
                Filters on this Page
              </span>
              {expandedSections.page ? <ChevronDown size={14} className="t-text-muted"/> : <ChevronRight size={14} className="t-text-muted"/>}
            </button>
            <button 
              onClick={() => updatePageFilter(-1)}
              className="text-[10px] font-black t-accent flex items-center gap-1 hover:brightness-110"
            >
              <Plus size={12}/> ADD
            </button>
          </div>

          {expandedSections.page && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-col gap-2.5">
                {localPageFilters.map((f, fi) => (
                  <AuthoredFilterRow 
                    key={fi} 
                    idx={fi} 
                    filter={f} 
                    dimensions={dimensions} 
                    dimValuesCache={dimValuesCache}
                    onChange={updatePageFilter}
                    onRemove={removePageFilter}
                  />
                ))}
                {localPageFilters.length === 0 && (
                  <div className="text-center py-6 border-2 border-dashed t-border rounded-lg text-[10px] t-text-muted uppercase font-black opacity-40">
                    No active page criteria
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Report Level Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <button 
              onClick={() => setExpandedSections(s => ({ ...s, report: !s.report }))}
              className="flex items-center gap-2 group"
            >
              <Database size={14} className="t-text-muted transition-colors group-hover:orange-400" />
              <span className="text-[11px] font-black t-text-main uppercase tracking-widest">
                Filters on all Pages
              </span>
              {expandedSections.report ? <ChevronDown size={14} className="t-text-muted"/> : <ChevronRight size={14} className="t-text-muted"/>}
            </button>
            <button 
              onClick={() => updateReportFilter(-1)}
              className="text-[10px] font-black t-accent flex items-center gap-1 hover:brightness-110"
            >
              <Plus size={12}/> ADD
            </button>
          </div>

          {expandedSections.report && (
            <div className="space-y-3 animate-in fade-in duration-200">
                <div className="flex flex-col gap-2.5">
                {localReportFilters.map((f, fi) => (
                  <AuthoredFilterRow 
                    key={fi} 
                    idx={fi} 
                    filter={f} 
                    dimensions={dimensions} 
                    dimValuesCache={dimValuesCache}
                    onChange={updateReportFilter}
                    onRemove={removeReportFilter}
                  />
                ))}
                {localReportFilters.length === 0 && (
                  <div className="text-center py-6 border-2 border-dashed t-border rounded-lg text-[10px] t-text-muted uppercase font-black opacity-40">
                    No active report criteria
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="p-4 bg-black/5 border-t t-border flex flex-col gap-4">
         <p className="text-[9px] t-text-muted italic leading-tight uppercase font-black tracking-tighter opacity-70">
           Note: Slicers on the dashboard act as top-level interactive filters and are merged with these authored constraints.
         </p>
         <button 
           onClick={() => {
             setPageFilters(p => ({ ...p, [activePageId]: localPageFilters }));
             setAuthoredReportFilters(localReportFilters);
           }}
           className="w-full t-accent-bg text-white py-3 font-bold text-xs shadow-md transition-all hover:scale-105 active:scale-95"
           style={{ borderRadius: 'var(--theme-radius-button)' }}
         >
            Apply Filters
         </button>
      </div>
    </div>
  );
}
