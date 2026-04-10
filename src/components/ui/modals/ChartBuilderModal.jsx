import React from 'react';
import { LayoutTemplate, X, Check, Plus, Trash2, BarChart3, CalendarClock, Filter as FilterIcon } from 'lucide-react';
import { useAppState } from '../../../contexts/AppStateContext';
import { useDataEngine } from '../../../hooks/useDataEngine';
import MultiSelect from '../MultiSelect';

// ─── Helper: single filter row for scope columns ──────────────────────────────
function MatrixFilterRow({ filter, idx, onChange, onRemove, dimensions, dimValuesCache }) {
  const uid = React.useId();
  return (
    <div className="flex gap-2 items-center">
      <select
        className="flex-1 bg-transparent t-border border px-2 py-1 text-xs t-text-main outline-none"
        style={{ borderRadius: 'var(--theme-radius-button)' }}
        value={filter.dimensionId}
        onChange={e => onChange(idx, 'dimensionId', e.target.value)}
      >
        <option value="">Select field...</option>
        {dimensions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      <select
        className="w-20 bg-transparent t-border border px-1 py-1 text-xs t-text-main outline-none"
        style={{ borderRadius: 'var(--theme-radius-button)' }}
        value={filter.operator}
        onChange={e => onChange(idx, 'operator', e.target.value)}
      >
        <option value="=">=</option>
        <option value="!=">≠</option>
        <option value="contains">contains</option>
        <option value="IN">IN</option>
      </select>
      {filter.operator === 'IN' ? (
        <div className="flex-1">
          <MultiSelect
            placeholder="Values"
            options={(dimValuesCache[filter.dimensionId] || []).map(v => ({ value: String(v), label: String(v) }))}
            value={Array.isArray(filter.value) ? filter.value : []}
            onChange={vals => onChange(idx, 'value', vals)}
          />
        </div>
      ) : (
        <div className="flex-1 relative">
          <input
            list={`dl-matrix-${uid}-${idx}`}
            className="w-full bg-transparent t-border border px-2 py-1 text-xs t-text-main outline-none"
            style={{ borderRadius: 'var(--theme-radius-button)' }}
            placeholder="value"
            value={Array.isArray(filter.value) ? '' : (filter.value || '')}
            onChange={e => onChange(idx, 'value', e.target.value)}
          />
          <datalist id={`dl-matrix-${uid}-${idx}`}>
            {(dimValuesCache[filter.dimensionId] || []).map(opt => <option key={opt} value={opt}/>)}
          </datalist>
        </div>
      )}
      <button onClick={() => onRemove(idx)} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={12}/></button>
    </div>
  );
}

// ─── Helper: scope column card ─────────────────────────────────────────────────
function ScopeColumnCard({ col, idx, onChange, onRemove, dimensions, dateDims, dimValuesCache }) {
  const [expanded, setExpanded] = React.useState(true);
  const update = (key, val) => onChange(idx, { ...col, [key]: val });
  const addFilter = () => update('filters', [...(col.filters||[]), { dimensionId: '', operator: '=', value: '' }]);
  const updateFilter = (fi, key, val) => {
    const updated = col.filters.map((f,i) => i===fi ? {...f,[key]:val} : f);
    // Reset value when dimension changes
    if (key === 'dimensionId') update('filters', updated.map((f,i) => i===fi ? {...f, value: ['IN'].includes(f.operator) ? [] : ''} : f));
    else update('filters', updated);
  };
  const removeFilter = (fi) => update('filters', col.filters.filter((_,i) => i!==fi));

  return (
    <div className="border t-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-black/5 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-2">
          <FilterIcon size={12} className="t-accent"/>
          <input
            className="bg-transparent font-bold text-xs t-text-main outline-none w-36"
            value={col.label}
            onChange={e => { e.stopPropagation(); update('label', e.target.value); }}
            onClick={e => e.stopPropagation()}
            placeholder="Column label..."
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase font-black bg-[var(--theme-accent)]/10 text-[var(--theme-accent)] px-2 py-0.5 rounded-full">Scope</span>
          <button onClick={e => { e.stopPropagation(); onRemove(idx); }} className="text-red-400 hover:text-red-600"><X size={12}/></button>
        </div>
      </div>
      {expanded && (
        <div className="px-3 py-3 flex flex-col gap-3">
          {/* Filters */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-black t-text-muted uppercase tracking-wider">Filter Context</span>
              <button onClick={addFilter} className="text-[9px] t-accent font-bold flex items-center gap-1"><Plus size={10}/> Add Filter</button>
            </div>
            <div className="flex flex-col gap-1.5">
              {(col.filters||[]).map((f,fi) => (
                <MatrixFilterRow key={fi} filter={f} idx={fi} onChange={updateFilter} onRemove={removeFilter} dimensions={dimensions} dimValuesCache={dimValuesCache}/>
              ))}
              {(col.filters||[]).length === 0 && <span className="text-[10px] t-text-muted italic">No filters — applies to entire dataset</span>}
            </div>
            {(col.filters||[]).length > 1 && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[9px] t-text-muted">Logic:</span>
                {['AND','OR'].map(op => (
                  <button key={op} onClick={() => update('filterLogic', op)}
                    className={`text-[9px] font-black px-2 py-0.5 border rounded ${col.filterLogic===op ? 't-accent-bg text-white border-transparent' : 't-border t-text-muted'}`}>{op}</button>
                ))}
              </div>
            )}
          </div>
          {/* Time Intelligence */}
          <div className="border-t t-border pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-black t-text-muted uppercase tracking-wider flex items-center gap-1"><CalendarClock size={10}/> Time Intelligence</span>
              <input type="checkbox" checked={col.timeConfig?.enabled||false}
                onChange={e => update('timeConfig', { ...(col.timeConfig||{}), enabled: e.target.checked, dateDimensionId: col.timeConfig?.dateDimensionId||'', period: col.timeConfig?.period||'MTD' })}
                className="w-3 h-3 accent-[var(--theme-accent)]"
              />
            </div>
            {col.timeConfig?.enabled && (
              <div className="flex gap-2">
                <select className="flex-1 bg-transparent t-border border px-2 py-1 text-xs t-text-main outline-none" style={{ borderRadius: 'var(--theme-radius-button)' }}
                  value={col.timeConfig?.dateDimensionId||''} onChange={e => update('timeConfig', { ...col.timeConfig, dateDimensionId: e.target.value })}>
                  <option value="">Date column...</option>
                  {dateDims.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                {dateDims.length === 0 && <span className="text-[10px] text-red-500 ml-1">No date columns in Dictionary!</span>}
                <select className="w-28 bg-transparent t-border border px-2 py-1 text-xs font-bold t-text-main outline-none" style={{ borderRadius: 'var(--theme-radius-button)' }}
                  value={col.timeConfig?.period||'MTD'} onChange={e => update('timeConfig', { ...col.timeConfig, period: e.target.value })}>
                  <option value="MTD">MTD</option>
                  <option value="YTD">YTD</option>
                  <option value="LYYTD">LY-YTD</option>
                  <option value="LY">Last Year</option>
                  <option value="DYTD">Dynamic YTD</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper: variance column card ─────────────────────────────────────────────
function VarianceColumnCard({ col, idx, onChange, onRemove, scopeCols }) {
  const update = (key, val) => onChange(idx, { ...col, [key]: val });
  return (
    <div className="border t-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-black/5">
        <div className="flex items-center gap-2">
          <BarChart3 size={12} className="text-purple-500"/>
          <input
            className="bg-transparent font-bold text-xs t-text-main outline-none w-36"
            value={col.label}
            onChange={e => update('label', e.target.value)}
            placeholder="Variance label..."
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase font-black bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">Variance</span>
          <button onClick={() => onRemove(idx)} className="text-red-400 hover:text-red-600"><X size={12}/></button>
        </div>
      </div>
      <div className="px-3 py-3 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] t-text-muted uppercase font-black mb-1 block">Column A</label>
            <select className="w-full bg-transparent t-border border px-2 py-1 text-xs t-text-main outline-none" style={{ borderRadius: 'var(--theme-radius-button)' }}
              value={col.colAId||''} onChange={e => update('colAId', e.target.value)}>
              <option value="">Select column...</option>
              {scopeCols.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] t-text-muted uppercase font-black mb-1 block">Column B</label>
            <select className="w-full bg-transparent t-border border px-2 py-1 text-xs t-text-main outline-none" style={{ borderRadius: 'var(--theme-radius-button)' }}
              value={col.colBId||''} onChange={e => update('colBId', e.target.value)}>
              <option value="">Select column...</option>
              {scopeCols.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[9px] font-black t-text-muted uppercase">Variance Type:</span>
          {['#','%'].map(mode => (
            <button key={mode} onClick={() => update('varianceMode', mode)}
              className={`text-xs font-black px-3 py-1 border rounded transition-all ${
                col.varianceMode === mode ? 't-accent-bg text-white border-transparent' : 't-border t-text-muted hover:t-text-main'
              }`} style={{ borderRadius: 'var(--theme-radius-button)' }}>
              {mode === '#' ? '# Absolute' : '% Change'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChartBuilderModal() {
  const {
    showBuilder, setShowBuilder,
    activeDatasetId, activeDataset,
    datasets, semanticModels,
    builderForm, setBuilderForm, initBuilderForm,
    activePageId, setDashboards,
    showToast,
    mergedSemanticModel, isUnified, joinGroupIds
  } = useAppState();

  const { globalSemanticFields, getUniqueValuesForDim } = useDataEngine();

  // Memoize filtered fields
  const dimensions = React.useMemo(() => globalSemanticFields.filter(f => f.type === 'dimension' && !f.isHidden), [globalSemanticFields]);
  const measures = React.useMemo(() => globalSemanticFields.filter(f => f.type === 'measure' && !f.isHidden), [globalSemanticFields]);
  // Only fields marked as format==='date' in the semantic dictionary go into the date dropdown
  const dateDims = React.useMemo(() => globalSemanticFields.filter(f => f.format === 'date' && !f.isHidden), [globalSemanticFields]);

  // Distinct values cache for matrix filter rows (same pattern as MeasureBuilderModal)
  const [dimValuesCache, setDimValuesCache] = React.useState({});
  const fetchingDims = React.useRef(new Set());

  // Collect all dimensionId values currently used across all filters (matrix + top-level)
  const activeDimIds = React.useMemo(() => {
    const ids = new Set();
    (builderForm.matrixColumns || []).forEach(col => {
      if (col.type === 'scope') (col.filters || []).forEach(f => { if (f.dimensionId) ids.add(f.dimensionId); });
    });
    (builderForm.filters || []).forEach(f => { if (f.dimensionId) ids.add(f.dimensionId); });
    return Array.from(ids);
  }, [builderForm.matrixColumns, builderForm.filters]);

  // Auto-fetch distinct values for any newly selected dimension
  React.useEffect(() => {
    const toFetch = activeDimIds.filter(id => !dimValuesCache[id] && !fetchingDims.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach(async (dimId) => {
      fetchingDims.current.add(dimId);
      const field = (mergedSemanticModel || []).find(m => m.id === dimId);
      const targetDsId = field?.originDatasetId || activeDatasetId;
      try {
        const values = await getUniqueValuesForDim(targetDsId, dimId);
        setDimValuesCache(prev => ({ ...prev, [dimId]: values || [] }));
      } catch (err) {
        console.error('[Builder] Failed to fetch values for', dimId, err);
      } finally {
        fetchingDims.current.delete(dimId);
      }
    });
  }, [activeDimIds, activeDatasetId, getUniqueValuesForDim, mergedSemanticModel, dimValuesCache]);

  // Optimization: Use local state for title to ensure typing is silky smooth
  const [localTitle, setLocalTitle] = React.useState(builderForm.title || '');
  
  // Sync local title when builderForm changes (e.g. when opening modal for a new chart)
  React.useEffect(() => {
    setLocalTitle(builderForm.title || '');
  }, [builderForm.id]);

  const handleTitleChange = (val) => {
    setLocalTitle(val);
    setBuilderForm(prev => ({ ...prev, title: val }));
  };

  if (!showBuilder || !activeDataset) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto">
      <div className="t-panel p-6 shadow-xl w-full max-w-3xl t-border border my-auto relative">
        <button onClick={() => setShowBuilder(false)} className="absolute top-4 right-4 p-2 hover:bg-black/5 rounded-full">
          <X size={20} className="t-text-muted"/>
        </button>
        <h3 className="text-lg font-bold t-text-main mb-6 flex items-center gap-2">
           <LayoutTemplate className="t-accent" size={20}/> 
           {builderForm.id ? 'Edit Visual' : 'Build Custom Visual'}
        </h3>

        <div className="grid grid-cols-2 gap-6 mb-6">
           <div>
              <label className="text-[10px] font-black t-text-muted uppercase tracking-widest mb-2 block">Chart Title</label>
              <input 
                value={localTitle} 
                onChange={e => handleTitleChange(e.target.value)} 
                className="w-full bg-black/5 t-border border px-4 py-3 text-sm font-bold t-text-main focus:ring-2 focus:ring-[var(--theme-accent)]/30 transition-all outline-none" 
                placeholder="e.g. Sales by Region" 
                style={{ borderRadius: 'var(--theme-radius-button)' }}
              />
           </div>
           <div>
              <label className="text-[10px] font-black t-text-muted uppercase tracking-widest mb-2 block">Visual Representation</label>
              <select 
                value={builderForm.type} 
                onChange={e => setBuilderForm({...builderForm, type: e.target.value})} 
                className="w-full bg-black/5 t-border border px-4 py-3 text-sm font-bold t-text-main focus:ring-2 focus:ring-[var(--theme-accent)]/30 transition-all outline-none"
                style={{ borderRadius: 'var(--theme-radius-button)' }}
              >
                 <option value="table">Data Table</option>
                 <option value="bar">Bar Chart</option>
                 <option value="line">Line Chart</option>
                 <option value="pie">Pie Chart</option>
                 <option value="scatter">Scatter Plot</option>
                 <option value="pivot">Pivot Table</option>
                 <option value="matrix">KPI Matrix</option>
                 <option value="treemap">Treemap</option>
                  <option value="sunburst">Sunburst Chart</option>
              </select>
           </div>
        </div>

        {/* Conditional Fields based on Type */}
        {builderForm.type === 'table' && (
           <div className="flex flex-col gap-4 mb-4">
               <div className="grid grid-cols-2 gap-4">
                  <div>
                     <label className="text-xs font-bold t-text-muted uppercase tracking-wide mb-1 block">Dimensions</label>
                     <MultiSelect
                        placeholder="Dimensions"
                        options={dimensions}
                        value={builderForm.tableDimensions || []}
                        onChange={vals => setBuilderForm({...builderForm, tableDimensions: vals})}
                     />
                  </div>
                  <div>
                     <label className="text-xs font-bold t-text-muted uppercase tracking-wide mb-1 block">Measures</label>
                     <MultiSelect
                        placeholder="Measures"
                        options={measures}
                        value={builderForm.tableMeasures || []}
                        onChange={vals => setBuilderForm({...builderForm, tableMeasures: vals})}
                     />
                  </div>
               </div>
               <div className="flex items-center gap-6 bg-black/5 p-3 rounded-lg border t-border mt-2">
                   <div className="flex items-center gap-4">
                       <label className="flex items-center gap-2 text-xs font-bold t-text-main cursor-pointer">
                          <input type="checkbox" checked={builderForm.showColTotals} onChange={e => setBuilderForm({...builderForm, showColTotals: e.target.checked})} className="w-3 h-3 accent-[var(--theme-accent)]" />
                          Show Totals
                       </label>
                       {builderForm.showColTotals && (
                           <select value={builderForm.colTotalPosition} onChange={e => setBuilderForm({...builderForm, colTotalPosition: e.target.value})} className="t-panel border t-border px-2 py-1 text-xs font-medium focus:outline-none rounded">
                              <option value="bottom">At Bottom</option>
                              <option value="top">At Top</option>
                           </select>
                       )}
                   </div>
                   {builderForm.showColTotals && (
                       <div className="flex items-center gap-2 border-l t-border pl-4">
                           <label className="text-[10px] font-black t-text-muted uppercase tracking-widest">Logic:</label>
                           <select value={builderForm.totalMode} onChange={e => setBuilderForm({...builderForm, totalMode: e.target.value})} className="t-panel border t-border px-2 py-1 text-xs font-bold focus:outline-none rounded">
                              <option value="calculated">Calculated (Default)</option>
                              <option value="sum">Sum of Rows</option>
                           </select>
                       </div>
                   )}
               </div>
           </div>
        )}

        {builderForm.type !== 'pivot' && builderForm.type !== 'scatter' && builderForm.type !== 'table' && builderForm.type !== 'matrix' && builderForm.type !== 'treemap' && builderForm.type !== 'sunburst' && (
           <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                 <label className="text-[10px] font-black t-text-muted uppercase tracking-widest mb-2 block">X-Axis (Dimension)</label>
                 <select value={builderForm.dimension} onChange={e => setBuilderForm({...builderForm, dimension: e.target.value})} className="w-full t-panel t-border border px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-[var(--theme-accent)]/30 transition-all outline-none" style={{ borderRadius: 'var(--theme-radius-button)' }}>
                    <option value="">Select Dimension...</option>
                    {dimensions.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                 </select>
              </div>
              <div>
                 <label className="text-[10px] font-black t-text-muted uppercase tracking-widest mb-2 block">Y-Axis (Measure)</label>
                 <select value={builderForm.measure} onChange={e => setBuilderForm({...builderForm, measure: e.target.value})} className="w-full t-panel t-border border px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-[var(--theme-accent)]/30 transition-all outline-none" style={{ borderRadius: 'var(--theme-radius-button)' }}>
                    <option value="">Select Measure...</option>
                    {measures.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                 </select>
              </div>
              <div className="col-span-2">
                 <label className="text-[10px] font-black t-text-muted uppercase tracking-widest mb-2 block">Legend (Optional Breakdown)</label>
                 <select value={builderForm.legend} onChange={e => setBuilderForm({...builderForm, legend: e.target.value})} className="w-full t-panel t-border border px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-[var(--theme-accent)]/30 transition-all outline-none" style={{ borderRadius: 'var(--theme-radius-button)' }}>
                    <option value="">None</option>
                    {dimensions.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                 </select>
              </div>
           </div>
        )}

        {builderForm.type === 'scatter' && (
           <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                 <label className="text-xs font-bold t-text-muted uppercase tracking-wide mb-1 block">Detail (Dimension)</label>
                 <select value={builderForm.dimension} onChange={e => setBuilderForm({...builderForm, dimension: e.target.value})} className="w-full t-panel t-border border px-3 py-2 text-sm font-medium focus:outline-none">
                    <option value="">Select Dimension...</option>
                    {dimensions.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                 </select>
              </div>
              <div>
                 <label className="text-xs font-bold t-text-muted uppercase tracking-wide mb-1 block">X-Axis (Measure)</label>
                 <select value={builderForm.xMeasure} onChange={e => setBuilderForm({...builderForm, xMeasure: e.target.value})} className="w-full t-panel t-border border px-3 py-2 text-sm font-medium focus:outline-none">
                    <option value="">Select Measure...</option>
                    {measures.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                 </select>
              </div>
              <div>
                 <label className="text-xs font-bold t-text-muted uppercase tracking-wide mb-1 block">Y-Axis (Measure)</label>
                 <select value={builderForm.yMeasure} onChange={e => setBuilderForm({...builderForm, yMeasure: e.target.value})} className="w-full t-panel t-border border px-3 py-2 text-sm font-medium focus:outline-none">
                    <option value="">Select Measure...</option>
                    {measures.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                 </select>
              </div>
              <div>
                 <label className="text-xs font-bold t-text-muted uppercase tracking-wide mb-1 block">Size (Measure, Optional)</label>
                 <select value={builderForm.sizeMeasure} onChange={e => setBuilderForm({...builderForm, sizeMeasure: e.target.value})} className="w-full t-panel t-border border px-3 py-2 text-sm font-medium focus:outline-none">
                    <option value="">None</option>
                    {measures.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                 </select>
              </div>
           </div>
        )}

        {builderForm.type === 'pivot' && (
            <div className="grid grid-cols-1 gap-4 mb-4">
                <p className="text-xs t-text-muted">Pivot tables require at least one row and one measure.</p>
                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="text-xs font-bold t-text-muted uppercase tracking-wide mb-1 block">Rows (Dimensions)</label>
                      <MultiSelect
                         placeholder="Rows"
                         options={dimensions}
                         value={builderForm.pivotRows}
                         onChange={vals => setBuilderForm({...builderForm, pivotRows: vals})}
                      />
                   </div>
                   <div>
                      <label className="text-xs font-bold t-text-muted uppercase tracking-wide mb-1 block">Columns (Dimensions)</label>
                      <MultiSelect
                         placeholder="Columns"
                         options={dimensions}
                         value={builderForm.pivotCols}
                         onChange={vals => setBuilderForm({...builderForm, pivotCols: vals})}
                      />
                   </div>
                   <div className="col-span-2">
                      <label className="text-xs font-bold t-text-muted uppercase tracking-wide mb-1 block">Values (Measures)</label>
                       <MultiSelect
                         placeholder="Measures"
                         options={measures}
                         value={builderForm.pivotMeasures}
                         onChange={vals => setBuilderForm({...builderForm, pivotMeasures: vals})}
                      />
                   </div>
                   <div className="col-span-2 flex flex-col gap-3 bg-black/5 p-3 rounded-lg border t-border mt-2">
                       <div className="flex items-center justify-between border-b t-border pb-2 mb-1">
                           <label className="text-[10px] font-black t-text-muted uppercase tracking-widest">Grand Totals Configuration</label>
                           {(builderForm.showColTotals || builderForm.showRowTotals) && (
                               <div className="flex items-center gap-2">
                                   <label className="text-[10px] font-black t-text-muted uppercase tracking-widest">Aggregation Logic:</label>
                                   <select value={builderForm.totalMode} onChange={e => setBuilderForm({...builderForm, totalMode: e.target.value})} className="t-panel border t-border px-2 py-1 text-[10px] font-bold focus:outline-none rounded">
                                      <option value="calculated">Calculated (Default)</option>
                                      <option value="sum">Sum of Rows</option>
                                   </select>
                               </div>
                           )}
                       </div>
                       <div className="flex gap-6">
                           <div className="flex items-center gap-3">
                               <label className="flex items-center gap-2 text-xs font-bold t-text-main cursor-pointer">
                                  <input type="checkbox" checked={builderForm.showColTotals} onChange={e => setBuilderForm({...builderForm, showColTotals: e.target.checked})} className="w-3 h-3 accent-[var(--theme-accent)]" />
                                  Column Totals
                               </label>
                               {builderForm.showColTotals && (
                                   <select value={builderForm.colTotalPosition} onChange={e => setBuilderForm({...builderForm, colTotalPosition: e.target.value})} className="t-panel border t-border px-2 py-1 text-xs font-medium focus:outline-none rounded">
                                      <option value="bottom">Bottom</option>
                                      <option value="top">Top</option>
                                   </select>
                               )}
                           </div>
                           <div className="flex items-center gap-3">
                               <label className="flex items-center gap-2 text-xs font-bold t-text-main cursor-pointer">
                                  <input type="checkbox" checked={builderForm.showRowTotals} onChange={e => setBuilderForm({...builderForm, showRowTotals: e.target.checked})} className="w-3 h-3 accent-[var(--theme-accent)]" />
                                  Row Totals
                               </label>
                               {builderForm.showRowTotals && (
                                   <select value={builderForm.rowTotalPosition} onChange={e => setBuilderForm({...builderForm, rowTotalPosition: e.target.value})} className="t-panel border t-border px-2 py-1 text-xs font-medium focus:outline-none rounded">
                                      <option value="end">End (Right)</option>
                                      <option value="start">Start (Left)</option>
                                   </select>
                               )}
                           </div>
                       </div>
                   </div>
                </div>
            </div>
        )}

        {(builderForm.type === 'treemap' || builderForm.type === 'sunburst') && (
           <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                 <label className="text-[10px] font-black t-text-muted uppercase tracking-widest mb-2 block">Hierarchy Dimensions (Order matters)</label>
                 <MultiSelect
                    placeholder="Select Dimensions"
                    options={dimensions}
                    value={builderForm.treeDimensions || []}
                    onChange={vals => setBuilderForm({...builderForm, treeDimensions: vals})}
                 />
              </div>
              <div>
                 <label className="text-[10px] font-black t-text-muted uppercase tracking-widest mb-2 block">Size (Measure)</label>
                 <select value={builderForm.measure} onChange={e => setBuilderForm({...builderForm, measure: e.target.value})} className="w-full t-panel t-border border px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-[var(--theme-accent)]/30 transition-all outline-none" style={{ borderRadius: 'var(--theme-radius-button)' }}>
                    <option value="">Select Measure...</option>
                    {measures.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                 </select>
              </div>
           </div>
        )}

        {/* ── KPI Matrix Builder ─────────────────────────────────────────── */}
        {builderForm.type === 'matrix' && (() => {
          const matrixCols = builderForm.matrixColumns || [];
          const scopeCols = matrixCols.filter(c => c.type === 'scope');
          const updateCol = (idx, updated) => setBuilderForm(prev => ({ ...prev, matrixColumns: prev.matrixColumns.map((c,i) => i===idx ? updated : c) }));
          const removeCol = (idx) => setBuilderForm(prev => ({ ...prev, matrixColumns: prev.matrixColumns.filter((_,i) => i!==idx) }));
          const addScope = () => setBuilderForm(prev => ({
            ...prev,
            matrixColumns: [...(prev.matrixColumns||[]), {
              id: `col_${Date.now()}`, label: `Column ${(prev.matrixColumns||[]).length + 1}`,
              type: 'scope', filters: [], filterLogic: 'AND',
              timeConfig: { enabled: false, dateDimensionId: '', period: 'MTD' }
            }]
          }));
          const addVariance = () => setBuilderForm(prev => ({
            ...prev,
            matrixColumns: [...(prev.matrixColumns||[]), {
              id: `var_${Date.now()}`, label: 'Variance', type: 'variance',
              colAId: '', colBId: '', varianceMode: '%'
            }]
          }));

          return (
            <div className="mb-6">
              {/* Base Measures */}
              <div className="mb-5">
                <label className="text-[10px] font-black t-text-muted uppercase tracking-widest mb-2 block">Base Measures (Rows)</label>
                <MultiSelect
                  placeholder="Select measures to display as rows..."
                  options={measures}
                  value={builderForm.matrixMeasures || []}
                  onChange={vals => setBuilderForm(prev => ({...prev, matrixMeasures: vals}))}
                />
                <p className="text-[10px] t-text-muted mt-1.5 italic">Measures will be grouped by their Category from the Data Dictionary.</p>
              </div>

              {/* Column Builder */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[10px] font-black t-text-muted uppercase tracking-widest">Visual Columns (Contexts)</label>
                  <div className="flex gap-2">
                    <button onClick={addScope} className="flex items-center gap-1 t-button px-2 py-1 text-[10px] font-bold"
                      style={{ borderRadius: 'var(--theme-radius-button)' }}>
                      <Plus size={10}/> Scope Column
                    </button>
                    <button onClick={addVariance} className="flex items-center gap-1 bg-purple-100 text-purple-700 border border-purple-200 px-2 py-1 text-[10px] font-bold"
                      style={{ borderRadius: 'var(--theme-radius-button)' }}>
                      <Plus size={10}/> Variance Column
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  {matrixCols.map((col, idx) => (
                    col.type === 'scope'
                      ? <ScopeColumnCard key={col.id} col={col} idx={idx} onChange={updateCol} onRemove={removeCol} dimensions={dimensions} dateDims={dateDims} dimValuesCache={dimValuesCache}/>
                      : <VarianceColumnCard key={col.id} col={col} idx={idx} onChange={updateCol} onRemove={removeCol} scopeCols={scopeCols}/>
                  ))}
                  {matrixCols.length === 0 && (
                    <div className="text-center py-6 t-text-muted text-xs border-2 border-dashed t-border rounded-lg">
                      Add Scope Columns to define what time period or filter context each column represents.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Visual Level filters (Authored) ── */}
        <div className="mt-8 border-t t-border pt-6 mb-6">
           <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-black t-text-muted uppercase tracking-widest flex items-center gap-1.5"><FilterIcon size={12}/> Visual Level Filters</span>
                <p className="text-[10px] t-text-muted italic opacity-60">Static filters that apply only to this specific visual.</p>
              </div>
              <button 
                onClick={() => setBuilderForm(prev => ({ ...prev, filters: [...(prev.filters || []), { dimensionId: '', operator: '=', value: '' }] }))}
                className="text-[10px] font-black t-accent flex items-center gap-1 hover:brightness-110 transition-all uppercase tracking-wider"
              >
                <Plus size={12}/> Add Criteria
              </button>
           </div>
           
           <div className="flex flex-col gap-2.5">
              {(builderForm.filters || []).map((f, fi) => (
                <MatrixFilterRow 
                  key={fi} 
                  filter={f} 
                  idx={fi} 
                  dimensions={dimensions} 
                  dimValuesCache={dimValuesCache}
                  onChange={(idx, key, val) => {
                      const next = (builderForm.filters || []).map((v, i) => i === idx ? { ...v, [key]: val } : v);
                      // Reset value when dimension changes
                      if (key === 'dimensionId') {
                        setBuilderForm({ ...builderForm, filters: next.map((v, i) => i === idx ? { ...v, value: v.operator === 'IN' ? [] : '' } : v) });
                      } else {
                        setBuilderForm({ ...builderForm, filters: next });
                      }
                  }} 
                  onRemove={(idx) => setBuilderForm({ ...builderForm, filters: (builderForm.filters || []).filter((_, i) => i !== idx) })} 
                />
              ))}
              {(builderForm.filters || []).length === 0 && (
                <div className="text-center py-4 border-2 border-dashed t-border rounded-lg text-[10px] t-text-muted opacity-50 uppercase tracking-widest font-black">
                    No active visual criteria
                </div>
              )}
           </div>

           {(builderForm.filters || []).length > 1 && (
             <div className="mt-3 flex items-center gap-3 bg-black/5 p-2 rounded-lg border t-border">
                <span className="text-[10px] font-black t-text-muted uppercase tracking-widest">Filter Logic:</span>
                <div className="flex gap-1.5">
                  {['AND', 'OR'].map(op => (
                    <button 
                      key={op}
                      onClick={() => setBuilderForm({ ...builderForm, filterLogic: op })}
                      className={`px-3 py-1 text-[10px] font-black rounded border transition-all ${builderForm.filterLogic === op ? 't-accent-bg text-white border-transparent shadow-sm' : 't-panel t-text-muted t-border hover:t-text-main'}`}
                    >
                      {op}
                    </button>
                  ))}
                </div>
             </div>
           )}
        </div>

        <div className="flex gap-6 mt-6 pt-4 border-t t-border items-center">
           <div className="flex flex-col gap-1.5">
               <label className="text-xs font-bold t-text-muted uppercase tracking-wide">Chart Width</label>
               <select 
                   value={builderForm.size || 'half'} 
                   onChange={e => setBuilderForm({...builderForm, size: e.target.value})}
                   className="t-panel border t-border px-3 py-1.5 text-sm font-bold focus:outline-none"
                   style={{ borderRadius: 'var(--theme-radius-button)' }}
               >
                   <option value="third">Third Width</option>
                   <option value="half">Half Width</option>
                   <option value="full">Full Width</option>
               </select>
           </div>
           
           <div className="flex flex-wrap gap-5 mt-5">
              <label className="flex items-center gap-2 text-sm font-bold t-text-main cursor-pointer">
                 <input type="checkbox" checked={builderForm.showDataLabels} onChange={e => setBuilderForm({...builderForm, showDataLabels: e.target.checked})} className="w-4 h-4 accent-[var(--theme-accent)]" />
                 Show Data Labels
              </label>
              <label className="flex items-center gap-2 text-sm font-bold t-text-main cursor-pointer">
                 <input type="checkbox" checked={builderForm.showXAxisLabels !== false} onChange={e => setBuilderForm({...builderForm, showXAxisLabels: e.target.checked})} className="w-4 h-4 accent-[var(--theme-accent)]" />
                 X-Axis Labels
              </label>
              <label className="flex items-center gap-2 text-sm font-bold t-text-main cursor-pointer">
                 <input type="checkbox" checked={builderForm.showYAxisLabels !== false} onChange={e => setBuilderForm({...builderForm, showYAxisLabels: e.target.checked})} className="w-4 h-4 accent-[var(--theme-accent)]" />
                 Y-Axis Labels
              </label>
           </div>
        </div>

        <button onClick={() => {
            // Validation
            if (!builderForm.title.trim()) return showToast('Please provide a title');
            if (builderForm.type === 'table' && ((builderForm.tableDimensions || []).length === 0 && (builderForm.tableMeasures || []).length === 0)) return showToast('Table needs at least 1 column');
            if (builderForm.type === 'pivot' && (builderForm.pivotRows.length === 0 || builderForm.pivotMeasures.length === 0)) return showToast('Pivot needs at least 1 Row and 1 Measure');
            if (builderForm.type === 'scatter' && (!builderForm.dimension || !builderForm.xMeasure || !builderForm.yMeasure)) return showToast('Scatter needs Detail, X-Axis, and Y-Axis');
            if (['bar', 'line', 'pie'].includes(builderForm.type) && (!builderForm.dimension || !builderForm.measure)) return showToast('Please select Dimension and Measure');
            if (builderForm.type === 'sunburst' && ((builderForm.treeDimensions || []).length === 0 || !builderForm.measure)) return showToast('Sunburst needs Hierarchy Dimensions and a Measure');
            if (builderForm.type === 'matrix' && (builderForm.matrixMeasures||[]).length === 0) return showToast('KPI Matrix needs at least 1 measure');
            if (builderForm.type === 'matrix' && (builderForm.matrixColumns||[]).filter(c=>c.type==='scope').length === 0) return showToast('KPI Matrix needs at least 1 Scope Column');

            // Gather all required fields to find the correct joined dataset
            const originsToCheck = [
                builderForm.dimension, builderForm.measure, builderForm.legend,
                builderForm.xMeasure, builderForm.yMeasure, builderForm.colorMeasure, builderForm.sizeMeasure,
                ...(builderForm.pivotRows || []), ...(builderForm.pivotCols || []), ...(builderForm.pivotMeasures || []),
                ...(builderForm.tableDimensions || []), ...(builderForm.tableMeasures || [])
            ].filter(Boolean);

            const requiredOrigins = originsToCheck.filter(o => o && o.includes('::'));
            let bestDsId = activeDatasetId;
           
            if (requiredOrigins.length > 0) {
                if (!isUnified) {
                    return showToast('Cannot combine these fields! Please ensure their tables are joined in Relationships.');
                }
                // In unified mode, the primary dataset is the join root
                bestDsId = activeDatasetId;
            }

            // Extract local IDs based on the validated dataset
            const mapIdToLocal = (origStr) => {
               if (!origStr) return '';
               if (!origStr.includes('::')) return origStr;
               const [oDsId, oFId] = origStr.split('::');
               return oFId;
            };

            const newChart = {
                ...builderForm,
                datasetId: bestDsId,
                id: builderForm.id || Date.now().toString() + "_manual",
                dimension: mapIdToLocal(builderForm.dimension),
                measure: mapIdToLocal(builderForm.measure),
                legend: mapIdToLocal(builderForm.legend),
                xMeasure: mapIdToLocal(builderForm.xMeasure),
                yMeasure: mapIdToLocal(builderForm.yMeasure),
                colorMeasure: mapIdToLocal(builderForm.colorMeasure),
                sizeMeasure: mapIdToLocal(builderForm.sizeMeasure),
                pivotRows: builderForm.pivotRows.map(mapIdToLocal).filter(Boolean),
                pivotCols: builderForm.pivotCols.map(mapIdToLocal).filter(Boolean),
                pivotMeasures: builderForm.pivotMeasures.map(mapIdToLocal).filter(Boolean),
                tableDimensions: (builderForm.tableDimensions || []).map(mapIdToLocal).filter(Boolean),
                tableMeasures: (builderForm.tableMeasures || []).map(mapIdToLocal).filter(Boolean),
                treeDimensions: (builderForm.treeDimensions || []).map(mapIdToLocal).filter(Boolean)
            };

            setDashboards(prev => {
                const currentList = prev[activePageId] || [];
                if (builderForm.id) {
                    return { ...prev, [activePageId]: currentList.map(c => c.id === builderForm.id ? newChart : c) };
                } else {
                    return { ...prev, [activePageId]: [...currentList, newChart] };
                }
            });
           
            setShowBuilder(false);
            showToast(builderForm.id ? "Visual updated!" : "Visual added!");

        }} className="mt-6 t-accent-bg w-full py-3 font-bold shadow-lg text-lg flex justify-center items-center gap-2" style={{ borderRadius: 'var(--theme-radius-button)' }}>
            <Check size={20}/> {builderForm.id ? 'Save Changes' : 'Add Visual'}
        </button>
      </div>
    </div>
  );
}
