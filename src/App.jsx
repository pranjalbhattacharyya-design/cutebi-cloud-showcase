import React, { useState, useCallback, useEffect } from 'react'
import DebugPanel from './components/ui/debug/DebugPanel'
import { AppStateProvider, useAppState } from './contexts/AppStateContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { THEMES } from './utils/themeEngine'
import { parseFileAsync } from './utils/fileParser'
import { syncSemanticModels } from './utils/semanticSync'
import { registerCSV, registerJSON } from './utils/duckdb.js'
import { generateInitModel, patchModels } from './utils/dataParser'
import { storeHandle, deleteHandle, getHandlesForDatasets, requestReadPermission } from './utils/fileHandleStore'
import { apiClient } from './services/api'


import Sidebar from './components/layout/Sidebar'
import DashboardGrid from './components/dashboard/DashboardGrid'
import AIInterface from './components/copilot/AIInterface'
import ThemeSelector from './components/ui/ThemeSelector'

import CategoryModal from './components/ui/modals/CategoryModal'
import MeasureBuilderModal from './components/ui/modals/MeasureBuilderModal'
import ChartBuilderModal from './components/ui/modals/ChartBuilderModal'
import RelationshipsModal from './components/ui/modals/RelationshipsModal'
import SemanticModeler from './components/ui/modals/SemanticModeler'
import Portal from './components/portal/Portal'
import LandingPage from './components/auth/LandingPage'
import { Sparkles, MessageCircleHeart, X, Loader2, RotateCcw, Database, ArrowLeft, UploadCloud, Menu, LayoutGrid, Library, LogOut } from 'lucide-react'
import LibraryModal from './components/modals/LibraryModal'

import { useAI } from './hooks/useAI'
import { useDataEngine } from './hooks/useDataEngine'

