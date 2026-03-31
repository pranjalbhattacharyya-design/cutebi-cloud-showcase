import React, { useState } from 'react';
import { 
  BarChart3, Folder, Plus, Search, LayoutGrid, List, 
  Settings, Users, Clock, Star, MoreVertical, 
  ChevronRight, FileText, Globe, Layers, ArrowRight,
  Database, Sparkles, Calculator, Trash2, LogOut
} from 'lucide-react';

import { useAppState } from '../../contexts/AppStateContext';
import { parseFileAsync } from '../../utils/fileParser';
import { registerCSV, registerJSON } from '../../utils/backendEngine.js';
import { generateInitModel } from '../../utils/dataParser';
import { apiClient } from '../../services/api';
import { preprocessFilesForUpload } from '../../utils/excelConverter';
import { cloudUploadFile } from '../../utils/cloudUpload';
import DataDetailsModal from '../modals/DataDetailsModal';
import ThemeSelector from '../ui/ThemeSelector';


export default function Portal() {
  const { 
    workspaces, setWorkspaces,
    folders, setFolders,
    savedReports, setSavedReports,
    workspaceDatasets,
    publishedModels,
    setShowPortal,
    currentWorkspaceId, setCurrentWorkspaceId,
    currentFolderId, setCurrentFolderId,
    isMutating, setIsMutating,
    setActiveDatasetId,
    datasets,
    setDatasets,
    handleImportModel,
    setPages,
    setActivePageId,
    setCurrentTemplateId,
    setDashboards,
    setSemanticModels,
    setRelationships,
    showToast,
    refreshData,
    user, userRole, setUserRole
  } = useAppState();

  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('reports'); // 'reports' | 'data'
  const [showCreateModal, setShowCreateModal] = useState(null); // 'workspace' | 'folder'
  const [newName, setNewName] = useState('');
  const [activePreviewDataset, setActivePreviewDataset] = useState(null);
  const [showMenuForDataset, setShowMenuForDataset] = useState(null);

  const activeWorkspace = workspaces.find(w => w.id === currentWorkspaceId);
  
  // Filter items based on active workspace/folder and search
  const currentFolders = folders.filter(f => f.workspaceId === currentWorkspaceId && (!currentFolderId || f.parentId === currentFolderId));
  const currentReports = savedReports.filter(r => {
    const inWorkspace = r.workspaceId === currentWorkspaceId || (!r.workspaceId && currentWorkspaceId === 'w_default');
    const inFolder = currentFolderId ? r.folderId === currentFolderId : !r.folderId;
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Diagnostic Trace for Visibility
    if (inWorkspace && inFolder && matchesSearch) {
        window.dispatchEvent(new CustomEvent('cutebi-debug', { 
            detail: { 
                type: 'info', 
                category: 'Portal', 
                message: `[Portal] Inspected report: "${r.name}"`, 
                details: { id: r.id, is_deleted: r.is_deleted, workspaceId: r.workspaceId } 
            } 
        }));
    }

    return inWorkspace && inFolder && matchesSearch && !r.is_deleted;
  });

  const handleCreateWorkspace = () => {
    setNewName('');
    setShowCreateModal('workspace');
  };

  const handleCreateFolder = () => {
    setNewName('');
    setShowCreateModal('folder');
  };

  const handleDeleteWorkspace = async (e, wsId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this workspace? All contents will be hidden.")) return;
    
    // Optimistic Update
    const originalWorkspaces = [...workspaces];
    setWorkspaces(prev => prev.filter(w => w.id !== wsId));
    
    setIsMutating(true);
    try {
        await apiClient.delete(`/workspaces/${wsId}`);
        // Only change the active workspace AFTER the delete is confirmed on the server
        if (currentWorkspaceId === wsId) setCurrentWorkspaceId('w_default');
        showToast("Workspace deleted.");
    } catch (err) {
        console.error(err);
        setWorkspaces(originalWorkspaces); // Rollback
        showToast("Failed to delete workspace.");
    } finally {
        setTimeout(() => setIsMutating(false), 1000); // Small cooldown
    }
  };

  const handleDeleteFolder = async (e, fId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this folder?")) return;
    
    // Optimistic Update
    const originalFolders = [...folders];
    setFolders(prev => prev.filter(f => f.id !== fId));
    
    setIsMutating(true);
    try {
        await apiClient.delete(`/folders/${fId}`);
        showToast("Folder deleted.");
    } catch (err) {
        console.error(err);
        setFolders(originalFolders); // Rollback
        showToast("Failed to delete folder.");
    } finally {
        setTimeout(() => setIsMutating(false), 1000);
    }
  };

  const handleDeleteReport = async (e, rId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this report?")) return;
    
    // Optimistic Update
    const originalReports = [...savedReports];
    setSavedReports(prev => prev.filter(r => r.id !== rId));
    
    setIsMutating(true);
    try {
        await apiClient.delete(`/reports/${rId}`);
        showToast("Report deleted.");
    } catch (err) {
        console.error(err);
        setSavedReports(originalReports); // Rollback
        showToast("Failed to delete report.");
    } finally {
        setTimeout(() => setIsMutating(false), 1000);
    }
  };

  const handleConfirmCreate = async () => {
    if (!newName.trim()) return;
    const type = showCreateModal;
    const name = newName.trim();
    
    setIsMutating(true);
    setShowCreateModal(null);
    setNewName('');

    const id = `${type === 'workspace' ? 'w' : 'f'}_${Date.now()}`;
    
    // OPTIMISTIC UPDATE: Show it on screen INSTANTLY
    if (type === 'workspace') {
      const newWs = { id, name, description: '', timestamp: Date.now() };
      setWorkspaces(prev => [...prev.filter(w => w.id !== id), newWs]);
      setCurrentWorkspaceId(id);
      showToast(`Workspace "${name}" created (Syncing...)`);
      
      // BACKGROUND SYNC
      apiClient.post('/workspaces', newWs).then(() => {
          showToast(`✨ Workspace "${name}" saved to cloud!`);
          refreshData(true);
      }).catch(err => {
          console.error("Sync failed:", err);
          showToast("Cloud sync failed. It might be local-only.");
      }).finally(() => setIsMutating(false));

    } else if (type === 'folder') {
      const newFolder = { 
        id, name, workspace_id: currentWorkspaceId, parent_id: currentFolderId, 
        workspaceId: currentWorkspaceId, parentId: currentFolderId, timestamp: Date.now() 
      };
      setFolders(prev => [...prev.filter(f => f.id !== id), newFolder]);
      showToast(`Folder "${name}" created (Syncing...)`);

      // BACKGROUND SYNC
      apiClient.post('/folders', newFolder).then(() => {
          showToast(`✨ Folder "${name}" saved to cloud!`);
          refreshData(true);
      }).catch(err => {
          console.error("Sync failed:", err);
          showToast("Cloud sync failed. It might be local-only.");
      }).finally(() => setIsMutating(false));
    }
  };

  const handleNewReport = () => {
    // Reset BI state for a new report - Full Clean Slate
    setActiveDatasetId(null);
    setDatasets([]);
    setSemanticModels({});
    setRelationships([]);
    setPages([{ id: 'page_1', name: 'Page 1' }]);
    setActivePageId('page_1');
    setCurrentTemplateId(null);
    setDashboards({});
    
    setShowPortal(false);
  };

  const openReport = (report) => {
    // In a real app, we'd restore the state from report.data
    // For now, we rely on the App.jsx logic which handles savedReports
    // We just need to trigger the restore logic. 
    // Usually this is done by setting a 'pendingRestore' or similar.
    // Let's assume the user clicks the report name in the portal.
    
    // Ensure the app knows which workspace/folder this report is in
    setCurrentWorkspaceId(report.workspaceId || 'w_default');
    setCurrentFolderId(report.folderId || null);

    // We'll dispatch a custom event or set state that App.jsx listens to
    window.dispatchEvent(new CustomEvent('cutebi-restore-report', { detail: report }));
    setShowPortal(false);
  };

  const handleWorkspaceFileUpload = async (e) => {
    const rawFiles = Array.from(e.target.files);
    if (!rawFiles.length) return;

    showToast(`🚀 Processing ${rawFiles.length} file(s)...`);
    setIsMutating(true);

    // Pre-convert any Excel files to CSV in the browser
    let files;
    try {
      files = await preprocessFilesForUpload(rawFiles, (msg) => showToast(msg));
    } catch (convErr) {
      showToast(`❌ ${convErr.message}`);
      setIsMutating(false);
      return;
    }

    // Build map: converted filename → original raw filename
    const originalNameMap = new Map(
      rawFiles.map((raw, i) => [files[i]?.name, raw.name])
    );

    for (const file of files) {
      const originalName = originalNameMap.get(file.name) || file.name;
      try {
        // Direct upload: browser → Supabase (no Vercel relay, no timeout)
        const cloudRes = await cloudUploadFile(file, originalName, (msg) => showToast(msg));

        if (!cloudRes || !cloudRes.id) {
          throw new Error(cloudRes?.message || 'Cloud ingestion returned no dataset ID');
        }

        const { id: dsId, headers } = cloudRes;
        const dsName = dsId;

        // Register in Workspace Dataset Library
        await apiClient.post('/workspace-datasets', {
          id: dsId,
          name: dsName,
          workspace_id: currentWorkspaceId,
          folder_id: currentFolderId || null,
          table_name: dsId,
          headers: headers || [],
          description: `Uploaded from ${originalName}`
        });

        showToast(`✨ "${dsName}" uploaded & stored in cloud!`);

      } catch (err) {
        console.error('Cloud upload failed:', err);
        showToast(`❌ Failed to upload ${originalName}: ${err.message}`);
      }
    }

    // Refresh workspace state so Data Library grid and sidebar update immediately
    await refreshData(true);
    setIsMutating(false);
  };


  const handleDeleteWorkspaceDataset = async (e, dsId) => {
    e.stopPropagation();
    if (!window.confirm("Remove this dataset from the workspace library?")) return;
    
    setIsMutating(true);
    try {
        await apiClient.delete(`/workspace-datasets/${dsId}`);
        showToast("Dataset removed from library.");
        refreshData(); 
    } catch (err) {
        console.error(err);
        showToast("Failed to remove dataset.");
    } finally {
        setTimeout(() => setIsMutating(false), 1000);
        setShowMenuForDataset(null);
    }
  };

  const isViewer = userRole === 'viewer';

  return (
    <div className="fixed inset-0 z-50 bg-[var(--theme-app-bg)] flex flex-col font-sans overflow-hidden transition-colors duration-500">
      
      {/* Portal Header */}
      <header className="shrink-0 t-panel border-b t-border px-8 py-4 flex items-center justify-between shadow-sm z-30 transition-all">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setShowPortal(false)}>
            <div className="t-accent-bg p-2 rounded-xl shadow-lg shadow-[var(--theme-accent)]/10 group-hover:scale-110 transition-all duration-500">
              <LayoutGrid size={20} className="text-white" />
            </div>
            <span className="text-xl font-black tracking-tighter t-text-main">CuteBI <span className="t-accent font-medium">Portal</span></span>
          </div>
          
          <nav className="flex items-center h-full ml-4">
            <button 
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 text-sm font-bold transition-all relative ${activeTab === 'reports' ? 't-text-main border-b-2 border-[var(--theme-accent)]' : 't-text-muted hover:t-text-main'}`}
            >
              Reports & Folders
            </button>
            {!isViewer && (
              <>
                <button 
                  onClick={() => setActiveTab('data')}
                  className={`px-4 py-2 text-sm font-bold transition-all relative ${activeTab === 'data' ? 't-text-main border-b-2 border-[var(--theme-accent)]' : 't-text-muted hover:t-text-main'}`}
                >
                  Data Library
                </button>
                <button 
                  onClick={() => setActiveTab('metrics')}
                  className={`px-4 py-2 text-sm font-bold transition-all relative ${activeTab === 'metrics' ? 't-text-main border-b-2 border-[var(--theme-accent)]' : 't-text-muted hover:t-text-main'}`}
                >
                  Metric Library
                </button>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 bg-black/5 px-3 py-1.5 rounded-full border t-border">
            <Search size={14} className="t-text-muted" />
            <input 
              type="text" 
              placeholder="Search resources..." 
              className="bg-transparent border-none outline-none text-xs t-text-main w-40"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 bg-black/5 px-3 py-1.5 rounded-xl border t-border">
            <div className={`w-2 h-2 rounded-full animate-pulse ${datasets.length > 0 || workspaces.length > 1 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest t-text-muted">Cloud: {datasets.length > 0 || workspaces.length > 1 ? 'Synced' : 'Connecting'}</span>
          </div>

          {!isViewer && (
            <button 
              onClick={handleNewReport}
              className="t-accent-bg text-white px-5 py-2 rounded-xl text-xs font-black shadow-lg shadow-[var(--theme-accent)]/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              <Plus size={16} /> New Report
            </button>
          )}

          <button 
            onClick={() => setUserRole(null)}
            className="p-2.5 rounded-xl border t-border t-text-muted hover:text-red-500 hover:bg-red-50 transition-all group mr-2"
            title="Switch Role / Sign Out"
          >
            <LogOut size={18} className="group-hover:rotate-12 transition-transform" />
          </button>

          <ThemeSelector />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Sidebar (Workspaces) */}
        <aside className="w-64 t-panel border-r t-border flex flex-col shrink-0 overflow-y-auto p-4 gap-2">
            <div className="text-[10px] font-black t-text-muted uppercase tracking-widest px-3 mb-2 mt-4 flex justify-between items-center">
              <span>Workspaces</span>
              {!isViewer && <button onClick={handleCreateWorkspace} className="hover:t-accent transition-colors"><Plus size={14}/></button>}
            </div>
            {workspaces.map(ws => (
              <NavItem 
                key={ws.id} 
                icon={<Layers size={18} />} 
                label={ws.name} 
                active={currentWorkspaceId === ws.id} 
                onClick={() => { setCurrentWorkspaceId(ws.id); setCurrentFolderId(null); }} 
                onDelete={ws.id !== 'w_default' && !isViewer ? (e) => handleDeleteWorkspace(e, ws.id) : null}
              />
            ))}
        </aside>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto p-8 pt-6">
            
            {/* Breadcrumbs / Header */}
            <div className="flex items-center gap-1.5 mb-8 text-xs font-black tracking-widest uppercase">
              <button 
                onClick={() => { setCurrentWorkspaceId(currentWorkspaceId); setCurrentFolderId(null); }}
                className={`transition-colors ${!currentFolderId ? 't-text-main' : 't-text-muted hover:t-text-main'}`}
              >
                {workspaces.find(w => w.id === currentWorkspaceId)?.name || 'My Workspace'}
              </button>
              
              {currentFolderId && (
                <>
                  <ChevronRight size={14} className="t-text-muted opacity-50" />
                  <span className="t-text-main">
                    {folders.find(f => f.id === currentFolderId)?.name || 'Folder'}
                  </span>
                </>
              )}
            </div>

          <div className="max-w-7xl mx-auto">
            {activeTab === 'reports' ? (
              <>
                {/* Folder Section */}
                {!searchQuery && (
                  <div className="mb-10">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-bold t-text-main flex items-center gap-2">
                        <Folder className="t-accent" size={20} /> Folders
                      </h2>
                      {!isViewer && (
                        <button onClick={handleCreateFolder} className="flex items-center gap-1 text-[10px] font-black t-accent px-3 py-1 bg-black/5 rounded-full hover:bg-black/10 transition-all uppercase tracking-widest">
                          <Plus size={12} /> New Folder
                        </button>
                      )}
                    </div>
                    
                    {currentFolders.length === 0 ? (
                      <p className="text-xs t-text-muted italic px-2">
                        {currentFolderId ? 'No folders under this Folder.' : 'No folders in this Workspace.'}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {currentFolders.map(folder => (
                          <div 
                            key={folder.id} 
                            onClick={() => setCurrentFolderId(folder.id)}
                            className="group p-4 t-panel border t-border rounded-xl hover:border-[var(--theme-accent)] hover:shadow-2xl hover:shadow-[var(--theme-accent)]/5 cursor-pointer transition-all flex items-center gap-4"
                            style={{ borderRadius: 'var(--theme-radius-panel)' }}
                          >
                            <div className="w-12 h-12 bg-black/5 rounded-lg flex items-center justify-center t-accent group-hover:bg-black/10 transition-colors">
                              <Folder size={24} className="opacity-60" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm t-text-main truncate">{folder.name}</div>
                              <div className="text-[10px] t-text-muted uppercase font-black tracking-tighter">Folder</div>
                            </div>
                            {!isViewer && (
                              <button 
                                onClick={(e) => handleDeleteFolder(e, folder.id)}
                                className="opacity-0 group-hover:opacity-100 p-2 t-text-muted hover:text-red-500 transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Reports Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold t-text-main flex items-center gap-2">
                      <FileText className="t-accent" size={20} /> Reports
                    </h2>
                    <div className="flex items-center gap-2">
                      {!isViewer && (
                        <button 
                          onClick={handleNewReport}
                          className="flex items-center gap-1 text-[10px] font-black bg-black/5 t-accent px-4 py-1.5 rounded-full hover:bg-black/10 transition-all uppercase tracking-widest shadow-sm"
                        >
                          <Plus size={14} /> New Report
                        </button>
                      )}
                      <div className="flex items-center bg-black/5 rounded-lg p-1 border t-border">
                          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 't-panel shadow-sm t-accent' : 't-text-muted'}`}><LayoutGrid size={16}/></button>
                          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 't-panel shadow-sm t-accent' : 't-text-muted'}`}><List size={16}/></button>
                      </div>
                    </div>
                  </div>

                  {currentReports.length === 0 ? (
                    <div className="bg-black/5 border-2 border-dashed t-border rounded-2xl py-20 text-center flex flex-col items-center">
                       <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center t-text-muted mb-4">
                          <FileText size={32} />
                       </div>
                       <h3 className="font-bold t-text-main">No reports found</h3>
                       <p className="text-sm t-text-muted mt-1 mb-6">Create a new report to start exploring your data.</p>
                       {!isViewer && (
                        <button onClick={handleNewReport} className="t-panel border t-border t-text-main px-6 py-2 rounded-full text-sm font-bold shadow-sm hover:shadow-md transition-all">Start Designing</button>
                       )}
                    </div>
                  ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {currentReports.map(report => (
                        <div 
                          key={report.id} 
                          onClick={() => openReport(report)}
                          className="group t-panel border t-border rounded-2xl overflow-hidden hover:border-[var(--theme-accent)] hover:shadow-2xl hover:shadow-[var(--theme-accent)]/10 cursor-pointer transition-all flex flex-col"
                          style={{ borderRadius: 'var(--theme-radius-panel)' }}
                        >
                          <div className="h-32 bg-black/5 flex items-center justify-center relative overflow-hidden">
                             <BarChart3 size={40} className="t-text-muted opacity-30 group-hover:opacity-100 group-hover:t-accent transition-all group-hover:scale-110 duration-500" />
                             <div className="absolute inset-0 bg-[var(--theme-accent)]/0 group-hover:bg-[var(--theme-accent)]/5 transition-colors" />
                          </div>
                          <div className="p-4 flex-1 flex flex-col">
                            <div className="flex items-start justify-between mb-1">
                              <div className="font-black text-sm t-text-main truncate pr-4">{report.name}</div>
                              {!isViewer && (
                                <button 
                                  onClick={(e) => handleDeleteReport(e, report.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1 t-text-muted hover:text-red-500 transition-all"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                            <div className="text-[10px] t-text-muted font-bold flex items-center gap-2 mb-4">
                                <Clock size={10} /> {new Date(report.timestamp || Date.now()).toLocaleDateString()}
                            </div>
                            <div className="mt-auto pt-4 border-t t-border flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase t-accent opacity-60 tracking-wider">Report</span>
                                <ArrowRight size={14} className="t-accent opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="t-panel border t-border rounded-2xl overflow-hidden divide-y t-border shadow-sm">
                       {currentReports.map(report => (
                          <div 
                            key={report.id} 
                            onClick={() => openReport(report)}
                            className="p-4 flex items-center hover:bg-black/5 cursor-pointer transition-colors group"
                          >
                             <div className="w-10 h-10 bg-black/5 rounded-lg flex items-center justify-center t-accent mr-4">
                                <FileText size={20} />
                             </div>
                             <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm t-text-main">{report.name}</div>
                                <div className="text-[10px] t-text-muted capitalize">{report.workspaceId ? workspaces.find(w=>w.id === report.workspaceId)?.name : 'My Workspace'}</div>
                             </div>
                             <div className="hidden sm:block text-xs t-text-muted mr-10">{new Date(report.timestamp || Date.now()).toLocaleDateString()}</div>
                             <ArrowRight size={14} className="t-accent opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all mr-2" />
                             {!isViewer && (
                               <button 
                                 onClick={(e) => handleDeleteReport(e, report.id)}
                                 className="opacity-0 group-hover:opacity-100 p-2 t-text-muted hover:text-red-500 transition-all"
                               >
                                 <Trash2 size={16} />
                               </button>
                             )}
                          </div>
                       ))}
                    </div>
                  )}
                </div>
              </>
            ) : activeTab === 'data' ? (
              <div className="animate-in fade-in duration-500">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold t-text-main flex items-center gap-2">
                    <Database className="t-accent" size={20} /> Shared Data Library
                  </h2>
                </div>

                {workspaceDatasets.length === 0 ? (
                  <div className="bg-black/5 border-2 border-dashed t-border rounded-2xl py-20 text-center flex flex-col items-center">
                    <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center t-text-muted mb-4">
                      <Database size={32} />
                    </div>
                    <h3 className="font-bold t-text-main">No shared data yet</h3>
                    <p className="text-sm t-text-muted mt-1 mb-6">Upload datasets to the workspace so multiple reports can use them.</p>
                    <label className="bg-emerald-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all cursor-pointer">
                      Upload Workspace Data
                      <input type="file" multiple className="hidden" accept=".csv,.txt,.xlsx,.xls" onChange={handleWorkspaceFileUpload} />
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {workspaceDatasets.map(ds => (
                       <div key={ds.id} onClick={() => setActivePreviewDataset(ds)} className="group t-panel border t-border rounded-2xl p-5 hover:border-emerald-400 hover:shadow-2xl hover:shadow-emerald-500/5 transition-all cursor-pointer" style={{ borderRadius: 'var(--theme-radius-panel)' }}>
                          <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-black/5 rounded-xl t-accent">
                               <Database size={24} />
                            </div>
                            {!isViewer && (
                              <div className="relative">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setShowMenuForDataset(showMenuForDataset === ds.id ? null : ds.id); }}
                                    className="p-1 hover:bg-black/10 rounded transition-colors"
                                >
                                    <MoreVertical size={16} className="t-text-muted" />
                                </button>
                                {showMenuForDataset === ds.id && (
                                    <div className="absolute right-0 mt-2 w-48 t-panel border t-border rounded-xl shadow-xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in duration-100">
                                        <button 
                                            onClick={(e) => handleDeleteWorkspaceDataset(e, ds.id)}
                                            className="w-full text-left px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"
                                        >
                                            <Trash2 size={14} /> Remove from Library
                                        </button>
                                    </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="font-black t-text-main mb-1 truncate">{ds.name}</div>
                          <div className="text-xs t-text-muted mb-4 line-clamp-2">{ds.description || 'Enterprise-ready dataset shared in workspace.'}</div>
                          <div className="flex items-center justify-between pt-4 border-t t-border">
                             <div className="text-[10px] t-text-muted font-bold flex items-center gap-2">
                                <Clock size={10} /> {new Date(ds.timestamp || Date.now()).toLocaleDateString()}
                             </div>
                             <button className="text-xs font-bold t-accent hover:opacity-80 flex items-center gap-1 transition-opacity">
                                Details <ArrowRight size={12} />
                             </button>
                          </div>
                       </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
                <div className="animate-in fade-in duration-500">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold t-text-main flex items-center gap-2">
                      <Sparkles className="t-accent" size={20} /> Metric Library
                    </h2>
                  </div>
                  {publishedModels.length === 0 ? (
                    <div className="bg-black/5 border-2 border-dashed t-border rounded-2xl py-20 text-center flex flex-col items-center">
                      <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center t-text-muted mb-4">
                        <Sparkles size={32} />
                      </div>
                      <h3 className="font-bold t-text-main">No shared models yet</h3>
                      <p className="text-sm t-text-muted mt-1 mb-6">Publish curated models from the BI tool to make them available here.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {publishedModels.map(model => (
                        <div key={model.id} className="t-panel border t-border rounded-2xl p-5 hover:border-[var(--theme-accent)] hover:shadow-2xl hover:shadow-[var(--theme-accent)]/5 transition-all group" style={{ borderRadius: 'var(--theme-radius-panel)' }}>
                          <div className="flex items-start justify-between mb-4">
                            <div className="p-3 bg-black/5 rounded-xl t-accent">
                               <Calculator size={24} />
                            </div>
                            <span className="text-[10px] font-black px-2 py-1 bg-black/5 t-text-muted rounded uppercase tracking-tighter">
                               {model.isUnified ? 'Unified' : 'Single Table'}
                            </span>
                          </div>
                          <div className="font-black t-text-main mb-1 truncate">{model.name}</div>
                          <div className="text-xs t-text-muted mb-4 line-clamp-2">{model.description || 'Enterprise-grade semantic model.'}</div>
                          <div className="flex items-center justify-between pt-4 border-t t-border">
                             <div className="text-[10px] t-text-muted font-bold uppercase tracking-tighter">
                                {new Date(model.timestamp || Date.now()).toLocaleDateString()}
                             </div>
                             <button 
                                onClick={() => handleImportModel(model)}
                                className="text-xs font-bold t-accent hover:opacity-80 flex items-center gap-1 transition-opacity"
                             >
                                Import to Report <ArrowRight size={12} />
                             </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
            )}
          </div>
        </main>
      </div>

      {showCreateModal && !isViewer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="t-panel rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 border t-border" style={{ borderRadius: 'var(--theme-radius-panel)' }}>
            <div className="px-6 py-5 border-b t-border flex items-center justify-between">
              <h3 className="text-lg font-bold t-text-main">
                {showCreateModal === 'workspace' ? 'Create New Workspace' : 'Create New Folder'}
              </h3>
              <button onClick={() => setShowCreateModal(null)} className="t-text-muted hover:t-accent transition-colors">
                 <Plus size={20} className="rotate-45" />
              </button>
            </div>
            
            <div className="p-6">
              <label className="block text-xs font-bold t-text-muted uppercase tracking-wider mb-2">
                {showCreateModal === 'workspace' ? 'Workspace Name' : 'Folder Name'}
              </label>
              <input 
                type="text"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreate()}
                placeholder={showCreateModal === 'workspace' ? "e.g. Sales Department" : "e.g. Q1 Reports"}
                className="w-full px-4 py-3 bg-black/5 border t-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)] transition-all t-text-main placeholder:opacity-30"
                style={{ borderRadius: 'var(--theme-radius-button)' }}
              />
              <p className="mt-3 text-[11px] t-text-muted font-medium opacity-70">
                {showCreateModal === 'workspace' 
                  ? "Workspaces help you organize reports and shared data for specific teams." 
                  : "Folders help you group related reports within a workspace."}
              </p>
            </div>
            
            <div className="px-6 py-4 bg-black/5 flex items-center justify-end gap-3">
              <button 
                onClick={() => setShowCreateModal(null)}
                className="px-4 py-2 text-sm font-bold t-text-muted hover:t-text-main transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmCreate}
                disabled={!newName.trim()}
                className="px-6 py-2 t-accent-bg text-white rounded-lg text-sm font-bold shadow-lg shadow-[var(--theme-accent)]/30 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
                style={{ borderRadius: 'var(--theme-radius-button)' }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <DataDetailsModal 
        isOpen={!!activePreviewDataset}
        onClose={() => setActivePreviewDataset(null)}
        dataset={activePreviewDataset}
        isAlreadyImported={datasets.some(d => d.id === activePreviewDataset?.id)}
        onImport={(ds) => {
            window.dispatchEvent(new CustomEvent('cutebi-import-dataset', { detail: ds }));
            setActivePreviewDataset(null);
            setShowPortal(false);
        }}
      />
    </div>
  );
}

function NavItem({ icon, label, active, onClick, onDelete }) {
  return (
    <div 
      onClick={onClick}
      className={`
        flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all group
        ${active 
          ? 'bg-black/10 t-text-main font-bold shadow-sm' 
          : 't-text-muted hover:bg-black/5 hover:t-text-main'}
      `}
    >
      <span className={`${active ? 't-accent' : 't-text-muted group-hover:t-text-main'}`}>{icon}</span>
      <span className="text-sm truncate">{label}</span>
      {onDelete && (
        <button 
          onClick={onDelete}
          className="ml-auto opacity-0 group-hover:opacity-100 p-1 t-text-muted hover:text-red-500 transition-all"
        >
          <Trash2 size={14} />
        </button>
      )}
      {active && !onDelete && <div className="w-1.5 h-1.5 t-accent-bg rounded-full ml-auto" />}
    </div>
  );
}
