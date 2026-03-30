import React from 'react';
import { LayoutTemplate, X, Check } from 'lucide-react';
import { useAppState } from '../../../contexts/AppStateContext';
import { useDataEngine } from '../../../hooks/useDataEngine';
import MultiSelect from '../MultiSelect';

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

  const { globalSemanticFields } = useDataEngine();

  // Optimization: Memoize filtered fields so we don't recalculate on every keystroke
  const dimensions = React.useMemo(() => globalSemanticFields.filter(f => f.type === 'dimension' && !f.isHidden), [globalSemanticFields]);
  const measures = React.useMemo(() => globalSemanticFields.filter(f => f.type === 'measure' && !f.isHidden), [globalSemanticFields]);

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
              </select>
           </div>
        </div>

        {/* Conditional Fields based on Type */}
        {builderForm.type === 'table' && (
           <div className="grid grid-cols-2 gap-4 mb-4">
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
        )}

        {builderForm.type !== 'pivot' && builderForm.type !== 'scatter' && builderForm.type !== 'table' && (
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
                </div>
            </div>
        )}

        <div className="flex gap-4 mt-6 pt-4 border-t t-border">
           <label className="flex items-center gap-2 text-sm font-bold t-text-main cursor-pointer">
              <input type="checkbox" checked={builderForm.size === 'full'} onChange={e => setBuilderForm({...builderForm, size: e.target.checked ? 'full' : 'half'})} className="w-4 h-4 accent-[var(--theme-accent)]" />
              Full Width
           </label>
           <label className="flex items-center gap-2 text-sm font-bold t-text-main cursor-pointer">
              <input type="checkbox" checked={builderForm.showDataLabels} onChange={e => setBuilderForm({...builderForm, showDataLabels: e.target.checked})} className="w-4 h-4 accent-[var(--theme-accent)]" />
              Show Data Labels
           </label>
        </div>

        <button onClick={() => {
            // Validation
            if (!builderForm.title.trim()) return showToast('Please provide a title');
            if (builderForm.type === 'table' && ((builderForm.tableDimensions || []).length === 0 && (builderForm.tableMeasures || []).length === 0)) return showToast('Table needs at least 1 column');
            if (builderForm.type === 'pivot' && (builderForm.pivotRows.length === 0 || builderForm.pivotMeasures.length === 0)) return showToast('Pivot needs at least 1 Row and 1 Measure');
            if (builderForm.type === 'scatter' && (!builderForm.dimension || !builderForm.xMeasure || !builderForm.yMeasure)) return showToast('Scatter needs Detail, X-Axis, and Y-Axis');
            if (['bar', 'line', 'pie'].includes(builderForm.type) && (!builderForm.dimension || !builderForm.measure)) return showToast('Please select Dimension and Measure');

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
                tableMeasures: (builderForm.tableMeasures || []).map(mapIdToLocal).filter(Boolean)
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