function AppContent() {
  const {
    user, userRole, setUserRole,
    showSidebar, setShowSidebar, theme, setTheme,
    showSemanticModeler, showBuilder, showCategoryModal, showMeasureBuilder, showRelModal,
    activeDatasetId, setActiveDatasetId, activeDataset, datasets, setDatasets,
    reportToDelete, setReportToDelete,
    showSaveModal, setShowSaveModal,
    currentTemplateId, setCurrentTemplateId, reportNameInput, setReportNameInput,
    dashboards, setDashboards, activePageId, setActivePageId, semanticModels, setSemanticModels, globalFilters, setGlobalFilters, relationships, setRelationships, pages, setPages,
    slicers, setSlicers, categories, setCategories,
    toastMessage, showToast, isExploreOpen, setIsExploreOpen, savedReports, setSavedReports,
    chatInput, aiMode, pendingAIAction, setPendingAIAction, exploreHistory, setExploreHistory,
    pendingRestore, setPendingRestore,
    editingDatasetName, setEditingDatasetId, editingPageName, setEditingPageId, editingSlicerTitle, setEditingSlicerId,
    isUploading, setIsUploading, dragActive, setDragActive,
    isThinking,
    showPortal, setShowPortal,
    currentWorkspaceId, setCurrentWorkspaceId, currentFolderId, setCurrentFolderId,
    workspaces,
    refreshData, setIsMutating,
    isLibraryOpen, setIsLibraryOpen, importLibraryDataset
  } = useAppState()

  const { handleGenerateInfographic, executeExploreDataLogic, handleAutoFillDescriptions } = useAI()
  const { getUniqueValuesForDim } = useDataEngine()

  const handleAskAI = async (e) => {
    e?.preventDefault()
    if (!chatInput) return;
    const apiKey = ""; // Should be injected via environment variables
    await executeExploreDataLogic(chatInput, aiMode, apiKey);
  }

  const handleConfirmPendingAI = () => {
    if (!pendingAIAction || !activeDatasetId) return;
    
    // Add measures to active dataset
    const updatedSm = [...(semanticModels[activeDatasetId] || [])];
    pendingAIAction.measures.forEach(m => {
        if (!updatedSm.find(x => x.id === m.id)) {
            updatedSm.push({
                ...m,
                originDatasetId: activeDatasetId,
                originFieldId: m.id,
                category: 'Generated Measures'
            });
        }
    });

    setSemanticModels(p => ({...p, [activeDatasetId]: updatedSm}));

    const mappedCharts = (pendingAIAction.charts || []).map(c => ({
        id: `ai_${Date.now()}_${Math.random()}`,
        datasetId: activeDatasetId,
        ...c
    }));

    setExploreHistory(prev => [...prev, { role: 'ai', text: pendingAIAction.text, charts: mappedCharts }]);

    if (aiMode === 'build' && mappedCharts.length > 0) {
        const newPageId = `page_ai_${Date.now()}`;
        setPages(prev => [...prev, { id: newPageId, name: 'Generated Dashboard' }]);
        setDashboards(prev => ({ ...prev, [newPageId]: mappedCharts.map(c => ({...c, size: 'half', verticalSize: 'normal'})) }));
        showToast("✨ Generated Dashboard!");
    }

    setPendingAIAction(null);
  }

  const handlePinChart = (chart) => {
    // pin chart logic
  }

  const handleRemoveDataset = (e, dsId) => {
    e.stopPropagation();
    setDatasets(prev => prev.filter(d => d.id !== dsId));
    deleteHandle(dsId); // Clean up any stored file handle
    setSemanticModels(prev => { const next = {...prev}; delete next[dsId]; return next; });
    setGlobalFilters(prev => {
        const next = {};
        Object.entries(prev).forEach(([originKey, vals]) => {
             if (!originKey.startsWith(`${dsId}::`)) {
                 next[originKey] = vals;
             }
        });
        return next;
    });
    setDashboards(prev => {
        const next = {};
        Object.keys(prev).forEach(pageId => {
           next[pageId] = prev[pageId].filter(c => c.datasetId !== dsId);
        });
        return next;
    });
    setRelationships(prev => prev.filter(r => r.fromDatasetId !== dsId && r.toDatasetId !== dsId));
    if (activeDatasetId === dsId) {
        const remaining = datasets.filter(d => d.id !== dsId);
        setActiveDatasetId(remaining.length > 0 ? remaining[0].id : null);
    }
    showToast("Dataset removed! 🗑️");
  };

  const saveDatasetName = (dsId) => {
     if (!editingDatasetName.trim()) { setEditingDatasetId(null); return; }
     setDatasets(prev => prev.map(d => d.id === dsId ? { ...d, name: editingDatasetName.trim() } : d));
     setEditingDatasetId(null);
  };

  const savePageName = (pageId) => {
     if (!editingPageName.trim()) { setEditingPageId(null); return; }
     setPages(prev => prev.map(p => p.id === pageId ? { ...p, name: editingPageName.trim() } : p));
     setEditingPageId(null);
  };

  const saveSlicerTitle = (sId) => {
     if (!editingSlicerTitle.trim()) { setEditingSlicerId(null); return; }
     setSlicers(prev => prev.map(s => s.id === sId ? { ...s, title: editingSlicerTitle.trim() } : s));
     setEditingSlicerId(null);
  };

  /** Opens files via File System Access API (showOpenFilePicker) and stores handles for auto-reload */
  const handleOpenFiles = async () => {
    if (!window.showOpenFilePicker) {
      showToast('Your browser does not support persistent file handles. Use Chrome/Edge.');
      return;
    }
    let fileHandles;
    try {
      fileHandles = await window.showOpenFilePicker({
        multiple: true,
        types: [
          { description: 'Data Files', accept: { 'text/csv': ['.csv', '.txt'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xls'] } }
        ]
      });
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Could not open file picker.');
      return;
    }
    // Process picked files exactly like handleFileUpload, but also store handles
    const fakeEvent = { target: { files: await Promise.all(fileHandles.map(h => h.getFile())), value: '' }, dataTransfer: null };
    // Store handles BEFORE upload so dsId pairing works after re-mapping
    const pendingHandles = fileHandles; // will be matched by index after processing
    await handleFileUpload(fakeEvent, pendingHandles);
  };

  /** Auto-reload all datasets for a template using metadata-first (backend) approach */
  const handleAutoLoadTemplate = async (report) => {
    setIsUploading(true);
    setIsMutating(true);
    
    try {
      // 1. Structural Unwrapping & Deep Fetch
      // If the report is a summary (no visuals), fetch the full definition by ID
      let rData = report.data || report;
      const reportId = report.id || rData.id;
      const reportName = report.name || rData.name || "Untitled Report";

      if (!rData.dashboards && !rData.datasetsMeta) {
          window.dispatchEvent(new CustomEvent('cutebi-debug', { 
             detail: { type: 'info', category: 'Restore', message: `[${Date.now()}] Summary detected. Fetching full report detail from backend...` } 
          }));
          const results = await apiClient.get(`/reports?id=${reportId}`);
          
          // Strict ID Search: Protect against backend returning the wrong item from a collection.
          // This ensures that even if the backend ignores the search filter, we pick your ACTUAL report.
          const fullReport = Array.isArray(results) 
                             ? results.find(r => r.id === reportId) 
                             : (results?.id === reportId ? results : null);
          
          if (fullReport) {
              // Schema-Agnostic Unwrapping: Use root visuals if 'data' is missing or empty.
              const nestedData = fullReport.data;
              const isNested = nestedData && (nestedData.dashboards || nestedData.datasetsMeta);
              rData = isNested ? nestedData : fullReport;

              window.dispatchEvent(new CustomEvent('cutebi-debug', { 
                  detail: { 
                      type: 'success', 
                      category: 'Restore', 
                      message: `[${Date.now()}] Full report metadata retrieved!`,
                      details: { 
                         id: rData.id,
                         hasDashboards: !!rData.dashboards,
                         pageCount: Object.keys(rData.dashboards || {}).length
                      }
                  } 
              }));
          }
      }

       const t_start = Date.now();
       window.dispatchEvent(new CustomEvent('cutebi-debug', { 
          detail: { 
              type: 'info', 
              category: 'Restore', 
              message: `[${t_start}] Click captured: Hydrating "${reportName}"`,
              details: { 
                  receivedObjectKeys: Object.keys(rData || {}),
                  hasDashboards: !!(rData.dashboards),
                  hasDatasetsMeta: !!(rData.datasetsMeta),
                  rawReport: rData
              }
          } 
       }));

      // 1. Establish Workspace Context first
      // --- WORKSPACE ALIGNMENT ---
      // If the report belongs to a different workspace/folder, align the app state immediately.
      // This ensures that the Library and Semantic Dictionary correctly resolve the artifacts.
      if (rData.workspaceId && rData.workspaceId !== currentWorkspaceId) {
          setCurrentWorkspaceId(rData.workspaceId);
      }
      if (rData.folderId !== undefined && (rData.folderId || rData.folder_id) !== currentFolderId) {
          setCurrentFolderId(rData.folderId || rData.folder_id || null);
      }
      // Some backend objects use 'workspace_id', some use 'workspaceId'
      const targetWsId = rData.workspaceId || rData.workspace_id || report.workspaceId || report.workspace_id;
      const targetFId = rData.folderId || rData.folder_id || report.folderId || report.folder_id;
      
      if (targetWsId) setCurrentWorkspaceId(targetWsId);
      if (targetFId) setCurrentFolderId(targetFId);
      setCurrentTemplateId(reportId);
      setPendingRestore(null);

      // 2. Synchronous Library Refresh
      const refreshResult = await refreshData(true, targetWsId);

      // 2. Metadata Reconstruction
      // Primary: use datasetsMeta from the saved report.
      // Fallback 1: derive from semanticModels keys if datasetsMeta is missing.
      // Fallback 2 (below): supplement with any referenced IDs not in datasetsMeta.
      let dsMeta = rData.datasetsMeta || [];
      if (dsMeta.length === 0 && rData.semanticModels) {
          const derivedIds = Object.keys(rData.semanticModels);
          dsMeta = derivedIds.map(id => ({
              id: id,
              name: id.startsWith('ds_') ? id.substring(3) : id,
              headers: [],
              description: 'Reconstructed from model'
          }));
      }

      // 3. Hydrate Datasets State (Smart Lineage Mapping)
      // Normalize backend snake_case fields to camelCase so tableName etc. resolve correctly.
      const rawPool = refreshResult?.ds || [];
      const libraryPool = rawPool.map(d => ({
          ...d,
          tableName:        d.table_name        || d.tableName        || d.id,
          originalFileName: d.original_file_name || d.originalFileName || d.name,
          isFromLibrary: true,
      }));

      // Supplement dsMeta: find any dataset IDs referenced by semanticModels or dashboard
      // charts that are missing from datasetsMeta. This recovers reports that were saved
      // with an incomplete datasetsMeta (e.g. after a manual dedup while library injection
      // was compensating for missing data).
      const dsMetaIds = new Set(dsMeta.map(m => m.id));
      const allReferencedIds = new Set([
          ...dsMetaIds,
          ...Object.keys(rData.semanticModels || {}),
      ]);
      Object.values(rData.dashboards || {}).forEach(charts => {
          (charts || []).forEach(c => { if (c.datasetId) allReferencedIds.add(c.datasetId); });
      });
      allReferencedIds.forEach(id => {
          if (!dsMetaIds.has(id)) {
              const fromLib = libraryPool.find(d => d.id === id || d.tableName === id);
              if (fromLib) {
                  window.dispatchEvent(new CustomEvent('cutebi-debug', {
                      detail: { type: 'info', category: 'Lineage', message: `Supplementing dsMeta with library dataset "${fromLib.name}" (id: ${id})` }
                  }));
                  dsMeta.push({
                      id: fromLib.id,
                      name: fromLib.name,
                      tableName: fromLib.tableName,
                      headers: fromLib.headers || [],
                      description: fromLib.description || '',
                      originalFileName: fromLib.originalFileName || fromLib.name,
                  });
                  dsMetaIds.add(fromLib.id);
              }
          }
      });

      window.dispatchEvent(new CustomEvent('cutebi-debug', { 
          detail: { 
              type: 'info', 
              category: 'Lineage', 
              message: `[${Date.now()}] Mapping report artifacts. Library size: ${libraryPool.length}, dsMeta size: ${dsMeta.length}`,
              details: { 
                  artifacts: dsMeta.map(m => ({id: m.id, name: m.name})),
                  pool: libraryPool.map(d => ({id: d.id, name: d.name}))
              }
          } 
      }));

      const restoredDatasets = dsMeta.map(m => {
        const existing = libraryPool.find(d => 
            d.id === m.id || 
            d.name === m.name || 
            d.originalFileName === (m.originalFileName || m.name) ||
            d.tableName === m.tableName ||
            d.tableName === m.id
        );

        if (existing) {
            window.dispatchEvent(new CustomEvent('cutebi-debug', { 
                detail: { type: 'success', category: 'Lineage', message: `Mapped "${m.name}" → library "${existing.id}"` } 
            }));
        }

        return {
          id: existing?.id || m.id,
          name: m.name,
          // Prefer library's normalized tableName, then saved meta, then id as last resort
          tableName: existing?.tableName || m.tableName || m.id,
          originalFileName: m.originalFileName || existing?.originalFileName || m.name,
          headers: m.headers?.length > 0 ? m.headers : (existing?.headers || []),
          description: m.description || existing?.description || '',
          data: existing?.data || [],
          isFromLibrary: true,
        };
      });

      const patchedModels = patchModels(rData.semanticModels || {});
      setSemanticModels(patchedModels);
      setRelationships(rData.relationships || []);

      if (restoredDatasets.length > 0) {
          setDatasets(restoredDatasets);   // Replace entirely — clean slate for this report
          setActiveDatasetId(restoredDatasets[0].id);
      }
      
      setDashboards(rData.dashboards || {});
      if (rData.pages) setPages(rData.pages);
      if (rData.pages?.length > 0) setActivePageId(rData.pages[0].id);
      if (rData.slicers) setSlicers(rData.slicers);
      if (rData.categories) setCategories(rData.categories);

      window.dispatchEvent(new CustomEvent('cutebi-debug', { 
          detail: { 
              type: 'success', 
              category: 'Restore', 
              message: `[${Date.now()}] State Injection Complete. Dashboard size: ${Object.keys(rData.dashboards || {}).length} pages.` 
          } 
      }));

      // 4. Parallel Local Handle Restoration (If possible)
      if (window.showOpenFilePicker && dsMeta.length > 0) {
          const datasetIds = dsMeta.map(m => m.id);
          const handles = await getHandlesForDatasets(datasetIds);
          for (const [dsId, handle] of Object.entries(handles)) {
            try {
              const granted = await requestReadPermission(handle);
              if (granted) {
                const file = await handle.getFile();
                const parsed = await parseFileAsync(file);
                if (parsed) {
                  setDatasets(prev => prev.map(d => d.id === dsId ? { ...d, data: parsed.data } : d));
                }
              }
            } catch (err) { console.warn(`Local handle failed for ${dsId}:`, err); }
          }
      }

      showToast(`✨ "${reportName}" restored!`);
    } catch (e) {
      console.error("Report restoration failed:", e);
      showToast("Failed to restore report content.");
      window.dispatchEvent(new CustomEvent('cutebi-debug', { 
          detail: { type: 'error', category: 'Restore', message: `Exception: ${e.message}` } 
      }));
    } finally {
      setIsUploading(false);
      setIsMutating(false);
    }
  };

  const handleExportTemplate = async (e, report) => {
    e.stopPropagation();
    const dataStr = JSON.stringify([report], null, 2);
    try {
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
                suggestedName: `${report.name}_Backup.json`,
                types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(dataStr);
            await writable.close();
            showToast("✨ Template exported successfully!");
            return;
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        showToast("Preview environment blocks 'Save As'. Using standard download instead!");
    }
    setTimeout(() => {
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${report.name}_Backup.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 500);
  };

  const handleImportTemplates = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        if (!Array.isArray(importedData)) throw new Error("Invalid format");
        let importCount = 0;
        try {
            for (const report of importedData) {
              const docId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const { id, ...reportData } = report;
              await apiClient.post('/reports', {
                ...reportData,
                id: docId,
                timestamp: Date.now()
              });
              importCount++;
            }
        } catch (err) {
            console.error("Import failed:", err);
        }
        showToast(`Imported ${importCount} templates! ✨`);
      } catch (e) {
        showToast("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target?.files || e.dataTransfer?.files || []);
    if (!files.length) return;
    setIsUploading(true);
    setIsMutating(true);
    try {
      let pendingDatasets = [];
      let pendingSemanticModels = {};
      let pendingRelationships = [];
      let lastDsId = null;
      let latestTemplateToApply = pendingRestore;

      for (const file of files) {
        window.dispatchEvent(new CustomEvent('cutebi-debug', { detail: { type: 'info', category: 'Upload', message: `Platinum Ingestion: ${file.name}` } }));
        
        try {
          // ACTION B: Immediate Backend Upload (No client parsing)
          const backendDs = await apiClient.upload('/upload', file);
          
          const dsId = backendDs.id;
          const tableName = backendDs.table_name;

          const newDataset = { 
            id: dsId, 
            name: backendDs.name, 
            tableName, 
            originalFileName: file.name, 
            data: backendDs.sample_data || [], // Use sample from backend
            headers: backendDs.headers || [], 
            description: '' 
          };
          
          pendingDatasets.push(newDataset);
          lastDsId = dsId;

          // Generate initial model from backend headers
          pendingSemanticModels[dsId] = generateInitModel(dsId, backendDs.headers, backendDs.sample_data || []);

        } catch (err) {
          window.dispatchEvent(new CustomEvent('cutebi-debug', { detail: { type: 'error', category: 'Upload', message: `Error processing ${file.name}: ${err.message}` } }));
          showToast(`Error uploading ${file.name}`);
        }
      }

      if (latestTemplateToApply) {
         setDashboards(latestTemplateToApply.dashboards || (Array.isArray(latestTemplateToApply.dashboard) ? { 'page_1': latestTemplateToApply.dashboard } : latestTemplateToApply.dashboard) || {});
         if (latestTemplateToApply.pages) setPages(latestTemplateToApply.pages);
         if (latestTemplateToApply.pages?.length > 0) setActivePageId(latestTemplateToApply.pages[0].id);
         if (latestTemplateToApply.slicers) setSlicers(latestTemplateToApply.slicers);
         if (latestTemplateToApply.theme) setTheme(latestTemplateToApply.theme);
         if (latestTemplateToApply.categories) setCategories(latestTemplateToApply.categories);
      } else {
         if (!dashboards[activePageId]) setDashboards(prev => ({ ...prev, [activePageId]: [] }));
      }

      // Atomic State Flush
      setDatasets(prev => {
        const next = [...prev];
        pendingDatasets.forEach(d => {
           const idx = next.findIndex(x => x.id === d.id);
           if (idx >= 0) next[idx] = d; else next.push(d);
        });
        return next;
      });

      setSemanticModels(prev => {
        const next = { ...prev, ...pendingSemanticModels };
        return syncSemanticModels(next, pendingRelationships);
      });

      setRelationships(prev => {
         const existingIds = new Set(prev.map(r => r.id));
         const newRels = pendingRelationships.filter(r => !existingIds.has(r.id));
         return [...prev, ...newRels];
      });

      if (lastDsId) setActiveDatasetId(lastDsId);

      // Final status check
      if (latestTemplateToApply && latestTemplateToApply.datasetsMeta) {
          const uploadedIds = new Set([...datasets, ...pendingDatasets].map(d => d.id));
          const missingCount = latestTemplateToApply.datasetsMeta.map(m => m.id).filter(id => !uploadedIds.has(id)).length;
          if (missingCount > 0) {
              setPendingRestore(latestTemplateToApply);
              showToast(`✨ Restored files. Please upload ${missingCount} more file(s).`);
          } else {
              setPendingRestore(null);
              setCurrentTemplateId(latestTemplateToApply.id);
              showToast(`✨ All files restored!`);
          }
      } else {
          setPendingRestore(null);
          if (latestTemplateToApply) setCurrentTemplateId(latestTemplateToApply.id);
          showToast(`✨ Data loaded successfully!`);
      }

    } finally {
      setIsUploading(false);
      setIsMutating(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFileUpload(e);
  };

  const handleSaveReportClick = () => {
    if (datasets.length === 0) return;
    const defaultName = currentTemplateId
      ? (savedReports.find(r => r.id === currentTemplateId)?.name || 'Updated Report')
      : (datasets[0].name.split('.')[0] + (datasets.length > 1 ? " & Others" : "") + " Report");
    setReportNameInput(defaultName);
    setShowSaveModal(true);
  };

  const confirmSaveReport = async (isSaveAs = false) => {
    if (!reportNameInput.trim()) return;
    const existingReport = savedReports.find(r => r.name.toLowerCase() === reportNameInput.trim().toLowerCase());
    if (isSaveAs && existingReport) {
       showToast("A report with this name already exists. Please choose a different name.");
       window.dispatchEvent(new CustomEvent('cutebi-debug', { detail: { type: 'warning', category: 'Save', message: `Save-as blocked: name "${reportNameInput}" already exists.` } }));
       return;
    }
    if (!isSaveAs && existingReport && existingReport.id !== currentTemplateId) {
       showToast("A report with this name already exists. Please choose a different name.");
       window.dispatchEvent(new CustomEvent('cutebi-debug', { detail: { type: 'warning', category: 'Save', message: `Overwrite blocked: name "${reportNameInput}" belongs to another report.` } }));
       return;
    }
    const docId = (!isSaveAs && currentTemplateId) ? currentTemplateId : `report_${Date.now()}`;
    setIsMutating(true);
    
    window.dispatchEvent(new CustomEvent('cutebi-debug', { 
        detail: { type: 'info', category: 'Save', message: `Attempting to save report "${reportNameInput}" [ID: ${docId}]` } 
    }));
    const cleanDashboards = {};
    Object.keys(dashboards).forEach(pageId => {
       cleanDashboards[pageId] = dashboards[pageId].filter(c => c.type !== 'infographic');
    });
    const reportData = {
      id: docId,
      name: reportNameInput,
      datasetsMeta: datasets.map(d => ({ id: d.id, name: d.name, headers: d.headers, description: d.description || '', originalFileName: d.originalFileName || d.name })),
      semanticModels: semanticModels,
      dashboards: cleanDashboards,
      relationships: relationships,
      pages: pages,
      slicers: slicers,
      theme: theme,
      categories: categories,
      workspaceId: currentWorkspaceId,
      folderId: currentFolderId,
      timestamp: Date.now()
    };
    try {
      await apiClient.post('/reports', reportData);

      // Register every dataset in this report into the Workspace Library so it
      // appears in the sidebar's "Workspace Library" section immediately.
      await Promise.allSettled(
        datasets.map(d =>
          apiClient.post('/workspace-datasets', {
            id: d.id,
            name: d.name,
            workspace_id: currentWorkspaceId,
            folder_id: currentFolderId || null,
            table_name: d.tableName || d.id,
            headers: d.headers || [],
            description: d.description || ''
          })
        )
      );

      // Update local state so it appears immediately
      setSavedReports(prev => {
        const idx = prev.findIndex(r => r.id === docId);
        if (idx >= 0) {
          const up = [...prev];
          up[idx] = reportData;
          return up;
        }
        return [...prev, reportData];
      });

      // Refresh workspace library so new datasets appear in sidebar without reload
      await refreshData(true);

      setCurrentTemplateId(docId);
      setShowSaveModal(false);
      showToast(isSaveAs ? "New report saved! ✨" : "Report updated! ✨");
      window.dispatchEvent(new CustomEvent('cutebi-debug', { detail: { type: 'success', category: 'Save', message: `Report saved successfully: ${docId}` } }));
    } catch (e) {
      console.error("Save failed:", e);
      showToast("Failed to save report.");
      window.dispatchEvent(new CustomEvent('cutebi-debug', { 
          detail: { type: 'error', category: 'Save', message: `Save API Exception: ${e.message}`, details: e.stack } 
      }));
    } finally {
      setIsMutating(false);
    }
  };

  const confirmDeleteReport = async () => {
    if (!reportToDelete) return;
    const idToDelete = reportToDelete;
    try {
      await apiClient.delete(`/reports/${idToDelete}`);
      setSavedReports(prev => prev.filter(r => r.id !== idToDelete));
      if (currentTemplateId === idToDelete) setCurrentTemplateId(null);
      setReportToDelete(null);
      showToast("Report deleted.");
    } catch (e) {
      console.error("Delete failed:", e);
      showToast("Delete failed.");
    }

  };

  const deleteSavedReport = (e, id) => {
    e.stopPropagation();
    setReportToDelete(id);
  };

  useEffect(() => {
    const handleRestore = (e) => handleAutoLoadTemplate(e.detail);
    const handleImport = (e) => importLibraryDataset(e.detail);

    window.addEventListener('cutebi-restore-report', handleRestore);
    window.addEventListener('cutebi-import-dataset', handleImport);

    return () => {
      window.removeEventListener('cutebi-restore-report', handleRestore);
      window.removeEventListener('cutebi-import-dataset', handleImport);
    };
  }, [handleAutoLoadTemplate, importLibraryDataset]);

  if (!userRole) return <LandingPage />;

  if (showPortal) return <Portal />;

  const isViewer = userRole === 'viewer';

  return (
    <div className="flex h-screen font-sans overflow-hidden selection:bg-black/10 t-app" style={THEMES[theme]}>
      
      {/* Global Dashboard Navigation / Footer Controls (Now in Sidebar for Developer, Header for Viewer) */}

      {/* AI Copilot Re-open Toggle (Now handled via Header for Viewer and Dashboard for Developer) */}

      {showSidebar && !isViewer && <Sidebar 
          handleRemoveDataset={handleRemoveDataset}
          saveDatasetName={saveDatasetName}
          handleFileUpload={handleFileUpload}
          handleOpenFiles={handleOpenFiles}
          handleAutoLoadTemplate={handleAutoLoadTemplate}
          handleImportTemplates={handleImportTemplates}
          handleExportTemplate={handleExportTemplate}
          deleteSavedReport={deleteSavedReport}
          handleSaveReportClick={handleSaveReportClick}
      />}
      
      <div className="flex-1 flex flex-col h-full bg-[var(--theme-app-bg)] relative overflow-hidden transition-all duration-300">
        
        {/* Main Workspace Area */}
        <div className="flex flex-1 overflow-hidden relative">
          
          <div className={`flex-1 flex flex-col h-full overflow-hidden transition-all duration-500 ease-in-out ${isExploreOpen ? 'opacity-90' : ''}`}>
            {isViewer && (
              <header className="shrink-0 h-14 t-panel border-b t-border px-6 flex items-center justify-between z-30 transition-all">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setShowPortal(true)}>
                    <div className="t-accent-bg p-1.5 rounded-lg shadow-md group-hover:scale-110 transition-all">
                      <LayoutGrid size={14} className="text-white" />
                    </div>
                    <span className="text-sm font-black tracking-tighter t-text-main">CuteBI <span className="t-accent">Platinum</span></span>
                  </div>
                  <div className="h-4 w-px bg-black/10 mx-2" />
                  <span className="text-[10px] font-bold t-text-muted uppercase tracking-widest">
                    {workspaces.find(w => w.id === currentWorkspaceId)?.name || 'Standard Workspace'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {!isExploreOpen && (
                    <button 
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('cutebi-debug', { detail: { type: 'info', category: 'Copilot', message: 'Restoring AI Side Panel...' } }));
                        setIsExploreOpen(true);
                        setAiMode('explore'); // Force explore for Viewers
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 t-accent-bg text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-105 transition-all mr-2"
                    >
                      <Sparkles size={12} /> AI Copilot
                    </button>
                  )}
                  <ThemeSelector />
                  <div className="h-6 w-px bg-black/10 mx-1" />
                  <button 
                    onClick={() => setShowPortal(true)}
                    className="flex items-center gap-1.5 text-[9px] font-black t-text-main hover:t-accent transition-colors uppercase tracking-widest"
                  >
                    Portal
                  </button>
                  <button 
                    onClick={() => setUserRole(null)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="Sign Out"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              </header>
            )}
            {isUploading && (
               <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/10 backdrop-blur-sm">
                  <Loader2 size={48} className="animate-spin t-accent mb-4" />
                  <h2 className="text-2xl font-bold t-text-main">Loading your magical data...</h2>
               </div>
            )}
            
            {pendingRestore ? (
                <div className="flex-1 overflow-y-auto w-full p-8 scrollbar-hide">
                    {!showSidebar && (
                      <button onClick={() => setShowSidebar(true)} className="mb-4 t-text-muted hover:t-accent transition-colors">
                        <Menu size={20} />
                      </button>
                    )}
                    <div className="relative max-w-xl mx-auto p-12 border-4 border-dashed t-border t-panel text-center shadow-xl">
                      <button onClick={() => {
                          setPendingRestore(null);
                          if (datasets.length > 0) setActiveDatasetId(datasets[0].id);
                      }} className="absolute top-6 left-6 t-text-muted hover:t-accent font-bold flex items-center gap-1"><ArrowLeft size={16} /> Cancel</button>
                      <div className="absolute -top-6 right-6 t-accent-bg p-4 rounded-full shadow-sm animate-pulse"><RotateCcw size={32} /></div>
                      <Database size={64} className="mx-auto t-text-muted mb-6 mt-4" />
                      <h2 className="text-3xl font-extrabold t-text-main mb-4">Restoring "{pendingRestore.name}"</h2>
                      
                      <div className="t-text-muted mb-4 font-medium">
                        Please upload the required file(s) below to securely apply this template: <br/>
                        {pendingRestore.datasetsMeta ? (
                          <div className="mt-3 flex flex-col gap-2 items-center">
                              {pendingRestore.datasetsMeta.map(m => {
                                  const isUploaded = datasets.some(d => d.name === m.name || d.originalFileName === m.originalFileName);
                                  return (
                                     <span key={m.id} className={`font-bold px-3 py-1 shadow-sm text-sm ${isUploaded ? 'bg-green-100 text-green-900 border border-green-200' : 'bg-white text-blue-900 border border-blue-200'}`} style={{ borderRadius: 'var(--theme-radius-button)' }}>
                                         {m.name} {isUploaded ? '✅' : '⏳'}
                                     </span>
                                  );
                              })}
                          </div>
                        ) : (
                          <span className="font-bold t-text-main t-panel px-3 py-1 mt-3 inline-block t-border border shadow-sm" style={{ borderRadius: 'var(--theme-radius-button)' }}>{pendingRestore.originalFileName}</span>
                        )}
                      </div>
                      
                      <label className="cursor-pointer t-accent-bg px-8 py-4 font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all inline-block mt-4" style={{ borderRadius: 'var(--theme-radius-button)' }}>Upload Dataset <input type="file" multiple className="hidden" accept=".csv,.txt,.xlsx,.xls" onChange={handleFileUpload} /></label>
                    </div>
                </div>
            ) : (!activeDatasetId && datasets?.length === 0) ? (
                <div className="flex-1 overflow-y-auto w-full p-8 scrollbar-hide">
                    <div className={`relative max-w-xl mx-auto p-12 border-4 border-dashed transition-all duration-300 shadow-xl ${dragActive ? 'border-pink-400 bg-pink-50 scale-105' : 't-border t-panel hover:border-pink-300'}`} onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
                      <div className="absolute -top-6 -left-6 bg-yellow-100 text-yellow-600 p-4 rounded-full shadow-sm animate-bounce"><Sparkles size={32} /></div>
                      <UploadCloud size={64} className="mx-auto t-text-muted mb-6" />
                      <h2 className="text-3xl font-extrabold t-text-main mb-4">Drop your magical data here!</h2>
                      <p className="t-text-muted mb-8 font-medium">Supports CSV, TXT, and Excel files. We'll handle the rest! 🪄</p>
                      <div className="flex flex-wrap justify-center gap-4">
                        <label className="cursor-pointer t-accent-bg px-8 py-4 font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all" style={{ borderRadius: 'var(--theme-radius-button)' }}>Browse Files <input type="file" multiple className="hidden" accept=".csv,.txt,.xlsx,.xls" onChange={handleFileUpload} /></label>
                        <button onClick={() => setIsLibraryOpen(true)} className="t-button px-8 py-4 font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center gap-2" style={{ borderRadius: 'var(--theme-radius-button)' }}><Library size={20} /> Pick from Library</button>
                      </div>
                    </div>
                </div>
            ) : (
                <>
                  <div className={`flex-1 overflow-y-auto w-full scrollbar-hide ${showSemanticModeler ? '' : 'hidden'}`}>
                    <div className="p-8 w-full">
                      <SemanticModeler handleAutoFillDescriptions={handleAutoFillDescriptions} isThinking={isThinking} />
                    </div>
                  </div>
                  <div className={`flex-1 flex flex-col h-full overflow-hidden ${showSemanticModeler ? 'hidden' : ''}`}>
                    <DashboardGrid handleAskAI={handleAskAI} handlePinChart={handlePinChart} />
                  </div>
                </>
            )}
          </div>

        {/* Slide-out Panel (Header Toggle) */}
        {isExploreOpen && (
            <AIInterface 
              handleAskAI={handleAskAI} 
              handleConfirmPendingAI={handleConfirmPendingAI} 
              handleGenerateInfographic={handleGenerateInfographic} 
              handlePinChart={handlePinChart} 
            />
        )}
      </div>

      {/* Modals */}
      {showCategoryModal && <CategoryModal />}
      {showMeasureBuilder && <MeasureBuilderModal getUniqueValuesForDim={getUniqueValuesForDim} />}
      {showBuilder && <ChartBuilderModal />}
      {showRelModal && <RelationshipsModal />}

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 t-accent-bg text-white px-6 py-4 shadow-2xl z-50 flex items-center gap-3 animate-bounce font-bold" style={{ borderRadius: 'var(--theme-radius-button)' }}>
          <Sparkles size={20} className="text-white" /> <span>{toastMessage}</span>
        </div>
      )}

      {/* Save Template Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="t-panel p-8 shadow-2xl w-full max-w-sm t-border border text-center">
            <h3 className="text-2xl font-black t-text-main mb-4">Save Report ✨</h3>
            <p className="text-sm t-text-muted mb-4 font-medium">Your data stays safe in the workspace!</p>
            <input autoFocus value={reportNameInput} onChange={e => setReportNameInput(e.target.value)} className="w-full bg-black/5 border-none px-4 py-4 t-text-main font-black mb-6 text-center focus:ring-2 focus:ring-[var(--theme-accent)] outline-none" placeholder="Report Name" onKeyDown={(e) => e.key === 'Enter' && confirmSaveReport(false)} />
           
            {currentTemplateId ? (
              <div className="flex flex-col gap-3">
                <button onClick={() => confirmSaveReport(false)} className="w-full t-accent-bg py-3.5 font-bold shadow-lg">Save Changes</button>
                <button onClick={() => confirmSaveReport(true)} className="w-full t-button py-3.5 font-bold">Save As New</button>
                <button onClick={() => setShowSaveModal(false)} className="w-full py-2 t-text-muted font-bold hover:t-text-main">Cancel</button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button onClick={() => setShowSaveModal(false)} className="flex-1 py-3.5 t-button font-bold">Cancel</button>
                <button onClick={() => confirmSaveReport(false)} className="flex-1 t-accent-bg py-3.5 font-bold shadow-lg">Save</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {reportToDelete && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="t-panel p-8 shadow-xl w-full max-w-sm t-border border text-center">
            <div className="bg-red-100 text-red-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><X size={32} /></div>
            <h3 className="text-xl font-bold t-text-main mb-2">Delete Report?</h3>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setReportToDelete(null)} className="flex-1 py-3 t-button font-bold">Cancel</button>
              <button onClick={confirmDeleteReport} className="flex-1 bg-red-500 text-white py-3 font-bold shadow-lg" style={{ borderRadius: 'var(--theme-radius-button)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <LibraryModal 
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onSelect={importLibraryDataset}
        existingDatasetIds={datasets.map(d => d.id)}
      />
    </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppStateProvider>
        <AppContent />
        <DebugPanel />
      </AppStateProvider>
    </ErrorBoundary>
  )
}

export default App
