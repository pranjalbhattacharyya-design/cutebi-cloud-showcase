import React from 'react';
import {
  Sparkles, Menu, Database, Pencil, Trash2, Download,
  FolderArchive, Palette, Settings2, Link as LinkIcon, Save, FolderOpen,
  Plus, Calculator, Library, LayoutGrid, LogOut, CloudDownload
} from 'lucide-react';
import { useAppState } from '../../contexts/AppStateContext';
import { THEMES } from '../../utils/themeEngine';
import { syncSemanticModels, generateInitModel } from '../../utils/dataParser';


export default function Sidebar({
  handleRemoveDataset,
  saveDatasetName,
  openGetDataModal,
  handleAutoLoadTemplate,
  handleImportTemplates,
  handleExportTemplate,
  deleteSavedReport,
  handleSaveReportClick
}) {
  const {
    showSidebar, setShowSidebar,
    datasets, activeDatasetId, setActiveDatasetId,
    setPendingRestore, pendingRestore,
    editingDatasetId, setEditingDatasetId,
    editingDatasetName, setEditingDatasetName,
    savedReports, currentTemplateId,
    setDatasets, setSemanticModels, setPages, setSlicers,
    setTheme, setCategories, setDashboards, setRelationships,
    setCurrentTemplateId, showToast, theme, activeDataset,
    showSemanticModeler, setShowSemanticModeler, setShowRelModal,
    hiddenDatasetIds, setHiddenDatasetIds,
    currentWorkspaceId,
    workspaceDatasets, workspaceSemanticModels,
    publishedModels,
    isLibraryOpen, setIsLibraryOpen, importLibraryDataset,
    handleImportModel,
    setIsMutating, refreshData, setShowMenuForDataset, apiClient,
    setShowPortal, setUserRole
  } = useAppState();



  const handleAddWorkspaceData = (wsDataset) => {
    // Check if already in active report
    if (datasets.find(d => d.id === wsDataset.id)) {
      showToast("Dataset already in report.");
      return;
    }

    // Use workspace semantic model if already hydrated, otherwise generate fresh from headers
    const wsModel = workspaceSemanticModels[wsDataset.id];
    const model = (wsModel && wsModel.length > 0)
      ? wsModel
      : generateInitModel(wsDataset.id, wsDataset.headers || [], wsDataset.sample_data || []);

    // Construct a full dataset object — must include tableName so Query Engine queries work
    const newDs = {
      id: wsDataset.id,
      name: wsDataset.name,
      tableName: wsDataset.table_name || wsDataset.tableName || wsDataset.id,
      originalFileName: wsDataset.original_file_name || wsDataset.originalFileName || wsDataset.name,
      headers: wsDataset.headers || [],
      data: wsDataset.sample_data || [],
      description: wsDataset.description || '',
      isFromLibrary: true,
    };

    setDatasets(prev => [...prev, newDs]);
    setSemanticModels(prev => ({ ...prev, [wsDataset.id]: model }));
    setActiveDatasetId(wsDataset.id);
    showToast(`✨ Added "${wsDataset.name}" to report!`);
  };

  const handleImportSharedModel = (pubModel) => {
    handleImportModel(pubModel);
  };

  const [showHiddenSources, setShowHiddenSources] = React.useState(false);

  const fsaSupported = !!window.showOpenFilePicker;

  if (!showSidebar) return null;

  const visibleDatasets = datasets.filter(d => !hiddenDatasetIds.includes(d.id) || showHiddenSources);

  return (
    <div className="w-64 t-panel border-r flex flex-col z-20 shadow-lg shrink-0 h-full relative">
      <div className="flex items-center justify-between p-4 pb-0 shrink-0">
        <div className="flex items-center gap-2">
          <div className="t-accent-bg p-1.5 shadow-md" style={{ borderRadius: 'var(--theme-radius-button)' }}>
            <Sparkles size={20} />
          </div>
          <h1 className="text-xl font-extrabold t-text-main">
            M-Vantage
          </h1>
        </div>
        <button onClick={() => setShowSidebar(false)} className="t-text-muted hover:t-accent transition-colors">
            <Menu size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 pt-2">
        <div className="flex items-center justify-between mb-2">
            <h2 className="text-[10px] font-bold t-text-muted uppercase tracking-widest">Active Datasets</h2>
            {hiddenDatasetIds.length > 0 && (
                <button 
                  onClick={() => setShowHiddenSources(!showHiddenSources)} 
                  className={`text-[9px] font-bold tracking-tighter uppercase px-1.5 py-0.5 border t-border rounded transition-all ${showHiddenSources ? 't-accent-bg text-white border-transparent' : 't-text-muted hover:t-text-main'}`}
                >
                  {showHiddenSources ? 'Hide Sources' : `Show Sources (${hiddenDatasetIds.length})`}
                </button>
            )}
        </div>
        <div className="flex flex-col gap-0.5">
          {visibleDatasets.map(dataset => {
            const isHidden = hiddenDatasetIds.includes(dataset.id);
            return (
              <div key={dataset.id} className={`group flex flex-col px-3 py-2 cursor-pointer transition-all border-l-2 ${isHidden ? 'opacity-60 grayscale-[0.5]' : ''} ${activeDatasetId === dataset.id ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/5' : 'border-transparent hover:bg-black/5'}`} style={{ borderRadius: 'calc(var(--theme-radius-button) / 2)' }}>
                  <div className="flex justify-between items-center w-full" onClick={() => {setActiveDatasetId(dataset.id); setPendingRestore(null);}}>
                    <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                        <Database size={13} className={activeDatasetId === dataset.id ? 't-accent' : 't-text-muted'} />
                        {editingDatasetId === dataset.id ? (
                            <input
                              autoFocus
                              value={editingDatasetName}
                              onChange={(e) => setEditingDatasetName(e.target.value)}
                              onBlur={() => saveDatasetName(dataset.id)}
                              onKeyDown={(e) => e.key === 'Enter' && saveDatasetName(dataset.id)}
                              onClick={e => e.stopPropagation()}
                              className="w-full bg-black/10 text-xs px-2 py-0.5 outline-none t-text-main border-none"
                              style={{ border: 'none' }}
                            />
                        ) : (
                            <span className={`font-bold text-xs truncate ${activeDatasetId === dataset.id ? 't-text-main' : 't-text-muted group-hover:t-text-main'}`}>{dataset.name}{isHidden ? ' (Hidden)' : ''}</span>
                        )}
                    </div>
                    <div className={`flex items-center gap-1 transition-opacity opacity-0 group-hover:opacity-100 shrink-0 ml-1`}>
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setHiddenDatasetIds(prev => isHidden ? prev.filter(id => id !== dataset.id) : [...prev, dataset.id]);
                        }} 
                        className="p-1 rounded-md hover:bg-black/5 t-text-muted transition-colors"
                        title={isHidden ? "Unhide" : "Hide Source"}
                      >
                        <Settings2 size={12}/>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingDatasetId(dataset.id); setEditingDatasetName(dataset.name); }} className={`p-1 rounded-md hover:bg-black/5 t-text-muted transition-colors`}><Pencil size={12}/></button>
                      <button onClick={(e) => { e.stopPropagation(); handleRemoveDataset(e, dataset.id); }} className={`p-1 rounded-md hover:bg-red-50 text-red-500 transition-colors`}><Trash2 size={12}/></button>
                    </div>
                  </div>
              </div>
            );
          })}

          {/* ── Get Data (BigQuery) ── */}
          <button
            onClick={openGetDataModal}
            className="flex items-center gap-2.5 w-full text-left px-3 py-2 border border-dashed t-border t-text-muted hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)] hover:bg-black/5 transition-all cursor-pointer font-medium mt-1.5"
            style={{ borderRadius: 'var(--theme-radius-button)' }}
          >
            <CloudDownload size={16} />
            <span className="text-xs">Get Data…</span>
          </button>

          {/* Platinum Library Picker */}
          <button
            onClick={() => setIsLibraryOpen(true)}
            className="flex items-center gap-2.5 w-full text-left px-3 py-2 border t-border t-text-main font-bold hover:bg-black/5 transition-all cursor-pointer mt-1.5 shadow-sm"
            style={{ borderRadius: 'var(--theme-radius-button)', borderStyle: 'solid', borderWidth: '1px' }}
          >
            <Library size={16} className="t-accent" />
            <span className="text-xs">Pick from Library…</span>
            <span className="ml-auto text-xs opacity-30 select-none">P</span>
          </button>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2 px-1">
             <h2 className="text-[10px] font-bold t-text-muted uppercase tracking-widest flex items-center gap-1.5"><Database size={10} /> Workspace Library</h2>
          </div>
          {workspaceDatasets.length === 0 ? (
            <div className="text-[10px] t-text-muted px-3 italic py-1 opacity-60">Library is empty.</div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {workspaceDatasets.map(wsDs => {
                const isInReport = datasets.find(d => d.id === wsDs.id);
                return (
                  <div 
                    key={wsDs.id} 
                    onClick={() => handleAddWorkspaceData(wsDs)}
                    className={`group flex items-center justify-between px-3 py-1.5 cursor-pointer transition-all hover:bg-black/5 rounded-md ${isInReport ? 'opacity-50 pointer-events-none' : ''}`}
                    title={isInReport ? "Already in report" : "Add to report"}
                    style={{ borderRadius: 'calc(var(--theme-radius-button) / 2)' }}
                  >
                     <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <Database size={12} className={isInReport ? 't-accent' : 't-text-muted'} />
                        <span className="text-[11px] font-bold t-text-main truncate">{wsDs.name}</span>
                     </div>
                     {!isInReport && <Plus size={12} className="opacity-0 group-hover:opacity-100 t-accent" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2 px-1">
             <h2 className="text-[10px] font-bold t-text-muted uppercase tracking-widest flex items-center gap-1.5"><Sparkles size={10} /> Metric Library</h2>
          </div>
          {publishedModels.length === 0 ? (
            <div className="text-[10px] t-text-muted px-3 italic py-1 opacity-60">No shared models yet.</div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {publishedModels.map(model => (
                <div 
                  key={model.id} 
                  onClick={() => handleImportSharedModel(model)}
                  className="group flex flex-col px-3 py-2 cursor-pointer transition-all hover:bg-black/5 rounded-md"
                  style={{ borderRadius: 'calc(var(--theme-radius-button) / 2)' }}
                >
                   <div className="flex items-center gap-2 overflow-hidden w-full">
                      <Calculator size={12} className="t-text-muted group-hover:t-accent transition-colors" />
                      <span className="text-[11px] font-bold t-text-main truncate flex-1">{model.name}</span>
                      <Plus size={10} className="opacity-0 group-hover:opacity-100 t-accent shrink-0" />
                   </div>
                   <div className="text-[9px] t-text-muted ml-5 font-medium truncate opacity-70 group-hover:opacity-100">
                      {model.fields?.length || 0} fields • {model.isUnified ? 'Unified' : 'Single'}
                   </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      <div className="shrink-0 p-4 pt-3 border-t t-border bg-[var(--theme-panel-bg)] flex flex-col gap-2 relative z-30" style={{ borderBottomRightRadius: 'var(--theme-radius-panel)' }}>
        <div className="flex gap-2 mb-1">
          <button 
            onClick={() => setShowPortal(true)}
            className="flex-1 flex items-center justify-center gap-2 t-panel border t-border py-2 text-[10px] font-black uppercase tracking-widest hover:bg-black/5 transition-all"
            style={{ borderRadius: 'var(--theme-radius-button)' }}
          >
            <LayoutGrid size={14} /> Portal
          </button>
          <button 
            onClick={() => setUserRole(null)}
            className="px-3 flex items-center justify-center t-panel border t-border t-text-muted hover:text-red-500 hover:bg-red-50 transition-all"
            style={{ borderRadius: 'var(--theme-radius-button)' }}
            title="Sign Out"
          >
            <LogOut size={14} />
          </button>
        </div>

        <div className="t-panel p-1.5 t-border border flex items-center px-3 mb-1" style={{ borderRadius: 'var(--theme-radius-button)' }}>
            <Palette size={14} className="t-text-muted mr-2.5 shrink-0" />
            <select value={theme} onChange={e => setTheme(e.target.value)} className="bg-transparent t-text-main font-bold outline-none cursor-pointer border-none text-xs w-full h-7" style={{ border: 'none' }}>
              {Object.entries(THEMES).map(([k, v]) => <option key={k} value={k} style={{ background: 'var(--theme-panel-bg)', color: 'var(--theme-text-main)' }}>{v.name}</option>)}
            </select>
        </div>
        {activeDataset && (
          <>
            <button onClick={() => setShowSemanticModeler(!showSemanticModeler)} className="flex items-center justify-center gap-2 w-full t-button py-2 text-xs font-bold transition-colors"><Settings2 size={16} /> Edit Dictionary</button>
            <button onClick={() => setShowRelModal(true)} className="flex items-center justify-center gap-2 w-full t-button py-2 text-xs font-bold transition-colors"><LinkIcon size={16} /> Relationships</button>
            <button onClick={handleSaveReportClick} className="flex items-center justify-center gap-2 w-full t-accent-bg py-3 text-xs font-bold transition-all hover:shadow-lg hover:shadow-[var(--theme-accent)]/20 active:scale-[0.98]"><Save size={16} /> Save to Workspace</button>
          </>
        )}
      </div>
    </div>
  );
}
