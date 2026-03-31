import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/api';
import { generateInitModel, patchModels } from '../utils/dataParser';
import { syncSemanticModels } from '../utils/semanticSync';
import { applyTheme } from '../utils/themeEngine';


const AppStateContext = createContext();

export const AppStateProvider = ({ children }) => {
  // --- Auth State ---
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'developer' | 'viewer' | null

  // --- Data State ---
  const [datasets, setDatasets] = useState([]);
  const [activeDatasetId, setActiveDatasetId] = useState(null);
  const [semanticModels, setSemanticModels] = useState({});
  const [dashboards, setDashboards] = useState({});
  const [globalFilters, setGlobalFilters] = useState({});
  const [relationships, setRelationships] = useState([]);
  const [slicers, setSlicers] = useState([]);
  const [hiddenDatasetIds, setHiddenDatasetIds] = useState([]);  // Persistence & Library State
  const [workspaces, setWorkspaces] = useState(() => {
    const cached = localStorage.getItem('cutebi_ws_cache');
    return cached ? JSON.parse(cached) : [{ id: 'w_default', name: 'My Workspace', description: 'Your personal workspace' }];
  });
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(() => localStorage.getItem('cutebi_last_ws') || 'w_default');
  
  const [folders, setFolders] = useState(() => {
    const cached = localStorage.getItem('cutebi_folder_cache');
    return cached ? JSON.parse(cached) : [];
  });
  const [currentFolderId, setCurrentFolderId] = useState(() => localStorage.getItem('cutebi_last_folder') || null);
  
  const [savedReports, setSavedReports] = useState(() => {
    const cached = localStorage.getItem('cutebi_reports_cache');
    return cached ? JSON.parse(cached) : [];
  });
  
  const [isMutating, setIsMutating] = useState(false);

  // Sync session to localStorage
  useEffect(() => {
    localStorage.setItem('cutebi_last_ws', currentWorkspaceId);
    localStorage.setItem('cutebi_last_folder', currentFolderId || '');
    localStorage.setItem('cutebi_ws_cache', JSON.stringify(workspaces));
    localStorage.setItem('cutebi_folder_cache', JSON.stringify(folders));
    localStorage.setItem('cutebi_reports_cache', JSON.stringify(savedReports));
  }, [currentWorkspaceId, currentFolderId, workspaces, folders, savedReports]);

  const [showPortal, setShowPortal] = useState(true);
  
  // Theme State with Persistence
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('cutebi_theme') || 'cute';
  });

  useEffect(() => {
    localStorage.setItem('cutebi_theme', theme);
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('cutebi-debug', { 
        detail: { 
            type: 'info', 
            category: 'Restore', 
            message: `[Session] Loaded workspace metadata from localStorage`, 
            details: { lastWs: currentWorkspaceId, lastFolder: currentFolderId } 
        } 
    }));
  }, []);


  const [workspaceDatasets, setWorkspaceDatasets] = useState([]);
  const [workspaceSemanticModels, setWorkspaceSemanticModels] = useState({});
  const [publishedModels, setPublishedModels] = useState([]);
 
  // --- Categories State ---
  const [categories, setCategories] = useState(['Uncategorized']);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
 
  // --- Search & Filter States ---
  const [dictSearch, setDictSearch] = useState('');
  const [dictFilterCategory, setDictFilterCategory] = useState('All');
  const [measureSearch, setMeasureSearch] = useState('');

  // --- UI State ---
  const [isUploading, setIsUploading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [showSemanticModeler, setShowSemanticModeler] = useState(false);
  const [showRelModal, setShowRelModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [reportNameInput, setReportNameInput] = useState('');
  const [reportToDelete, setReportToDelete] = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showMagicBar, setShowMagicBar] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showSlicerPane, setShowSlicerPane] = useState(true);
  const [showMeasureBuilder, setShowMeasureBuilder] = useState(false);
  const [semanticViewMode, setSemanticViewMode] = useState('grid');
 
  // --- AI Dual Mode State ---
  const [aiMode, setAiMode] = useState('build');
  const [exploreHistory, setExploreHistory] = useState([]);
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const [pendingAIAction, setPendingAIAction] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // --- Inline Edit States ---
  const [editingDatasetId, setEditingDatasetId] = useState(null);
  const [editingDatasetName, setEditingDatasetName] = useState('');
  const [editingPageId, setEditingPageId] = useState(null);
  const [editingPageName, setEditingPageName] = useState('');
  const [editingSlicerId, setEditingSlicerId] = useState(null);
  const [editingSlicerTitle, setEditingSlicerTitle] = useState('');

  // --- Forms ---
  const initBuilderForm = {
     id: null, title: '', type: 'bar', dimension: '', measure: '', legend: '', size: 'half', verticalSize: 'normal',
     pivotRows: [], pivotCols: [], pivotMeasures: [],
     tableDimensions: [], tableMeasures: [],
     xMeasure: '', yMeasure: '', colorMeasure: '', sizeMeasure: '', showDataLabels: false
  };
  const [builderForm, setBuilderForm] = useState(initBuilderForm);
  const [relForm, setRelForm] = useState({ fromColumn: '', toDatasetId: '', toColumn: '', direction: 'left' });

  // --- Unified Calc Measure Form States ---
  const [measureTab, setMeasureTab] = useState('math');
  const [mLabel, setMLabel] = useState('');
  const [mFormat, setMFormat] = useState('auto');
  const [formulaText, setFormulaText] = useState('');
  const [cFilters, setCFilters] = useState([]);
  const [cFilterLogic, setCFilterLogic] = useState('AND');
  const [cTime, setCTime] = useState({ enabled: false, dateDimensionId: '', period: 'MTD' });
  const [editingMeasureId, setEditingMeasureId] = useState(null);

  // --- Pages State ---
  const [pages, setPages] = useState([{ id: 'page_1', name: 'Page 1' }]);
  const [activePageId, setActivePageId] = useState('page_1');

  const [pendingRestore, setPendingRestore] = useState(null);
  const [currentTemplateId, setCurrentTemplateId] = useState(null);

  // --- Engine Warmup: Fetch MAX dates for Time Intelligence ---
  // BQ mode: calls backend /api/bq/maxdates instead of browser WASM DuckDB.
  // This runs once whenever datasets or semantic models change.
  const [maxDatesCache, setMaxDatesCache] = useState({});
  const [datesReady, setDatesReady] = useState(true);
  const warmupAbortRef = useRef(false);

  useEffect(() => {
    warmupAbortRef.current = false;

    const fetchMaxDates = async () => {
      window.dispatchEvent(new CustomEvent('cutebi-debug', {
        detail: { type: 'info', category: 'Backend', message: `[${Date.now()}] Engine Warmup Started: Scanning datasets for Time Intelligence...` }
      }));

      const seen     = new Set();
      const queries  = [];  // { key, ds_id, col }
      const aliasMap = {};  // originKey -> [localKey]

      // --- Pass 1: Build deduplicated query task list ---
      for (const [dsId, model] of Object.entries(semanticModels)) {
        if (warmupAbortRef.current) return;
        const ds = datasets.find(d => d.id === dsId);
        if (!ds) continue;

        const dateFields = model.filter(f => f.format === 'date' && !f.isCalculated);
        for (const f of dateFields) {
          if (warmupAbortRef.current) return;

          let targetDsId = dsId;
          let col        = f.id;
          let originKey  = `${dsId}::${f.id}`;
          const localKey = `${dsId}::${f.id}`;

          if (f.isJoined && f.originDatasetId && f.originFieldId) {
            targetDsId = f.originDatasetId;
            col        = f.originFieldId;
            originKey  = `${f.originDatasetId}::${f.originFieldId}`;
          }

          if (seen.has(originKey)) {
            if (!aliasMap[originKey]) aliasMap[originKey] = [];
            if (localKey !== originKey) aliasMap[originKey].push(localKey);
            continue;
          }
          seen.add(originKey);
          queries.push({ key: originKey, ds_id: targetDsId, col });

          if (localKey !== originKey) {
            aliasMap[originKey] = [localKey];
          }
        }
      }

      if (warmupAbortRef.current || queries.length === 0) {
        setDatesReady(true);
        return;
      }

      // --- Pass 2: Ask backend for MAX dates (BigQuery) ---
      try {
        const bqResult = await apiClient.getBqMaxDates(queries);
        if (warmupAbortRef.current) return;

        const newCache = { ...bqResult };
        // Populate aliases from the primary result
        for (const [originKey, dateStr] of Object.entries(bqResult)) {
          (aliasMap[originKey] || []).forEach(alias => { newCache[alias] = dateStr; });
        }

        setMaxDatesCache(newCache);
        setDatesReady(true);
        window.dispatchEvent(new CustomEvent('cutebi-debug', {
          detail: {
            type: 'success', category: 'Backend',
            message: `[${Date.now()}] Engine Warm and Ready! Dates cached: ${Object.keys(newCache).length}`,
            details: { cachedKeys: Object.keys(newCache) }
          }
        }));
      } catch (err) {
        console.error('[MaxDates/BQ] Failed:', err);
        // Gracefully degrade: mark ready so charts still render
        setDatesReady(true);
      }
    };

    if (datasets.length > 0) {
      // Intentionally decoupled datesReady to prevent UI freezing
      fetchMaxDates();
    }

    return () => { warmupAbortRef.current = true; };
  }, [datasets, semanticModels]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Backend Data Sync ---
  const refreshData = async (force = false, workspaceIdOverride = null) => {
    // If a mutation is in progress, skip the background sync to avoid race conditions
    // UNLESS it's a forced refresh after a mutation.
    if (isMutating && !force) {
      console.log("Background sync skipped: Mutation in progress");
      return;
    }

    const t = Date.now();
    const targetWsId = workspaceIdOverride || currentWorkspaceId;
    
    try {
      // 1. Fetch Cloud Workspaces - The absolute source of truth
      const [ws, f, r, ds, pm] = await Promise.all([
        apiClient.get(`/workspaces?_t=${t}`),
        apiClient.get(`/folders?_t=${t}`),
        apiClient.get(`/reports?_t=${t}`),
        apiClient.get(`/workspace-datasets?workspace_id=${targetWsId}&_t=${t}`),
        apiClient.get(`/published_models?workspace_id=${targetWsId}&_t=${t}`)
      ]);
      
      // If we are currently mutating, discard the background fetch (race protection)
      if (isMutating && !force) return null;

      // --- PERSISTENCE SHIELD 3.0: Only overwrite cache if cloud has real content ---
      if (ws && ws.length > 0) {
        setWorkspaces(ws);
        
        // Safety: If our current workspace was deleted or is missing, align to the first available cloud workspace
        if (!ws.find(w => w.id === targetWsId)) {
            console.warn(`[Persistence] Workspace ${targetWsId} not found in cloud. Returning to default.`);
            setCurrentWorkspaceId(ws[0].id);
        }
      } else {
        console.log(`[Persistence] Cloud returned empty workspaces. Preserving local cache for ${targetWsId}`);
      }
      
      if (f && f.length > 0) {
        setFolders(f.filter(item => !item.is_deleted).map(item => ({
          ...item,
          workspaceId: item.workspace_id,
          parentId: item.parent_id
        })));
      }

      if (r && r.length > 0) {
        setSavedReports(r.map(item => ({
          ...item,
          workspaceId: item.workspace_id,
          folderId: item.folder_id
        })));
      }

      setWorkspaceDatasets(ds || []);

      // Note: In BigQuery mode we do NOT pre-register DuckDB views — all
      // queries are routed to BQ by the backend SQL transformer.

      setPublishedModels((pm || []).map(m => ({
        ...m,
        ...(m.data || {})
      })));

      // Derive workspace semantic models from the enriched dataset payloads.
      // The backend now includes headers + sample_data, so we can run Smart Typing
      // without requiring the user to re-upload the file.
      const derivedWsModels = {};
      ds.filter(d => !d.is_deleted).forEach(wsDs => {
        derivedWsModels[wsDs.id] = generateInitModel(wsDs.id, wsDs.headers || [], wsDs.sample_data || []);
      });
      setWorkspaceSemanticModels(derivedWsModels);

      // NOTE: We intentionally do NOT merge workspace datasets into the active `datasets`
      // state here. Library datasets should only enter the active session via explicit
      // user actions (file upload, "Add from Library", or report restore).
      // Auto-injecting them here caused duplicate datasets to appear on every report load.

      return { ws, f, r, ds, pm };

    } catch (err) {
      console.error("Backend sync failed:", err);
      return null;
    }
  };

  const handleImportModel = (model) => {
    // 1. Reset Session
    setDatesReady(true);
    setDatasets([]);
    setSemanticModels({});
    setRelationships([]);
    setPages([{ id: 'page_1', name: 'Page 1' }]);
    setActivePageId('page_1');
    setCurrentTemplateId(null);
    setDashboards({});
    
    // Restore Categories
    if (model.categories && model.categories.length > 0) {
        setCategories(model.categories);
    }

    // 2. Hydrate with Published Model State (Unwrapped)
    
    // Structure A: Master Dataset Meta (the tables themselves)
    if (model.datasetsMeta) {
        const restored = model.datasetsMeta.map(m => {
            const fromWs = (workspaceDatasets || []).find(d => d.id === m.id);
            return {
                ...m,
                data: fromWs?.data || m.data || [],
                sample_data: fromWs?.sample_data || m.sample_data || [],
                isFromLibrary: true
            };
        });
        setDatasets(restored);
        if (restored.length > 0) setActiveDatasetId(restored[0].id);
    }
    
    if (model.relationships) {
        setRelationships(model.relationships || []);
    }
    
    // Explicit Semantic Model Restoration
    if (model.fields) {
        setSemanticModels(p => {
            const next = { ...p };
            model.fields.forEach(f => {
                const dsId = f.originDatasetId || f.dsId;
                if (dsId) {
                    if (!next[dsId]) next[dsId] = [];
                    // Avoid duplicates but overwrite metadata if already partially loaded
                    const existingIdx = next[dsId].findIndex(ex => ex.id === f.id);
                    if (existingIdx >= 0) {
                        next[dsId][existingIdx] = { 
                            ...next[dsId][existingIdx], 
                            ...f,
                            isCalculated: !!f.isCalculated // Ensure boolean cast
                        };
                    } else {
                        next[dsId].push({
                            ...f,
                            isCalculated: !!f.isCalculated
                        });
                    }
                }
            });
            // Final sync pass to ensure tokens and IDs are aligned
            return syncSemanticModels(next, model.relationships || []);
        });
    }

    if (model.categories) {
        setCategories(model.categories);
    }
    
    setShowPortal(false);
    showToast(`✨ Model "${model.name}" imported to report!`);
  };

  const importLibraryDataset = (ds) => {
    // Check if already in active report
    if (datasets.find(d => d.id === ds.id)) {
      showToast("Dataset already in report.");
      return;
    }

    // If this is the first dataset being loaded, it's a fresh report — clear stale slicers
    if (datasets.length === 0) setSlicers([]);

    // Decoupled datesReady
    
    // Add to current report state
    const newDs = {
      id: ds.id,
      name: ds.name,
      tableName: ds.table_name || ds.id,
      originalFileName: ds.original_file_name,
      headers: ds.headers || [],
      description: ds.description || '',
      isFromLibrary: true
    };

    setDatasets(prev => [...prev, newDs]);
    // Generate basic semantic model from headers with Smart Typing
    const initialModel = generateInitModel(ds.id, ds.headers || [], ds.sample_data || []);
    setSemanticModels(prev => ({ ...prev, [ds.id]: initialModel }));
    setActiveDatasetId(ds.id);
    setIsLibraryOpen(false);
    showToast(`✨ Successfully imported "${ds.name}" from Platinum Library!`);
  };

  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      if (isMounted) await refreshData();
    };
    fetch();
    return () => { isMounted = false; };
  }, [currentWorkspaceId]);


  const showToast = (msg, duration = 4000) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), duration);
  };

  const copyToClipboard = (text) => {
    const fallback = (t) => {
      const ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    };
    try {
      if (navigator.clipboard) { navigator.clipboard.writeText(text).catch(() => fallback(text)); }
      else { fallback(text); }
    } catch(e) { fallback(text); }
    showToast("Copied to clipboard!");
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    if (categories.includes(newCategoryName.trim())) {
      showToast("Category already exists.");
      return;
    }
    setCategories(prev => [...prev, newCategoryName.trim()]);
    setNewCategoryName('');
    showToast(`Added category: ${newCategoryName.trim()}`);
  };

  const handleDeleteCategory = (catToDelete) => {
    if (catToDelete === 'Uncategorized') return;
    
    // Remove category
    setCategories(prev => prev.filter(c => c !== catToDelete));
    
    // Update all models to reset fields using this category back to Uncategorized
    setSemanticModels(prev => {
        const next = {...prev};
        Object.keys(next).forEach(dsId => {
            next[dsId] = next[dsId].map(f => f.category === catToDelete ? {...f, category: 'Uncategorized'} : f);
        });
        return next;
    });
    
    showToast(`Deleted category: ${catToDelete}`);
  };

  const activeDataset = datasets.find(d => d.id === activeDatasetId);
  const activeSemanticModel = semanticModels[activeDatasetId] || [];

  // --- Unified Model Logic ---
  const getJoinGroup = React.useCallback((startId) => {
    if (!startId) return [];
    const group = new Set([startId]);
    
    const startDs = datasets.find(d => d.id === startId);
    if (startDs?.isUnified && startDs?.joinGroupIds) {
        startDs.joinGroupIds.forEach(id => group.add(id));
    }

    let added = true;
    while (added) {
        added = false;
        relationships.forEach(r => {
            if (group.has(r.fromDatasetId) && !group.has(r.toDatasetId)) { group.add(r.toDatasetId); added = true; }
            if (group.has(r.toDatasetId) && !group.has(r.fromDatasetId)) { group.add(r.fromDatasetId); added = true; }
        });
    }
    return Array.from(group);
  }, [datasets, relationships]);

  const joinGroupIds = React.useMemo(() => getJoinGroup(activeDatasetId), [activeDatasetId, getJoinGroup]);
  const isUnified = joinGroupIds.length > 1;

  const globalSemanticFields = React.useMemo(() => {
     const fieldsByLabel = new Map();
     
     // Order: Process Dimensional datasets FIRST (non-active Fact table)
     // This ensures we favor dimensional labels when names collide.
     const sortedIds = [...joinGroupIds].sort(id => id === activeDatasetId ? 1 : -1);

     // Handle joined fields
     sortedIds.forEach(dsId => {
         const model = semanticModels[dsId] || [];
         const ds = datasets.find(d => d.id === dsId);
         if (!ds) return;
         
         model.forEach(f => {
             const fType = f.type || 'dimension';
             const cleanLabel = (f.label || '').trim();
             const key = cleanLabel.toLowerCase();
             
             // Multi-pass Logic: If this is a calculated measure, it should ALWAYS take 
             // priority over a base field with the same name in the unified dictionary.
             const existing = fieldsByLabel.get(key);
             if (!existing || (!existing.isCalculated && f.isCalculated)) {
                 fieldsByLabel.set(key, {
                     id: f.id,
                     value: f.id,
                     label: cleanLabel,
                     rawLabel: f.label,
                     type: fType,
                     aggType: f.aggType || 'sum',
                     format: f.format || 'auto',
                     description: f.description || '',
                     category: f.category || 'Uncategorized',
                     dsId: dsId,
                     originDatasetId: f.originDatasetId || dsId,
                     localId: f.id,
                     originFieldId: f.originFieldId || f.id,
                     isUnified: true,
                     isHidden: !!f.isHidden,
                     isCalculated: f.isCalculated,
                     expression: f.expression,
                     mathTokens: f.mathTokens,
                     timeConfig: f.timeConfig,
                     filters: f.filters
                 });
             }
         });
     });

     // Handle orphan (non-joined) fields from other datasets
     Object.entries(semanticModels).forEach(([dsId, model]) => {
         if (joinGroupIds.includes(dsId)) return;
         const ds = datasets.find(d => d.id === dsId);
         if (!ds || hiddenDatasetIds.includes(dsId)) return;
         const dsName = ds.name?.split('.')[0] || 'Data';

         model.forEach(f => {
             const fType = f.type || 'dimension';
             const originKey = `${f.originDatasetId || dsId}::${f.originFieldId || f.id}`;
             fieldsByLabel.set(originKey, {
                 id: f.id,
                 value: originKey,
                 label: `${f.label} (${dsName})`,
                 rawLabel: f.label,
                 type: fType,
                 aggType: f.aggType || 'sum',
                 format: f.format || 'auto',
                 description: f.description || '',
                 category: f.category || 'Uncategorized',
                 dsId: dsId,
                 originDatasetId: f.originDatasetId || dsId,
                 localId: f.id,
                 originFieldId: f.originFieldId || f.id,
                 isHidden: !!f.isHidden,
                 isCalculated: f.isCalculated,
                 expression: f.expression,
                 mathTokens: f.mathTokens,
                 timeConfig: f.timeConfig,
                 filters: f.filters,
                 isUnified: false
             });
         });
     });

     return Array.from(fieldsByLabel.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [semanticModels, joinGroupIds, activeDatasetId, datasets, hiddenDatasetIds]);

  const mergedSemanticModel = globalSemanticFields; // For backward compatibility

  const value = {
    // Auth
    user, setUser,
    userRole, setUserRole,
    // Data
    datasets, setDatasets, activeDatasetId, setActiveDatasetId,
    semanticModels, setSemanticModels, dashboards, setDashboards,
    globalFilters, setGlobalFilters, relationships, setRelationships, slicers, setSlicers,
    workspaceDatasets, setWorkspaceDatasets, workspaceSemanticModels, setWorkspaceSemanticModels,
    publishedModels, setPublishedModels,
    // Categories
    categories, setCategories, showCategoryModal, setShowCategoryModal, newCategoryName, setNewCategoryName,
    handleAddCategory, handleDeleteCategory,
    // Search & Filter
    dictSearch, setDictSearch, dictFilterCategory, setDictFilterCategory, measureSearch, setMeasureSearch,
    // UI
    theme, setTheme, isUploading, setIsUploading, chatInput, setChatInput, isThinking, setIsThinking,
    showSemanticModeler, setShowSemanticModeler, showRelModal, setShowRelModal, dragActive, setDragActive,
    toastMessage, setToastMessage, showSaveModal, setShowSaveModal, reportNameInput, setReportNameInput,
    reportToDelete, setReportToDelete, showBuilder, setShowBuilder, showMagicBar, setShowMagicBar,
    showSidebar, setShowSidebar, showSlicerPane, setShowSlicerPane, showMeasureBuilder, setShowMeasureBuilder,
    semanticViewMode, setSemanticViewMode,
    // AI
    aiMode, setAiMode, exploreHistory, setExploreHistory, isExploreOpen, setIsExploreOpen,
    pendingAIAction, setPendingAIAction, aiError, setAiError,
    isLibraryOpen, setIsLibraryOpen, importLibraryDataset, handleImportModel,
    // Inline Edits
    editingDatasetId, setEditingDatasetId, editingDatasetName, setEditingDatasetName,
    editingPageId, setEditingPageId, editingPageName, setEditingPageName,
    editingSlicerId, setEditingSlicerId, editingSlicerTitle, setEditingSlicerTitle,
    // Forms
    initBuilderForm, builderForm, setBuilderForm, relForm, setRelForm, measureTab, setMeasureTab,
    mLabel, setMLabel, mFormat, setMFormat, formulaText, setFormulaText, cFilters, setCFilters,
    cFilterLogic, setCFilterLogic, cTime, setCTime, editingMeasureId, setEditingMeasureId,
    // Pages
    pages, setPages, activePageId, setActivePageId,
    // Cloud
    savedReports, setSavedReports, pendingRestore, setPendingRestore, currentTemplateId, setCurrentTemplateId,
    hiddenDatasetIds, setHiddenDatasetIds,
    workspaces, setWorkspaces, folders, setFolders, showPortal, setShowPortal,
    currentWorkspaceId, setCurrentWorkspaceId, currentFolderId, setCurrentFolderId,
    // Unified Model
    globalSemanticFields, mergedSemanticModel, isUnified, joinGroupIds,
    // Mutation Lock
    isMutating, setIsMutating,
    // Engine Warmup (shared singleton — see warmup useEffect above)
    maxDatesCache, datesReady, setDatesReady,
    // Computed & Helpers
    activeDataset, activeSemanticModel, showToast, copyToClipboard, refreshData
  };


  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => useContext(AppStateContext);
