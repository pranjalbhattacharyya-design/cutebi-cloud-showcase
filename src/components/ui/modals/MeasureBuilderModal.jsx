import React from 'react';
import { Calculator, Hash, Filter as FilterIcon, CalendarClock, Search, Plus, Trash2, X, Check } from 'lucide-react';
import { useAppState } from '../../../contexts/AppStateContext';
import { syncSemanticModels } from '../../../utils/semanticSync';
import MultiSelect from '../MultiSelect';

export default function MeasureBuilderModal({ getUniqueValuesForDim }) {
  const {
    showMeasureBuilder, setShowMeasureBuilder,
    activeDatasetId, activeDataset,
    semanticModels, setSemanticModels, relationships,
    measureTab, setMeasureTab,
    mLabel, setMLabel, mFormat, setMFormat,
    formulaText, setFormulaText,
    cFilters, setCFilters,
    cFilterLogic, setCFilterLogic,
    cTime, setCTime,
    editingMeasureId, setEditingMeasureId,
    measureSearch, setMeasureSearch,
    showToast, activeSemanticModel,
    mergedSemanticModel, isUnified
  } = useAppState();

  // Optimization: Use local state for measure name to ensure typing is silky smooth
  const [localMLabel, setLocalMLabel] = React.useState(mLabel || '');
  const [dimValuesCache, setDimValuesCache] = React.useState({});
  const fetchingDims = React.useRef(new Set());

  // Fetch unique values whenever a filter's dimension changes
  React.useEffect(() => {
     const dimsToFetch = cFilters.map(f => f.dimensionId).filter(id => id && !dimValuesCache[id] && !fetchingDims.current.has(id));
     if (dimsToFetch.length === 0) return;

     dimsToFetch.forEach(async (dimId) => {
        fetchingDims.current.add(dimId);
        
        // Find the field in the merged model to get its true origin dataset
        const field = mergedSemanticModel.find(m => m.id === dimId);
        const targetDsId = field?.originDatasetId || activeDatasetId;
        
        console.log(`[MeasureBuilder] Fetching values for ${dimId} from dataset ${targetDsId}`);
        window.dispatchEvent(new CustomEvent('mvantage-debug', {  
            detail: { type: 'info', category: 'Builder', message: `Fetching filter values for: ${dimId}`, details: { dimId, targetDsId } } 
        }));

        try {
            const values = await getUniqueValuesForDim(targetDsId, dimId);
            setDimValuesCache(prev => ({ ...prev, [dimId]: values || [] }));
        } catch (err) {
            console.error(`[MeasureBuilder] Failed to fetch values for ${dimId}:`, err);
            showToast(`⚠️ Could not load values for ${dimId}: ${err.message || 'Unknown error'}`);
        } finally {
            fetchingDims.current.delete(dimId);
        }
     });
  }, [cFilters, activeDatasetId, getUniqueValuesForDim, mergedSemanticModel, dimValuesCache]);

  // Sync local label when mLabel changes globally (e.g. when opening modal for a new measure)
  React.useEffect(() => {
    setLocalMLabel(mLabel || '');
  }, [editingMeasureId, showMeasureBuilder]);

  const handleLabelChange = (val) => {
    setLocalMLabel(val);
    setMLabel(val);
  };

  if (!showMeasureBuilder || !activeDataset) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto">
      <div className="t-panel p-8 shadow-xl w-full max-w-3xl t-border border my-auto relative">
        <button onClick={() => setShowMeasureBuilder(false)} className="absolute top-6 right-6 p-2 hover:bg-black/5 rounded-full">
          <X size={20} className="t-text-muted"/>
        </button>
           
        <h3 className="text-xl font-bold t-text-main mb-6 flex items-center gap-2">
          <Calculator className="t-accent" size={24}/> 
          {editingMeasureId ? 'Edit Calculated Measure' : 'Unified Calculation Builder'}
        </h3>
           
        <div className="grid grid-cols-2 gap-6 mb-8">
           <div>
              <label className="text-[10px] font-black t-text-muted uppercase tracking-widest mb-2 block">Calculated Measure Identity</label>
              <input 
                value={localMLabel} 
                onChange={e => handleLabelChange(e.target.value)} 
                className="w-full bg-black/5 t-border border px-4 py-3 text-sm font-bold t-text-main focus:ring-2 focus:ring-[var(--theme-accent)]/30 transition-all outline-none" 
                placeholder="e.g. Sales Margin %" 
                style={{ borderRadius: 'var(--theme-radius-button)' }}
              />
           </div>
           <div>
              <label className="text-[10px] font-black t-text-muted uppercase tracking-widest mb-2 block">Result Format</label>
              <select 
                value={mFormat} 
                onChange={e => setMFormat(e.target.value)} 
                className="w-full bg-black/5 t-border border px-4 py-3 text-sm font-bold t-text-main focus:ring-2 focus:ring-[var(--theme-accent)]/30 transition-all outline-none"
                style={{ borderRadius: 'var(--theme-radius-button)' }}
              >
                 <option value="auto">Automatic</option>
                 <option value="number">Numeric</option>
                 <option value="percentage">Percentage (%)</option>
                 <option value="currency">Currency ($)</option>
              </select>
           </div>
        </div>

        <div className="flex gap-2 border-b t-border mb-6">
           <button onClick={() => setMeasureTab('math')} className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${measureTab === 'math' ? 'border-[var(--theme-accent)] t-text-main' : 'border-transparent t-text-muted hover:t-text-main'}`}>
             <Hash size={14} className="inline mr-1"/> Formula
           </button>
           <button onClick={() => setMeasureTab('filter')} className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${measureTab === 'filter' ? 'border-[var(--theme-accent)] t-text-main' : 'border-transparent t-text-muted hover:t-text-main'}`}>
             <FilterIcon size={14} className="inline mr-1"/> Context Filters
           </button>
           <button onClick={() => setMeasureTab('time')} className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${measureTab === 'time' ? 'border-[var(--theme-accent)] t-text-main' : 'border-transparent t-text-muted hover:t-text-main'}`}>
             <CalendarClock size={14} className="inline mr-1"/> Time Intelligence
           </button>
        </div>

        <div className="min-h-[200px]">
            {measureTab === 'math' && (
               <div className="flex flex-col gap-4">
                   <p className="text-sm t-text-muted font-medium mb-2">Build a formula using multiple measures or constants. Parentheses and standard Order of Operations (BODMAS) are supported.</p>
                   
                   <textarea
                       value={formulaText}
                       onChange={e => setFormulaText(e.target.value)}
                       className="w-full bg-black/5 t-border border px-4 py-3 text-sm font-mono t-text-main focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all"
                       rows={3}
                       placeholder="e.g. ([Enquiry] - [Test Drive]) / [Enquiry]"
                       style={{ borderRadius: 'var(--theme-radius-panel)' }}
                   />

                   <div className="flex gap-6 mt-2">
                       <div className="flex-1">
                           <div className="flex justify-between items-center mb-2">
                               <span className="text-xs font-bold t-text-muted uppercase tracking-wide block">Insert Measure</span>
                               <div className="relative w-48">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 t-text-muted" size={12} />
                                  <input value={measureSearch} onChange={e=>setMeasureSearch(e.target.value)} placeholder="Search measures..." className="w-full bg-black/5 border t-border pl-7 pr-2 py-1 text-xs rounded outline-none t-text-main focus:ring-1 focus:ring-[var(--theme-accent)]" />
                               </div>
                           </div>
                            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2 pb-2">
                                {mergedSemanticModel.filter(m => m.type === 'measure' && !m.isHidden && m.label.toLowerCase().includes(measureSearch.toLowerCase())).map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => setFormulaText(prev => prev + `[${m.id}] `)}
                                        className="px-3 py-1.5 t-panel border t-border text-xs font-bold t-text-main hover:border-[var(--theme-accent)] hover:t-accent transition-all shadow-sm flex items-center gap-2 group"
                                        style={{ borderRadius: 'var(--theme-radius-button)' }}
                                        title={`Insert [${m.id}] from ${m.sourceDatasetName || 'active table'}`}
                                    >
                                        {m.label}
                                        {m.isFromRelatedTable && (
                                            <span className="text-[8px] font-black px-1 py-0.5 bg-blue-500/10 text-blue-400 rounded uppercase tracking-tighter opacity-70 group-hover:opacity-100">
                                                {m.sourceDatasetName}
                                            </span>
                                        )}
                                    </button>
                                ))}
                                {mergedSemanticModel.filter(m => m.type === 'measure' && !m.isHidden && m.label.toLowerCase().includes(measureSearch.toLowerCase())).length === 0 && <span className="text-xs t-text-muted italic">No measures found matching "{measureSearch}"</span>}
                            </div>
                       </div>
                       <div className="shrink-0 border-l t-border pl-6">
                           <span className="text-xs font-bold t-text-muted uppercase tracking-wide block mb-2">Operators</span>
                           <div className="flex flex-wrap gap-2 w-32">
                               {['+', '-', '*', '/', '(', ')'].map(op => (
                                   <button
                                       key={op}
                                       onClick={() => setFormulaText(prev => prev + `${op} `)}
                                       className="w-8 h-8 flex items-center justify-center t-panel border t-border text-sm font-black t-accent hover:bg-black/5 transition-colors shadow-sm"
                                       style={{ borderRadius: 'var(--theme-radius-button)' }}
                                   >
                                       {op}
                                   </button>
                               ))}
                           </div>
                       </div>
                   </div>
               </div>
            )}

            {measureTab === 'filter' && (
               <div className="flex flex-col gap-4">
                   <p className="text-sm t-text-muted font-medium mb-2">Optionally restrict this measure to only calculate for specific rows matching these rules.</p>
                   
                   <div className="bg-black/5 p-4 border border-black/5" style={{ borderRadius: 'var(--theme-radius-panel)' }}>
                      <div className="flex items-center gap-3 mb-4">
                         <h5 className="text-xs font-bold t-text-main uppercase tracking-widest">Where Conditions</h5>
                         <select value={cFilterLogic} onChange={e => setCFilterLogic(e.target.value)} className="t-panel t-border border px-2 py-1 text-xs font-bold t-accent focus:outline-none rounded-md">
                             <option value="AND">Match ALL (AND)</option>
                             <option value="OR">Match ANY (OR)</option>
                         </select>
                      </div>
                     
                      <div className="flex flex-col gap-3">
                     {cFilters.map((f, i) => (
                        <div key={f._uid || i} className="flex items-center gap-2">
                           <select value={f.dimensionId} onChange={e => { const nf = [...cFilters]; nf[i] = {...nf[i], dimensionId: e.target.value, value: ['IN', 'NOT IN'].includes(f.operator) ? [] : ''}; setCFilters(nf); }} className="flex-1 t-panel t-border border px-2 py-2 text-sm font-medium t-text-main focus:outline-none">
                              <option value="">Select Dimension...</option>
                              {mergedSemanticModel.filter(m => m.type === 'dimension').map(m => (
                                  <option key={m.id} value={m.id}>
                                      {m.label} {m.isFromRelatedTable ? `(${m.sourceDatasetName})` : ''}
                                  </option>
                              ))}
                           </select>
                           <select value={f.operator} onChange={e => { const nf = [...cFilters]; nf[i] = {...nf[i], operator: e.target.value, value: ['IN', 'NOT IN'].includes(e.target.value) ? [] : ''}; setCFilters(nf); }} className="w-24 t-panel t-border border px-2 py-2 text-sm font-bold t-accent focus:outline-none text-center shrink-0">
                              <option value="=">Equals</option>
                              <option value="!=">Not Eq</option>
                              <option value="contains">Contains</option>
                              <option value="IN">In</option>
                              <option value="NOT IN">Not In</option>
                           </select>
                           
                            {['IN', 'NOT IN'].includes(f.operator) ? (
                                <div className="flex-1">
                                    <MultiSelect
                                       placeholder="Values"
                                       options={(dimValuesCache[f.dimensionId] || []).map(v => ({ value: String(v), label: String(v) }))}
                                       value={Array.isArray(f.value) ? f.value : []}
                                       onChange={vals => { const nf = [...cFilters]; nf[i] = {...nf[i], value: vals}; setCFilters(nf); }}
                                       className="shadow-none !py-2"
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 relative">
                                   <input list={`dl-${f._uid || i}`} value={f.value} onChange={e => { const nf = [...cFilters]; nf[i] = {...nf[i], value: e.target.value}; setCFilters(nf); }} placeholder="Value..." className="w-full t-panel t-border border px-3 py-2 text-sm font-bold t-text-main focus:outline-none"/>
                                    <datalist id={`dl-${f._uid || i}`}>
                                       {(dimValuesCache[f.dimensionId] || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </datalist>
                                </div>
                            )}

                           <button onClick={() => setCFilters(cFilters.filter((_, idx) => idx !== i))} className="p-2 text-red-400 hover:bg-red-500/10 rounded-md shrink-0"><Trash2 size={14}/></button>
                        </div>
                     ))}
                         <button onClick={() => setCFilters([...cFilters, {dimensionId: '', operator: '=', value: '', _uid: Math.random().toString(36).substr(2, 9)}])} className="text-xs font-bold t-accent flex items-center gap-1 w-max mt-2"><Plus size={14}/> Add Condition</button>
                      </div>
                   </div>
               </div>
            )}

            {measureTab === 'time' && (
               <div className="flex flex-col gap-4">
                   <p className="text-sm t-text-muted font-medium mb-2">Dynamically isolate this measure based on the maximum date available in your dataset.</p>
                   
                   <label className="flex items-center gap-2 mt-2 text-sm font-bold t-text-main cursor-pointer bg-black/5 w-max px-4 py-2 rounded-xl">
                      <input type="checkbox" checked={cTime.enabled} onChange={e => setCTime({...cTime, enabled: e.target.checked})} className="w-4 h-4 accent-[var(--theme-accent)]" />
                      Enable Time Intelligence
                   </label>

                   {cTime.enabled && (
                      <div className="grid grid-cols-2 gap-4 mt-2">
                         <div>
                            <label className="text-xs font-bold t-text-muted uppercase tracking-wide mb-1 block flex items-center gap-1"><CalendarClock size={12}/> Date Dimension</label>
                            <select value={cTime.dateDimensionId} onChange={e => setCTime({...cTime, dateDimensionId: e.target.value})} className="w-full t-panel t-border border px-4 py-3 text-sm font-bold t-text-main focus:outline-none">
                               <option value="">Select Date Column...</option>
                               {mergedSemanticModel.filter(m => m.format === 'date').map(m => (
                                   <option key={m.id} value={m.id}>
                                       {m.label} {m.isFromRelatedTable ? `(${m.sourceDatasetName})` : ''}
                                   </option>
                               ))}
                            </select>
                            {mergedSemanticModel.filter(m => m.format === 'date').length === 0 && <span className="text-[10px] text-red-500 mt-1 block">No dimensions formatted as 'Date' found! Change format in Dictionary.</span>}
                         </div>
                         <div>
                            <label className="text-xs font-bold t-text-muted uppercase tracking-wide mb-1 block">Time Period Base</label>
                            <select value={cTime.period} onChange={e => setCTime({...cTime, period: e.target.value})} className="w-full t-panel t-border border px-4 py-3 text-sm font-bold t-accent focus:outline-none">
                               <optgroup label="── Static (Current Period Only) ──">
                                   <option value="MTD">Month to Date (MTD)</option>
                                   <option value="LMTD">Last Month To Date (LMTD)</option>
                                   <option value="LM">Last Month Full (LM)</option>
                                   <option value="QTD">Quarter To Date (QTD)</option>
                                   <option value="LQTD">Last Quarter To Date (LQTD)</option>
                                   <option value="LQ">Last Quarter Full (LQ)</option>
                                   <option value="YTD">Year To Date (YTD)</option>
                                   <option value="LYYTD">Last Year YTD (LYYTD)</option>
                                </optgroup>
                                <optgroup label="── Dynamic (Context-Aware, All Periods) ──">
                                   <option value="DMTD">Dynamic MTD</option>
                                   <option value="DLMTD">Dynamic Last Month To Date</option>
                                   <option value="DLM">Dynamic Last Month Full</option>
                                   <option value="DQTD">Dynamic Quarter To Date</option>
                                   <option value="DLQTD">Dynamic Last Quarter To Date</option>
                                   <option value="DLQ">Dynamic Last Quarter Full</option>
                                   <option value="DYTD">Dynamic YTD</option>
                                   <option value="DLYYTD">Dynamic Last Year YTD</option>
                                </optgroup>
                            </select>
                         </div>
                      </div>
                   )}
               </div>
            )}
        </div>

        <button onClick={() => {
            if (!mLabel.trim()) return showToast("Please provide a name for the measure!");
            if (!formulaText.trim()) return showToast("Please enter a formula in the Formula tab.");
            if (cTime.enabled && !cTime.dateDimensionId) return showToast("Please select a Date column for Time Intelligence.");
           
            let newCalcId;
            if (editingMeasureId) {
                newCalcId = editingMeasureId;
            } else {
                const baseId = mLabel.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() || 'calc';
                newCalcId = baseId;
                let count = 1;
                while (activeSemanticModel.some(m => m.id === newCalcId)) newCalcId = `${baseId}_${count++}`;
            }

            let newField = {
               id: newCalcId, label: mLabel, type: 'measure', isHidden: false,
               isCalculated: true, format: mFormat,
               expression: formulaText,
               filters: cFilters.filter(f => f.dimensionId && (f.operator === 'IN' || f.operator === 'NOT IN' ? f.value.length > 0 : f.value !== '')),
               filterLogic: cFilterLogic,
               timeConfig: cTime,
               originDatasetId: activeDatasetId, originFieldId: newCalcId,
               category: 'Uncategorized'
            };

            setSemanticModels(p => {
               const currentModel = p[activeDatasetId] || [];
               let updatedModel;
               if (editingMeasureId) {
                   updatedModel = currentModel.map(m => m.id === editingMeasureId ? { ...m, ...newField } : m);
               } else {
                   updatedModel = [...currentModel, newField];
               }
               return syncSemanticModels({
                  ...p,
                  [activeDatasetId]: updatedModel
               }, relationships);
            });
            setShowMeasureBuilder(false);
            showToast(`✨ Successfully ${editingMeasureId ? 'updated' : 'created'} ${mLabel}!`);
            setEditingMeasureId(null);
           
        }} className="mt-8 t-accent-bg w-full py-4 font-bold shadow-lg text-lg flex justify-center items-center gap-2" style={{ borderRadius: 'var(--theme-radius-button)' }}>
            <Check size={20}/> {editingMeasureId ? 'Save Changes' : 'Save Combined Measure'}
        </button>
      </div>
    </div>
  );
}
