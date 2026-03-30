import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { apiClient } from '../services/api';
import { queryDuckDB } from '../utils/duckdb.js';
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
  const [hiddenDatasetIds, setHiddenDatasetIds] = useState([]);
  const [workspaces, setWorkspaces] = useState([{ id: 'w_default', name: 'My Workspace', description: 'Your personal workspace' }]);
  const [folders, setFolders] = useState([]);
  const [showPortal, setShowPortal] = useState(true);
  
  // Theme State with Persistence
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('cutebi_theme') || 'cute';
  });

  useEffect(() => {
    localStorage.setItem('cutebi_theme', theme);
    applyTheme(theme);
  }, [theme]);

  // Persist Workspace Selection
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(() => {
    return localStorage.getItem('cutebi_last_ws') || 'w_default';
  });
  const [currentFolderId, setCurrentFolderId] = useState(() => {
    return localStorage.getItem('cutebi_last_folder') || null;
  });

  useEffect(() => {
    localStorage.setItem('cutebi_last_ws', currentWorkspaceId);
  }, [currentWorkspaceId]);

  useEffect(() => {
    if (currentFolderId) localStorage.setItem('cutebi_last_folder', currentFolderId);
    else localStorage.removeItem('cutebi_last_folder');
  }, [currentFolderId]);

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

  const [savedReports, setSavedReports] = useState([]);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [currentTemplateId, setCurrentTemplateId] = useState(null);
  
  // mutation lock to prevent background sync from overwriting local state
  const [isMutating, setIsMutating] = useState(false);

  // --- Shared Engine Warmup State ---
  // maxDatesCache and datesReady live here (not in useDataEngine) so the
  // date-scan runs exactly ONCE regardless of how many hook instances exist.
  // In the enterprise future, this gets replaced by a backend-cached metadata
  // field read from Postgres/GCS catalog — no frontend scan needed at all.
  const [maxDatesCache, setMaxDatesCache] = useState({});
  const [datesReady, setDatesReady] = useState(false);
  const warmupAbortRef = useRef(false);

  useEffect(() => {
    // Reset abort flag on each run
    warmupAbortRef.current = false;

    const fetchMaxDates = async () => {
      window.dispatchEvent(new CustomEvent('cutebi-debug', {
        detail: { type: 'info', category: 'Backend', message: `[${Date.now()}] Engine Warmup Started: Scanning datasets for Time Intelligence...` }
      }));

      const newCache = {};
      const seen = new Set();
      const queryTasks = []; // { originKey, table, col, aliases[] }

      // --- Pass 1: Build deduplicated query task list ---
      for (const [dsId, model] of Object.entries(semanticModels)) {
        if (warmupAbortRef.current) return;
        const ds = datasets.find(d => d.id === dsId);
        if (!ds) continue;

        const dateFields = model.filter(f => f.format === 'date' && !f.isCalculated);
        for (const f of dateFields) {
          if (warmupAbortRef.current) return;

          let table = ds.tableName;
          let col = f.id;
          let originKey = `${dsId}::${f.id}`;
          const localKey = `${dsId}::${f.id}`;

          if (f.isJoined && f.originDatasetId && f.originFieldId) {
            const originDs = datasets.find(d => d.id === f.originDatasetId);
            if (originDs) { table = originDs.tableName; col = f.originFieldId; originKey = `${f.originDatasetId}::${f.originFieldId}`; }
          }

          if (seen.has(originKey)) {
            // Alias this local key onto the primary task so it gets populated too
            const primary = queryTasks.find(t => t.originKey === originKey);
            if (primary) primary.aliases.push(localKey);
            continue;
          }
          seen.add(originKey);
          // If originKey differs from localKey (joined field), alias it from the start
          queryTasks.push({ originKey, table, col, aliases: localKey !== originKey ? [localKey] : [] });
        }
      }

      if (warmupAbortRef.current) return;

      // --- Pass 2: Fire all unique date queries in parallel ---
      const results = await Promise.allSettled(
        queryTasks.map(task =>
          queryDuckDB(`SELECT MAX(TRY_CAST("${task.col}" AS DATE)) as m FROM "${task.table}"`)
            .then(res => ({ task, res }))
        )
      );

      if (warmupAbortRef.current) return;

      // --- Pass 3: Populate the cache from parallel results ---
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          const { task, res } = result.value;
          if (res && res[0] && res[0].m) {
            const dateStr = new Date(res[0].m).toISOString().split('T')[0];
            newCache[task.originKey] = dateStr;
            task.aliases.forEach(alias => { newCache[alias] = dateStr; });
          }
        } else {
          console.error('[MaxDates] Query Error:', result.reason);
        }
      });

      if (!warmupAbortRef.current) {
        setMaxDatesCache(newCache);
        setDatesReady(true);
        window.dispatchEvent(new CustomEvent('cutebi-debug', {
          detail: {
            type: 'success', category: 'Backend',
            message: `[${Date.now()}] Engine Warm and Ready! Dates cached: ${Object.keys(newCache).length}`,
            details: { cachedKeys: Object.keys(newCache) }
          }
        }));
      }
    };

    if (datasets.length > 0) {
      setDatesReady(false); // reset while rescanning
      fetchMaxDates();
    }
    // If datasets is empty, we keep datesReady as false.
    // Charts have nothing to query anyway until datasets are loaded.
    // When datasets arrive (upload or report restore), this effect re-fires
    // and datesReady becomes true only after the real scan completes.

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
      const [ws, f, r, ds, pm] = await Promise.all([
        apiClient.get(`/workspaces?_t=${t}`),
        apiClient.get(`/folders?_t=${t}`),
        apiClient.get(`/reports?_t=${t}`),
        apiClient.get(`/workspace-datasets?workspace_id=${targetWsId}&_t=${t}`),
        apiClient.get(`/published_models?workspace_id=${targetWsId}&_t=${t}`)
      ]);
      
      // If we are currently mutating, discard the background fetch (race protection)
      if (isMutating && !force) return null;

      // Smart Merge for Workspaces
      setWorkspaces(ws.length > 0 ? ws : [{ id: 'w_default', name: 'My Workspace', description: 'Your personal workspace' }]);
      
      setFolders(f.map(item => ({
        ...item,
        workspaceId: item.workspace_id,
        parentId: item.parent_id
      })));
      
      setSavedReports(r.map(item => ({
        ...item,
        workspaceId: item.workspace_id,
        folderId: item.folder_id
      })));

      setWorkspaceDatasets(ds);
      setPublishedModels((pm || []).map(m => ({
        ...m,
        ...(m.data || {})
      })));

      // Derive workspace semantic models from the enriched dataset payloads.
      // The backend now includes headers + sample_data, so we can run Smart Typing
      // without requiring the user to re-upload the file.
      const derivedWsModels = {};
      ds.forEach(wsDs => {
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
    navigator.clipboard.writeText(text);
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
    maxDatesCache, datesReady,
    // Computed & Helpers
    activeDataset, activeSemanticModel, showToast, copyToClipboard, refreshData
  };


  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => useContext(AppStateContext);
