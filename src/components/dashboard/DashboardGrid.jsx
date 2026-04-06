import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, Loader2, X, Filter, ChevronUp, ChevronDown, Check, 
  Sparkles, Plus, LayoutTemplate, MessageCircleHeart, Menu, Pencil
} from 'lucide-react';
import { useAppState } from '../../contexts/AppStateContext';
import { useDataEngine } from '../../hooks/useDataEngine';
import { MultiSelect } from '../ui/MultiSelect';
import ChartWidget from './ChartWidget';
import ThemeSelector from '../ui/ThemeSelector';

// Memoized Slicer Component for Performance
const DashboardSlicer = React.memo(({ slicer, globalFilters, setGlobalFilterArray, setEditingSlicerId, setEditingSlicerTitle, editingSlicerId, editingSlicerTitle, saveSlicerTitle, setSlicers, globalSemanticFields, activeDatasetId, getUniqueValuesForDim, datesReady }) => {
    const [options, setOptions] = React.useState([]);
    const [isLoading, setIsLoading] = React.useState(false);
    
    const [dsId, oFId] = React.useMemo(() => {
        if (slicer.id.includes('::')) return slicer.id.split('::');
        
        // Handle legacy/plain slicer IDs by looking up their origin dataset through the global index
        let targetDs = activeDatasetId;
        let targetField = slicer.id;

        if (globalSemanticFields) {
            const match = globalSemanticFields.find(f => f.id === slicer.id || f.rawLabel === slicer.title || f.label === slicer.title);
            if (match) {
                targetDs = match.originDatasetId || match.dsId || activeDatasetId;
                targetField = match.originFieldId || match.localId || match.id;
            }
        }
        
        return [targetDs, targetField];
    }, [slicer.id, slicer.title, globalSemanticFields, activeDatasetId]);

    React.useEffect(() => {
        if (!datesReady) return;
        let isMounted = true;
        const fetchOptions = async () => {
            const t_slicer = Date.now();
            window.dispatchEvent(new CustomEvent('cutebi-debug', { 
               detail: { type: 'info', category: 'Lineage', message: `[${t_slicer}] Slicer "${slicer.title}" Fetching options. Source: ${dsId}` } 
            }));
            setIsLoading(true);
            try {
                const values = await getUniqueValuesForDim(dsId, oFId);
                if (isMounted) {
                    setOptions(values.map(v => ({ value: String(v), label: String(v) })));
                    window.dispatchEvent(new CustomEvent('cutebi-debug', { 
                       detail: { type: 'success', category: 'Lineage', message: `[${Date.now()}] Slicer "${slicer.title}" ready! Options retrieved: ${values.length}` } 
                    }));
                }
            } catch (err) {
                console.error("Failed to fetch slicer options:", err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };
        fetchOptions();
        return () => { isMounted = false; };
    }, [dsId, oFId, getUniqueValuesForDim, datesReady]);

    const selectedVals = globalFilters[slicer.id] || [];

    return (
        <div className="flex-1 min-w-[200px] flex items-center gap-2 group">
            {editingSlicerId === slicer.id ? (
                <input
                    autoFocus
                    value={editingSlicerTitle}
                    onChange={e => setEditingSlicerTitle(e.target.value)}
                    onBlur={() => saveSlicerTitle(slicer.id)}
                    onKeyDown={e => e.key === 'Enter' && saveSlicerTitle(slicer.id)}
                    className="w-full bg-black/10 text-sm px-2 py-1.5 outline-none t-text-main"
                    style={{ borderRadius: 'var(--theme-radius-button)' }}
                />
            ) : (
                <div className="flex-1 flex flex-col gap-1">
                    <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] font-black t-text-muted uppercase tracking-wider">{slicer.title}</span>
                        <button onClick={() => {setEditingSlicerId(slicer.id); setEditingSlicerTitle(slicer.title);}} className="opacity-0 group-hover:opacity-100 p-1 t-text-muted hover:t-accent transition-all">
                            <Pencil size={10}/>
                        </button>
                    </div>
                    <MultiSelect
                        placeholder={isLoading ? 'Loading...' : `Filter ${slicer.title}...`}
                        options={options}
                        value={selectedVals}
                        onChange={(vals) => setGlobalFilterArray(slicer.id, vals)}
                    />
                </div>
            )}
            <button onClick={() => setSlicers(prev => prev.filter(s => s.id !== slicer.id))} className="opacity-0 group-hover:opacity-100 p-1.5 t-text-muted hover:text-red-500 transition-all rounded-full hover:bg-black/10">
                <X size={14}/>
            </button>
        </div>
    );
});

export default function DashboardGrid({ handleAskAI, handlePinChart }) {
  const {
      activeDatasetId, activeDataset,
      datasets, semanticModels,
      globalFilters, setGlobalFilters,
      aiMode, setAiMode, isThinking, chatInput, setChatInput,
      showMagicBar, setShowMagicBar, setIsExploreOpen, showSidebar, setShowSidebar,
      slicers, setSlicers,
      pages, setPages, activePageId, setActivePageId,
      dashboards, setDashboards,
      setBuilderForm, initBuilderForm, setShowBuilder,
      userRole
  } = useAppState();

  const { getUniqueValuesForDim, globalSemanticFields, datesReady } = useDataEngine();

  const setGlobalFilterArray = React.useCallback((originKey, values) => {
     setGlobalFilters(prev => {
        const next = { ...prev };
        if (!values || values.length === 0) {
            delete next[originKey];
        } else {
            next[originKey] = values;
        }
        return next;
     });
  }, [setGlobalFilters]);

  const clearFilters = () => setGlobalFilters({});

  const [showSlicerPane, setShowSlicerPane] = React.useState(false);
  const [editingSlicerId, setEditingSlicerId] = React.useState(null);
  const [editingSlicerTitle, setEditingSlicerTitle] = React.useState('');
  
  const [editingPageId, setEditingPageId] = React.useState(null);
  const [editingPageName, setEditingPageName] = React.useState('');

  const saveSlicerTitle = (id) => {
      if (editingSlicerTitle.trim()) {
          setSlicers(slicers.map(s => s.id === id ? { ...s, title: editingSlicerTitle } : s));
      }
      setEditingSlicerId(null);
  };

  const savePageName = (id) => {
      if (editingPageName.trim()) {
          setPages(pages.map(p => p.id === id ? { ...p, name: editingPageName } : p));
      }
      setEditingPageId(null);
  };

  const activeCharts = dashboards[activePageId] || [];
  const isViewer = userRole === 'viewer';

  // Force Explore mode for Viewers
  useEffect(() => {
    if (isViewer && aiMode !== 'explore') {
      setAiMode('explore');
      setIsExploreOpen(true);
    }
  }, [isViewer, aiMode]);

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
      <div className="shrink-0 z-40 sticky top-0 transition-colors">
        {/* We use a backdrop-blur and a subtle background for the sticky container, 
            but the actual content is inside a rounded panel */}
        <div className="w-full pt-4 px-4 pb-2 bg-[var(--theme-app-bg)]/80 backdrop-blur-md">
          <div className="t-panel p-2 shadow-lg border t-border flex flex-col gap-2 transition-all duration-500 overflow-visible" style={{ borderRadius: 'var(--theme-radius-panel)' }}>
            
            {/* Top Bar (Chat + Dual Mode Toggle) */}
            {showMagicBar && !isViewer && (
              <div className="flex items-center gap-4 transition-all animate-in fade-in slide-in-from-top-2 duration-300">
                {!showSidebar && (
                  <button onClick={() => setShowSidebar(true)} className="t-text-muted hover:t-accent transition-colors">
                    <Menu size={20} />
                  </button>
                )}
                {activeDataset && (
                  <div className="flex-1 bg-white p-1.5 border t-border flex items-center gap-2" style={{ borderRadius: 'var(--theme-radius-button)' }}>
                    {!isViewer && (
                      <div className="flex gap-1 items-center bg-black/10 p-0.5 ml-0.5" style={{ borderRadius: 'var(--theme-radius-button)' }}>
                        <button onClick={() => {setAiMode('build'); setIsExploreOpen(false);}} className={`px-3 py-1 text-[10px] font-bold transition-all ${aiMode==='build'?'t-accent-bg text-white shadow-sm':'t-text-muted hover:t-text-main'}`} style={{ borderRadius: 'var(--theme-radius-button)' }}>Build</button>
                        <button onClick={() => {setAiMode('explore'); setIsExploreOpen(true);}} className={`px-3 py-1 text-[10px] font-bold transition-all flex items-center gap-1 ${aiMode==='explore'?'t-accent-bg text-white shadow-sm':'t-text-muted hover:t-text-main'}`} style={{ borderRadius: 'var(--theme-radius-button)' }}><MessageSquare size={10}/> Explore</button>
                      </div>
                    )}
                    {isViewer && (
                      <div className="px-3 py-1.5 text-[10px] font-black t-accent flex items-center gap-2 uppercase tracking-widest bg-black/5 rounded-lg ml-2">
                        <MessageSquare size={12}/> Explore Mode
                      </div>
                    )}
                  <form onSubmit={handleAskAI} className="flex-1 flex items-center pr-1 ml-1">
                    <input
                        type="text"
                        placeholder={aiMode === 'build' ? `Ask me to build charts (e.g., 'A line chart showing revenue') 🌸` : `Ask me questions about your data...`}
                        className="w-full bg-transparent border-none t-text-main placeholder:t-text-muted font-medium text-sm px-2 focus:outline-none"
                        style={{ border: 'none' }}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        disabled={isThinking}
                    />
                    <button type="submit" disabled={isThinking} className={`t-accent-bg px-4 py-1.5 font-bold text-xs hover:shadow-lg transition-all flex items-center gap-2 ${isThinking ? 'opacity-70 cursor-wait' : ''}`}>
                        {isThinking ? <><Loader2 size={14} className="animate-spin"/> Thinking...</> : 'Ask AI'}
                    </button>
                  </form>
                  <button onClick={() => setShowMagicBar(false)} className="p-1.5 hover:bg-black/10 mr-0.5" style={{ borderRadius: 'var(--theme-radius-button)' }}><X size={16} className="t-text-muted"/></button>
                </div>
              )}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2 rounded-xl border t-border">
                <div className="flex items-center gap-4">
                    <button onClick={() => setShowSlicerPane(!showSlicerPane)} className="flex items-center gap-2 t-text-main font-bold text-xs group">
                      <Filter size={12} className="t-accent"/>
                      <span>Slicers ({slicers.length})</span>
                      {showSlicerPane ? <ChevronUp size={12} className="t-text-muted group-hover:t-text-main"/> : <ChevronDown size={12} className="t-text-muted group-hover:t-text-main"/>}
                    </button>
                    {!isViewer && (
                      <div className="relative group">
                          <button className="flex items-center gap-1.5 t-text-muted hover:t-accent font-bold text-[10px] transition-all uppercase tracking-wider">
                              <Plus size={12}/> Add Slicer
                          </button>
                          <div className="absolute left-0 top-full mt-2 w-64 t-panel border t-border shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all max-h-64 overflow-y-auto z-50">
                            {globalSemanticFields.filter(f => f.type === 'dimension').map(dim => {
                                const isAdded = slicers.some(s => s.id === dim.value);
                                return (
                                    <button key={dim.value} disabled={isAdded} onClick={() => setSlicers([...slicers, { id: dim.value, label: dim.label, title: dim.label }])} className={`w-full text-left px-4 py-3 text-sm border-b t-border last:border-0 hover:bg-black/5 flex justify-between items-center ${isAdded ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                      <span className="truncate t-text-main font-bold">{dim.label}</span>
                                      {isAdded && <Check size={14} className="t-accent shrink-0"/>}
                                    </button>
                                )
                            })}
                          </div>
                      </div>
                    )}
                    {!showMagicBar && (
                      <button onClick={() => setShowMagicBar(true)} className="flex items-center gap-2 t-accent-bg text-white px-3 py-1 font-bold text-[10px] shadow-sm hover:shadow-md transition-all whitespace-nowrap uppercase tracking-wider mr-2" style={{ borderRadius: 'var(--theme-radius-button)' }}>
                          <Sparkles size={12} /> Ask AI
                      </button>
                    )}
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-black/5 p-1 border t-border" style={{ borderRadius: 'var(--theme-radius-button)' }}>
                    {pages.map((p) => (
                        <div key={p.id} className="flex items-center group/page relative">
                            {editingPageId === p.id && !isViewer ? (
                              <input
                                  autoFocus
                                  value={editingPageName}
                                  onChange={e => setEditingPageName(e.target.value)}
                                  onBlur={() => savePageName(p.id)}
                                  onKeyDown={e => e.key === 'Enter' && savePageName(p.id)}
                                  className="w-20 bg-white/50 text-[10px] px-2 py-1 outline-none t-text-main shadow-inner"
                                  style={{ borderRadius: 'var(--theme-radius-button)' }}
                              />
                            ) : (
                              <button 
                                onClick={() => setActivePageId(p.id)} 
                                onDoubleClick={() => { if(!isViewer) {setEditingPageId(p.id); setEditingPageName(p.name); }}} 
                                className={`px-4 py-1 text-[10px] font-black tracking-wide transition-all ${activePageId === p.id ? 't-panel t-text-main shadow-sm' : 't-text-muted hover:t-text-main'}`} 
                                style={{ borderRadius: 'var(--theme-radius-button)' }}
                              >
                                  {p.name.toUpperCase()}
                              </button>
                            )}
                        </div>
                    ))}
                    {!isViewer && (
                      <button onClick={() => {
                          const newId = `page_${Date.now()}`;
                          setPages([...pages, { id: newId, name: `Page ${pages.length + 1}` }]);
                          setActivePageId(newId);
                      }} className="px-1.5 py-1 text-[10px] font-bold t-text-muted hover:t-accent transition-all"><Plus size={12}/></button>
                    )}
                  </div>
                  {!isViewer && (
                    <button onClick={() => { setBuilderForm(initBuilderForm); setShowBuilder(true); }} className="flex items-center gap-1.5 t-button px-3 py-1 font-bold text-[10px] shadow-sm hover:shadow-md transition-all whitespace-nowrap uppercase tracking-wider"><Plus size={12} /> Add Visual</button>
                  )}
                </div>
            </div>
            <div className={`flex flex-col gap-2 bg-white p-2 pr-3 rounded-xl border t-border -mt-1 ${showSlicerPane ? '' : 'hidden'}`}>
                    <div className="flex justify-between items-center px-1 mb-1">
                        <span className="text-[10px] font-bold t-text-muted uppercase tracking-widest">Active Filters</span>
                        <button onClick={clearFilters} className="text-[10px] t-text-muted hover:t-text-main font-bold underline whitespace-nowrap">Clear All</button>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {slicers.map((slicer) => {
                          return (
                              <DashboardSlicer
                                  key={slicer.id}
                                  slicer={slicer}
                                  globalFilters={globalFilters}
                                  setGlobalFilterArray={setGlobalFilterArray}
                                  setEditingSlicerId={setEditingSlicerId}
                                  setEditingSlicerTitle={setEditingSlicerTitle}
                                  editingSlicerId={editingSlicerId}
                                  editingSlicerTitle={editingSlicerTitle}
                                  saveSlicerTitle={saveSlicerTitle}
                                  setSlicers={setSlicers}
                                  globalSemanticFields={globalSemanticFields}
                                  activeDatasetId={activeDatasetId}
                                  getUniqueValuesForDim={getUniqueValuesForDim}
                                  datesReady={datesReady}
                              />
                          );
                      })}
                    </div>
                </div>
            </div>
          </div>
        </div>

      <div className="flex-1 overflow-y-auto w-full scrollbar-hide pt-2 px-4 pb-16">
          {activeCharts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 t-text-muted">
              <MessageCircleHeart size={48} className="mb-4 opacity-50" />
              <h3 className="text-xl font-bold mb-2 t-text-main">Your canvas is empty!</h3>
              <p className="text-sm">Type a question in the magic bar above or click Add Visual to create your first cute chart.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeCharts.map(chart => (
                  <ChartWidget 
                      key={chart.id} 
                      chart={chart} 
                      handlePinChart={handlePinChart} 
                      isViewer={isViewer}
                  />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
