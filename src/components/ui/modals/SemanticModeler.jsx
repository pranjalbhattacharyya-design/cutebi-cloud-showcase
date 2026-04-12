import React from 'react';
import { 
  Database, Plus, Sparkles, ArrowLeft, Search, FolderPlus,
  LayoutGrid, List, Table2, Calculator, Link as LinkIcon, 
  EyeOff, Eye, CalendarClock, Filter as FilterIcon, Pencil, Trash2, Menu,
  UploadCloud
} from 'lucide-react';
import { useAppState } from '../../../contexts/AppStateContext';
import { apiClient } from '../../../services/api';
import { syncSemanticModels } from '../../../utils/dataParser';


export default function SemanticModeler({ handleAutoFillDescriptions, isThinking }) {
  const {
    showSemanticModeler, setShowSemanticModeler,
    activeDatasetId, activeDataset,
    semanticModels, setSemanticModels, relationships,
    categories, setShowCategoryModal,
    dictSearch, setDictSearch,
    dictFilterCategory, setDictFilterCategory,
    datasets, setDatasets, semanticViewMode, setSemanticViewMode,
    setEditingMeasureId, setMeasureTab, setMLabel,
    setMFormat, setFormulaText, setCFilters,
    setCFilterLogic, setCTime, setShowMeasureBuilder,
    showToast, showSidebar, setShowSidebar,
    currentWorkspaceId,
    globalSemanticFields, isUnified, joinGroupIds,
    mergedSemanticModel
  } = useAppState();



  const handlePublishToWorkspace = async () => {
    if (!currentWorkspaceId) return;
    const modelName = prompt("Enter a name for this shared semantic model:", isUnified ? "Unified Enterprise Model" : `${activeDataset.name} Model`);
    if (!modelName) return;

    try {
        const modelId = `pub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        // Prepare the payload
        const payload = {
            id: modelId,
            name: modelName,
            workspace_id: currentWorkspaceId,
            isUnified,
            baseDatasetId: activeDatasetId,
            joinGroupIds: isUnified ? joinGroupIds : [activeDatasetId],
            relationships: isUnified ? relationships.filter(r => joinGroupIds.includes(r.fromDatasetId) && joinGroupIds.includes(r.toDatasetId)) : [],
            datasetsMeta: datasets
                .filter(d => isUnified ? joinGroupIds.includes(d.id) : d.id === activeDatasetId)
                .map(d => ({
                    id: d.id,
                    name: d.name,
                    tableName: d.tableName || d.id,
                    headers: d.headers || [],
                    description: d.description || '',
                    originalFileName: d.originalFileName || d.name
                })),
            fields: mergedSemanticModel.map(f => {
                const { sourceDatasetName, isFromRelatedTable, ...rest } = f;
                return rest;
            }), 
            categories,
            timestamp: Date.now()
        };

        await apiClient.post('/published_models', payload);
        showToast(`✨ Model "${modelName}" published to workspace!`);
    } catch (err) {
        console.error(err);
        showToast("Failed to publish model.");
    }
  };


  const filteredDict = React.useMemo(() => {
    if (!globalSemanticFields) return [];
    const search = (dictSearch || '').toLowerCase();
    return globalSemanticFields.filter(f => 
      (f.label?.toLowerCase().includes(search) || f.value?.toLowerCase().includes(search)) &&
      (dictFilterCategory === 'All' || f.category === dictFilterCategory)
    );
  }, [globalSemanticFields, dictSearch, dictFilterCategory]);
  
  const dimFields = React.useMemo(() => filteredDict.filter(f => f.type === 'dimension'), [filteredDict]);
  const measFields = React.useMemo(() => filteredDict.filter(f => f.type === 'measure'), [filteredDict]);


  // --- Handlers ---

  const updateSemanticFieldById = (id, key, val, originDsId = activeDatasetId) => {
    setSemanticModels(p => {
       const next = {...p};
       const targetDsId = originDsId || activeDatasetId;
       if (!next[targetDsId]) return p;
       next[targetDsId] = next[targetDsId].map(f => f.id === id ? {...f, [key]: val} : f);
       return syncSemanticModels(next, relationships);
    });
  };

  const handleToggleVisibility = (id, originDsId = activeDatasetId) => {
    setSemanticModels(p => {
       const next = {...p};
       const targetDsId = originDsId || activeDatasetId;
       if (!next[targetDsId]) return p;
       next[targetDsId] = next[targetDsId].map(f => f.id === id ? {...f, isHidden: !f.isHidden} : f);
       return next;
    });
  };

  const handleEditMeasure = (field) => {
    setEditingMeasureId(field.id);
    setMLabel(field.label);
    setMFormat(field.format || 'auto');
    setFormulaText(field.expression || '');
    setCFilters(field.filters?.length > 0 ? field.filters : [{ dimensionId: '', operator: '=', value: '' }]);
    setCFilterLogic(field.filterLogic || 'AND');
    setCTime(field.timeConfig || { enabled: false, dateDimensionId: '', period: 'MTD' });
    setMeasureTab('math');
    setShowMeasureBuilder(true);
  };

  const renderListRow = (field) => (
    <tr key={`${field.dsId}::${field.localId}`} className={`transition-all border-b t-border ${field.isHidden ? 'bg-transparent opacity-30 grayscale' : 'bg-[var(--theme-panel-bg)] hover:brightness-110'}`}>
       <td className="p-4 border-r t-border">
           <div className="flex items-center justify-between mb-1">
               <span className="font-bold text-sm tracking-wide t-text-main">
                  {field.label} 
                  {field.isCalculated && <Calculator size={12} className="inline ml-1 t-accent" />} 
                  {field.isJoined && <LinkIcon size={12} className="inline ml-1 text-blue-400" title="Joined Column" />}
                  {field.isUnified && <Sparkles size={10} className="inline ml-1 t-accent opacity-60" title="Unified Model Field" />}
               </span>
           </div>
           <div className="text-xs font-mono t-text-muted">{field.localId}</div>
       </td>
       <td className="p-4 border-r t-border w-1/3">
           {!field.isCalculated ? (
               <div className="flex flex-col gap-2">
                   <input className="bg-transparent border-b border-transparent hover:t-border focus:t-border px-1 py-1 text-xs outline-none w-full t-text-main" value={field.description || ''} onChange={(e) => updateSemanticFieldById(field.localId, 'description', e.target.value, field.dsId)} placeholder="Add description..." />
                   {field.type === 'measure' && (
                       <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold t-text-muted uppercase">Agg:</span>
                          <select value={field.aggType || 'sum'} onChange={e => updateSemanticFieldById(field.localId, 'aggType', e.target.value, field.dsId)} className="bg-transparent border t-border text-xs outline-none font-semibold px-1 py-0.5 rounded t-text-main">
                             <option value="sum">Sum</option>
                             <option value="count">Count Rows</option>
                             <option value="countDistinct">Count Distinct</option>
                          </select>
                       </div>
                   )}
               </div>
           ) : (
                <div className="text-xs t-text-muted max-h-16 overflow-y-auto w-full">
                    <div className="font-mono font-bold leading-relaxed mb-1">
                        {field.expression ? (
                            <span className="t-accent underline decoration-dotted">{field.expression}</span>
                        ) : (
                            (field.mathTokens || []).map((t, i) => (
                                <span key={i}>
                                    {t.type === 'operator' ? <span className="t-accent px-1 font-black">{t.val}</span> : t.type === 'number' ? t.val : (t.type === '(' || t.type === ')' ? <span className="t-text-main px-0.5">{t.type}</span> : (mergedSemanticModel.find(m=>m.id === t.val)?.label || t.val))}
                                </span>
                            ))
                        )}
                    </div>
                    {field.timeConfig?.enabled && (
                        <div className="flex items-center gap-1.5 mt-1 pt-1 border-t t-border t-text-main font-bold">
                            <CalendarClock size={10} className="t-accent shrink-0"/>
                            <span>{field.timeConfig.period}</span>
                            <span className="t-text-muted font-normal">based on</span>
                            <span className="t-accent">{mergedSemanticModel.find(m=>m.id === field.timeConfig.dateDimensionId)?.label || field.timeConfig.dateDimensionId}</span>
                        </div>
                    )}
                    {field.filters?.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-1 pt-1 border-t t-border t-text-main font-bold flex-wrap">
                            <FilterIcon size={10} className="t-accent shrink-0"/>
                            {field.filters.map((f, idx) => (
                                <React.Fragment key={idx}>
                                    {idx > 0 && <span className="t-text-muted text-[8px] mx-0.5">{field.filterLogic}</span>}
                                    <span className="t-accent">{mergedSemanticModel.find(m=>m.id === f.dimensionId)?.label || f.dimensionId}</span>
                                    <span className="t-text-muted font-black">{f.operator}</span>
                                    <span className="t-text-main">
                                        {Array.isArray(f.value) 
                                            ? `[${f.value.join(', ')}]` 
                                            : (f.value === '' ? "''" : `'${f.value}'`)}
                                    </span>
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-3 mt-2 text-[10px] uppercase font-black text-[var(--theme-accent)]">
                       <button onClick={() => handleEditMeasure(field)} className="hover:underline">Edit Formula & Filters</button>
                       <button onClick={() => { 
                          setSemanticModels(p => { 
                              const next={...p}; 
                              next[field.dsId]=next[field.dsId].filter(f=>f.id!==field.localId); 
                              return next; 
                          }); 
                          showToast("Calculated measure removed.");
                       }} className="text-red-400 hover:text-red-600">Delete</button>
                    </div>
                </div>
            )}
       </td>
       <td className="p-4 border-r t-border">
           <div className="flex gap-2 items-center">
               <select className="bg-transparent t-border border px-2 py-1 text-xs outline-none t-text-main" style={{ borderRadius: 'var(--theme-radius-button)' }} value={field.type} onChange={(e) => updateSemanticFieldById(field.localId, 'type', e.target.value, field.dsId)}>
                 <option value="dimension">Dimension</option>
                 <option value="measure">Measure</option>
               </select>
               <select className="bg-transparent t-border border px-2 py-1 text-xs outline-none t-text-main w-full" style={{ borderRadius: 'var(--theme-radius-button)' }} value={field.category || 'Uncategorized'} onChange={(e) => updateSemanticFieldById(field.localId, 'category', e.target.value, field.dsId)}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
           </div>
       </td>
       <td className="p-4 border-r t-border">
           <select className="bg-transparent t-border border px-2 py-1 text-xs outline-none t-text-main" style={{ borderRadius: 'var(--theme-radius-button)' }} value={field.format || 'auto'} onChange={(e) => updateSemanticFieldById(field.localId, 'format', e.target.value, field.dsId)}>
             <option value="auto">Auto</option>
             <option value="number">Number</option>
             <option value="percentage">Percent (%)</option>
             <option value="currency">Currency ($)</option>
             <option value="date">Date</option>
           </select>
       </td>
       <td className="p-4 text-right">
           <button onClick={() => handleToggleVisibility(field.localId, field.dsId)} className={`text-xs px-2 py-1 font-bold whitespace-nowrap inline-flex items-center gap-1 transition-colors ${field.isHidden ? 'bg-black/20 t-text-muted' : 'bg-green-500/20 text-green-500'}`} style={{ borderRadius: 'var(--theme-radius-button)' }}>
             {field.isHidden ? <><EyeOff size={12} /> Hidden</> : <><Eye size={12} /> Visible</>}
           </button>
       </td>
    </tr>
  );

  if (!showSemanticModeler || !activeDataset) return null;

  return (
    <div className="max-w-7xl mx-auto w-full flex-1 t-panel p-8 shadow-sm t-border border animate-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          {!showSidebar && (
            <button onClick={() => setShowSidebar(true)} className="t-text-muted hover:t-accent transition-colors">
              <Menu size={20} />
            </button>
          )}
           <div>
            <h3 className="text-2xl font-bold t-text-main flex items-center gap-2">
              <Database className="t-accent" /> {isUnified ? 'Unified Dictionary' : 'Semantic Dictionary'}
            </h3>
            <p className="text-sm t-text-muted mt-1">
              {isUnified ? (
                <>Unified Model combining <b className="t-text-main">{joinGroupIds.length} tables</b></>
              ) : (
                <>Define your single source of truth for <b className="t-text-main">{activeDataset.name}</b></>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <button onClick={() => {
                setEditingMeasureId(null);
                setMeasureTab('math');
                setMLabel('');
                setMFormat('auto');
                setFormulaText('');
                setCFilters([{ dimensionId: '', operator: '=', value: '' }]);
                setCFilterLogic('AND');
                setCTime({ enabled: false, dateDimensionId: '', period: 'MTD' });
                setShowMeasureBuilder(true);
           }} className="flex items-center gap-2 t-button px-4 py-2 font-bold text-sm transition-colors">
              <Plus size={16} /> Create Measure
           </button>
           <button onClick={handleAutoFillDescriptions} disabled={isThinking} className={`flex items-center gap-2 t-accent-bg px-4 py-2 font-bold text-sm shadow-md hover:shadow-lg transition-all ${isThinking ? 'opacity-70 cursor-wait' : ''}`}>
              <Sparkles size={16} /> Auto-Fill Descriptions
           </button>
           <button onClick={handlePublishToWorkspace} className="flex items-center gap-2 t-accent-bg px-4 py-2 font-bold text-sm shadow-md hover:shadow-lg transition-all border t-border">
              <UploadCloud size={16} /> Publish to Workspace
           </button>
           <button onClick={() => setShowSemanticModeler(false)} className="flex items-center gap-2 t-button px-4 py-2 font-bold text-sm transition-colors">
              <ArrowLeft size={16} /> Back to Dashboard
           </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6 bg-black/5 p-4 rounded-xl t-border border">
          <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 t-text-muted" size={16} />
              <input value={dictSearch} onChange={e=>setDictSearch(e.target.value)} placeholder="Search fields by name or ID..." className="w-full t-panel t-border border pl-9 pr-4 py-2 text-sm rounded-[var(--theme-radius-button)] outline-none focus:ring-2 focus:ring-[var(--theme-accent)] shadow-sm" />
          </div>
          <div className="flex items-center gap-2">
              <label className="text-xs font-bold t-text-muted uppercase">Category:</label>
              <select value={dictFilterCategory} onChange={e=>setDictFilterCategory(e.target.value)} className="t-panel border px-3 py-2 text-sm font-bold rounded-[var(--theme-radius-button)] outline-none shadow-sm">
                  <option value="All">All Categories</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
          </div>
          <button onClick={() => setShowCategoryModal(true)} className="t-button px-4 py-2 text-sm font-bold flex items-center gap-2 shadow-sm rounded-[var(--theme-radius-button)]">
            <FolderPlus size={16}/> Manage Categories
          </button>
      </div>

      <div className="mb-6 flex justify-between items-end gap-4">
         <textarea
            value={activeDataset.description || ''}
            onChange={(e) => setDatasets(prev => prev.map(d => d.id === activeDatasetId ? { ...d, description: e.target.value } : d))}
            placeholder="Enter a brief business description for this entire dataset..."
            className="flex-1 bg-black/5 border border-transparent px-4 py-3 text-sm t-text-main focus:t-border outline-none resize-none"
            style={{ borderRadius: 'var(--theme-radius-button)' }}
            rows={2}
         />
         <div className="flex bg-black/5 p-1 shrink-0" style={{ borderRadius: 'var(--theme-radius-button)' }}>
            <button onClick={() => setSemanticViewMode('grid')} className={`p-2 rounded-md transition-all ${semanticViewMode === 'grid' ? 'bg-[var(--theme-panel-bg)] shadow-sm t-text-main' : 't-text-muted hover:t-text-main'}`} title="Grid View">
               <LayoutGrid size={18} />
            </button>
            <button onClick={() => setSemanticViewMode('list')} className={`p-2 rounded-md transition-all ${semanticViewMode === 'list' ? 'bg-[var(--theme-panel-bg)] shadow-sm t-text-main' : 't-text-muted hover:t-text-main'}`} title="List View">
               <List size={18} />
            </button>
         </div>
      </div>
     
      {semanticViewMode === 'grid' && (
        <div>
            {dimFields.length > 0 && (
                <>
                    <h4 className="text-lg font-black t-text-main mb-4 flex items-center gap-2 border-b t-border pb-2"><Table2 className="t-accent" size={20}/> Dimensions</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                      {dimFields.map((field) => (
                        <div key={`${field.dsId}::${field.localId}`} className={`p-4 transition-all border flex flex-col gap-3 ${field.isHidden ? 'bg-transparent opacity-30 grayscale t-border' : 'bg-[var(--theme-panel-bg)] t-border hover:shadow-md shadow-sm'}`} style={{ borderRadius: 'var(--theme-radius-panel)' }}>
                          <div className="flex justify-between items-center">
                            <span className={`text-xs font-bold uppercase tracking-wider truncate pr-2 ${field.isHidden ? 't-text-muted' : 't-text-main'}`}>
                              {field.localId}
                              {field.isCalculated && <Calculator size={12} className="inline ml-1 t-accent" />}
                              {field.isJoined && <LinkIcon size={12} className="inline ml-1 text-blue-400" title="Joined Column" />}
                              {field.isJoinKey && <LinkIcon size={12} className="inline ml-1 t-accent" title="Unifying Join Key" />}
                              {field.isUnified && <Sparkles size={10} className="inline ml-1 t-accent opacity-60" />}
                            </span>
                            <div className="flex items-center gap-2">
                                {field.isFromRelatedTable && (
                                   <span className="text-[8px] font-black px-1 py-0.5 bg-blue-100 text-blue-700 rounded uppercase tracking-tighter shrink-0" title={`From ${field.sourceDatasetName}`}>
                                       {field.sourceDatasetName}
                                   </span>
                                )}
                                <button onClick={() => handleToggleVisibility(field.localId, field.dsId)} className={`text-xs px-2 py-1 font-bold whitespace-nowrap flex items-center gap-1 transition-colors ${field.isHidden ? 'bg-black/20 t-text-muted' : 'bg-green-500/20 text-green-500'}`} style={{ borderRadius: 'var(--theme-radius-button)' }}>
                                {field.isHidden ? <><EyeOff size={12} /> Hidden</> : <><Eye size={12} /> Visible</>}
                                </button>
                            </div>
                          </div>
                          <input className={`t-panel t-border border px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-[var(--theme-accent)] outline-none ${field.isHidden ? 't-text-muted' : 't-text-main'}`} value={field.label} onChange={(e) => updateSemanticFieldById(field.localId, 'label', e.target.value, field.dsId)} placeholder="Friendly Name" />
                         
                          {!field.isCalculated ? (
                            <>
                               <input className={`bg-transparent border t-border px-3 py-2 text-xs focus:ring-2 focus:ring-[var(--theme-accent)] outline-none ${field.isHidden ? 't-text-muted' : 't-text-main'}`} value={field.description || ''} onChange={(e) => updateSemanticFieldById(field.localId, 'description', e.target.value, field.dsId)} placeholder="Column Description" />
                            </>
                          ) : (
                            <div className="flex flex-col gap-2 bg-[var(--theme-app-bg)] p-3 border t-border" style={{ borderRadius: 'calc(var(--theme-radius-panel) / 2)' }}>
                               <div className="text-xs font-mono t-text-muted break-words leading-relaxed font-bold max-h-32 overflow-y-auto pr-1">
                                  {field.expression ? (
                                      <span className="t-accent px-1">{field.expression}</span>
                                  ) : (
                                      (field.mathTokens || []).map((t, i) => (
                                         <span key={i}>
                                            {t.type === 'operator' ? <span className="t-accent px-1">{t.val}</span> : t.type === 'number' ? t.val : (t.type === '(' || t.type === ')' ? <span className="t-text-main px-0.5">{t.type}</span> : (mergedSemanticModel.find(m=>m.id === t.val)?.label || t.val))}
                                         </span>
                                      ))
                                  )}
                                  {field.timeConfig?.enabled && <span className="block mt-2 pt-2 border-t t-border t-text-main"><CalendarClock size={10} className="inline mr-1 t-accent"/>{field.timeConfig.period} based on {mergedSemanticModel.find(m=>m.id === field.timeConfig.dateDimensionId)?.label}</span>}
                                  {field.filters?.length > 0 && <span className="block mt-2 pt-2 border-t t-border t-text-main"><FilterIcon size={10} className="inline mr-1 t-accent"/>{field.filters.map(f => `${mergedSemanticModel.find(m=>m.id === f.dimensionId)?.label} ${f.operator} ${Array.isArray(f.value) ? `[${f.value.join(', ')}]` : `'${f.value}'`}`).join(` ${field.filterLogic} `)}</span>}
                               </div>
                               <div className="flex gap-2 mt-2">
                                  <button onClick={() => handleEditMeasure(field)} className="text-xs t-text-muted hover:t-accent transition-colors flex items-center gap-1 font-bold"><Pencil size={12}/> Edit</button>
                                  <button onClick={() => {
                                     setSemanticModels(p => {
                                        const next = {...p};
                                        next[field.dsId] = next[field.dsId].filter(f => f.id !== field.localId);
                                        return next;
                                     });
                                     showToast("Calculated measure removed.");
                                  }} className="text-xs t-text-muted hover:text-red-500 transition-colors flex items-center gap-1 font-bold"><Trash2 size={12}/> Delete</button>
                               </div>
                            </div>
                          )}
                         
                          <div className="grid grid-cols-2 gap-2 mt-auto">
                             <select className={`t-panel t-border border px-3 py-2 text-sm outline-none ${field.isHidden ? 't-text-muted' : 't-text-main'}`} value={field.type} onChange={(e) => updateSemanticFieldById(field.localId, 'type', e.target.value, field.dsId)}>
                               <option value="dimension">Dimension</option>
                               <option value="measure">Measure</option>
                             </select>
                             <select className={`t-panel t-border border px-3 py-2 text-sm outline-none ${field.isHidden ? 't-text-muted' : 't-text-main'}`} value={field.format || 'auto'} onChange={(e) => updateSemanticFieldById(field.localId, 'format', e.target.value, field.dsId)}>
                               <option value="auto">Auto</option>
                               <option value="number">Number</option>
                               <option value="percentage">Percent (%)</option>
                               <option value="currency">Currency ($)</option>
                               <option value="date">Date</option>
                             </select>
                          </div>
                          <div className="mt-1">
                             <select className={`w-full bg-transparent t-border border px-3 py-2 text-xs outline-none ${field.isHidden ? 't-text-muted' : 't-text-main'}`} style={{ borderRadius: 'var(--theme-radius-button)' }} value={field.category || 'Uncategorized'} onChange={(e) => updateSemanticFieldById(field.localId, 'category', e.target.value, field.dsId)}>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                             </select>
                          </div>
                        </div>
                      ))}
                    </div>
                </>
            )}
           
            {measFields.length > 0 && (
                <>
                    <h4 className="text-lg font-black t-text-main mb-4 flex items-center gap-2 border-b t-border pb-2"><Calculator className="t-accent" size={20}/> Facts (Measures)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                      {measFields.map((field) => (
                        <div key={`${field.dsId}::${field.localId}`} className={`p-4 transition-all border flex flex-col gap-3 ${field.isHidden ? 'bg-transparent opacity-30 grayscale t-border' : 'bg-[var(--theme-panel-bg)] t-border hover:shadow-md shadow-sm'}`} style={{ borderRadius: 'var(--theme-radius-panel)' }}>
                          <div className="flex justify-between items-center">
                            <span className={`text-xs font-bold uppercase tracking-wider truncate pr-2 ${field.isHidden ? 't-text-muted' : 't-text-main'}`}>
                              {field.localId}
                              {field.isCalculated && <Calculator size={12} className="inline ml-1 t-accent" />}
                              {field.isJoined && <LinkIcon size={12} className="inline ml-1 text-blue-400" title="Joined Column" />}
                              {field.isJoinKey && <LinkIcon size={12} className="inline ml-1 t-accent" title="Unifying Join Key" />}
                              {field.isUnified && <Sparkles size={10} className="inline ml-1 t-accent opacity-60" />}
                            </span>
                            <div className="flex items-center gap-2">
                                {field.isFromRelatedTable && (
                                   <span className="text-[8px] font-black px-1 py-0.5 bg-blue-100 text-blue-700 rounded uppercase tracking-tighter shrink-0" title={`From ${field.sourceDatasetName}`}>
                                       {field.sourceDatasetName}
                                   </span>
                                )}
                                <button onClick={() => handleToggleVisibility(field.localId, field.dsId)} className={`text-xs px-2 py-1 font-bold whitespace-nowrap flex items-center gap-1 transition-colors ${field.isHidden ? 'bg-black/20 t-text-muted' : 'bg-green-500/20 text-green-500'}`} style={{ borderRadius: 'var(--theme-radius-button)' }}>
                                {field.isHidden ? <><EyeOff size={12} /> Hidden</> : <><Eye size={12} /> Visible</>}
                                </button>
                            </div>
                          </div>
                          <input className={`t-panel t-border border px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-[var(--theme-accent)] outline-none ${field.isHidden ? 't-text-muted' : 't-text-main'}`} value={field.label} onChange={(e) => updateSemanticFieldById(field.localId, 'label', e.target.value, field.dsId)} placeholder="Friendly Name" />
                         
                          {!field.isCalculated ? (
                            <>
                               <input className={`bg-transparent border t-border px-3 py-2 text-xs focus:ring-2 focus:ring-[var(--theme-accent)] outline-none ${field.isHidden ? 't-text-muted' : 't-text-main'}`} value={field.description || ''} onChange={(e) => updateSemanticFieldById(field.localId, 'description', e.target.value, field.dsId)} placeholder="Column Description" />
                               <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] font-bold t-text-muted uppercase">Aggregation:</span>
                                  <select value={field.aggType || 'sum'} onChange={e => updateSemanticFieldById(field.localId, 'aggType', e.target.value, field.dsId)} className="bg-transparent border t-border t-text-main text-xs outline-none font-semibold px-2 py-1 shadow-sm rounded">
                                     <option value="sum">Sum</option>
                                     <option value="count">Count Rows</option>
                                     <option value="countDistinct">Count Distinct</option>
                                 </select>
                               </div>
                            </>
                          ) : (
                            <div className="flex flex-col gap-2 bg-[var(--theme-app-bg)] p-3 border t-border" style={{ borderRadius: 'calc(var(--theme-radius-panel) / 2)' }}>
                               <div className="text-xs font-mono t-text-muted break-words leading-relaxed font-bold max-h-32 overflow-y-auto pr-1">
                                  {field.expression ? (
                                      <span className="t-accent px-1">{field.expression}</span>
                                  ) : (
                                      (field.mathTokens || []).map((t, i) => (
                                         <span key={i}>
                                            {t.type === 'operator' ? <span className="t-accent px-1">{t.val}</span> : t.type === 'number' ? t.val : (t.type === '(' || t.type === ')' ? <span className="t-text-main px-0.5">{t.type}</span> : (mergedSemanticModel.find(m=>m.id === t.val)?.label || t.val))}
                                         </span>
                                      ))
                                  )}
                                  {field.timeConfig?.enabled && <span className="block mt-2 pt-2 border-t t-border t-text-main"><CalendarClock size={10} className="inline mr-1 t-accent"/>{field.timeConfig.period} based on {mergedSemanticModel.find(m=>m.id === field.timeConfig.dateDimensionId)?.label}</span>}
                                  {field.filters?.length > 0 && <span className="block mt-2 pt-2 border-t t-border t-text-main"><FilterIcon size={10} className="inline mr-1 t-accent"/>{field.filters.map(f => `${mergedSemanticModel.find(m=>m.id === f.dimensionId)?.label} ${f.operator} ${Array.isArray(f.value) ? `[${f.value.join(', ')}]` : `'${f.value}'`}`).join(` ${field.filterLogic} `)}</span>}
                               </div>
                               <div className="flex gap-2 mt-2">
                                  <button onClick={() => handleEditMeasure(field)} className="text-xs t-text-muted hover:t-accent transition-colors flex items-center gap-1 font-bold"><Pencil size={12}/> Edit</button>
                                  <button onClick={() => {
                                     setSemanticModels(p => {
                                        const next = {...p};
                                        next[field.originDatasetId] = next[field.originDatasetId].filter(f => f.id !== field.id);
                                        return next;
                                     });
                                     showToast("Calculated measure removed.");
                                  }} className="text-xs t-text-muted hover:text-red-500 transition-colors flex items-center gap-1 font-bold"><Trash2 size={12}/> Delete</button>
                               </div>
                            </div>
                          )}
                         
                          <div className="grid grid-cols-2 gap-2 mt-auto">
                             <select className={`t-panel t-border border px-3 py-2 text-sm outline-none ${field.isHidden ? 'opacity-50' : 't-text-main'}`} value={field.type} onChange={(e) => updateSemanticFieldById(field.id, 'type', e.target.value, field.originDatasetId)}>
                               <option value="dimension">Dimension</option>
                               <option value="measure">Measure</option>
                             </select>
                             <select className={`t-panel t-border border px-3 py-2 text-sm outline-none ${field.isHidden ? 'opacity-50' : 't-text-main'}`} value={field.format || 'auto'} onChange={(e) => updateSemanticFieldById(field.id, 'format', e.target.value, field.originDatasetId)}>
                               <option value="auto">Auto</option>
                               <option value="number">Number</option>
                               <option value="percentage">Percent (%)</option>
                               <option value="currency">Currency ($)</option>
                               <option value="date">Date</option>
                             </select>
                          </div>
                          <div className="mt-1">
                             <select className={`w-full bg-transparent t-border border px-3 py-2 text-xs outline-none ${field.isHidden ? 'opacity-50 t-text-muted' : 't-text-main'}`} style={{ borderRadius: 'var(--theme-radius-button)' }} value={field.category || 'Uncategorized'} onChange={(e) => updateSemanticFieldById(field.id, 'category', e.target.value, field.originDatasetId)}>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                             </select>
                          </div>
                        </div>
                      ))}
                    </div>
                </>
            )}
           
            {dimFields.length === 0 && measFields.length === 0 && <div className="text-center py-10 t-text-muted font-bold">No fields match your search/filter criteria.</div>}
        </div>
      )}

      {semanticViewMode === 'list' && (
        <div className="overflow-x-auto t-border border mb-6 bg-black/5" style={{ borderRadius: 'var(--theme-radius-panel)' }}>
          <table className="w-full text-left text-sm border-collapse">
            <thead className="t-text-muted text-xs uppercase tracking-wider border-b t-border bg-[var(--theme-panel-bg)]">
              <tr>
                <th className="p-4 font-bold">Field Name</th>
                <th className="p-4 font-bold">Description & Aggregation</th>
                <th className="p-4 font-bold">Type & Category</th>
                <th className="p-4 font-bold">Format</th>
                <th className="p-4 font-bold text-right">Visibility</th>
              </tr>
            </thead>
            <tbody className="divide-y t-border">
               {dimFields.length > 0 && <tr className="bg-black/10"><td colSpan="5" className="p-2 px-4 font-black text-xs uppercase tracking-widest t-text-main"><Table2 size={14} className="inline mr-2 t-accent"/> Dimensions</td></tr>}
               {dimFields.map(field => renderListRow(field))}

               {measFields.length > 0 && <tr className="bg-black/10"><td colSpan="5" className="p-2 px-4 font-black text-xs uppercase tracking-widest t-text-main"><Calculator size={14} className="inline mr-2 t-accent"/> Facts (Measures)</td></tr>}
               {measFields.map(field => renderListRow(field))}
               
               {dimFields.length === 0 && measFields.length === 0 && <tr><td colSpan="5" className="text-center py-10 t-text-muted font-bold">No fields match your search/filter criteria.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
