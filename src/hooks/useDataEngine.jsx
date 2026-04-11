import { useMemo, useCallback, useEffect, useRef } from 'react';
import { useAppState } from '../contexts/AppStateContext';
import { initDuckDB, queryDuckDB } from '../utils/backendEngine.js';
import { apiClient } from '../services/api';

export const useDataEngine = () => {
  const {
    datasets, setDatasets,
    semanticModels, setSemanticModels,
    relationships, setRelationships,
    globalFilters,
    pageFilters, authoredReportFilters, activePageId,
    activeDatasetId, setActiveDatasetId,
    hiddenDatasetIds,
    globalSemanticFields, isUnified,
    isUploading, setIsUploading,
    drillThroughState,
    maxDatesCache, datesReady,
    showToast
  } = useAppState();

  const isLoading = isUploading;

  // Store maxDatesCache in a ref to prevent generateSQL from recreating
  // when the cache is populated. This stops cascading re-renders across all charts.
  const maxDatesCacheRef = useRef(maxDatesCache);
  useEffect(() => {
    maxDatesCacheRef.current = maxDatesCache;
  }, [maxDatesCache]);

  // Stable ref to datasets so getUniqueValuesForDim doesn't need datasets in its dep array
  const datasetsRef = useRef(datasets);
  useEffect(() => { datasetsRef.current = datasets; }, [datasets]);

  // Session-scoped cache for slicer option queries.
  // Keys: "datasetId::dimensionId", Values: string[]
  // Cleared per dataset when it changes (re-upload scenario).
  const slicerOptionsCache = useRef({});

  // --- Utility: Safe Date Parsing ---
  const safeParseDate = useCallback((val) => {
    if (val === null || val === undefined || val === '') return new Date(NaN);
    if (val === 0 || val === '0') return new Date(NaN);
    const num = Number(val);
    if (!isNaN(num) && num > 1900 && num < 2100) return new Date(Date.UTC(num, 0, 1));
    if (!isNaN(num) && num > 30000 && num < 60000) return new Date(Math.round((num - 25569) * 86400 * 1000));
    if (typeof val === 'string' && (val.includes('/') || val.includes('-'))) {
        const parts = val.split(/[\/\-]/);
        if (parts.length === 3) {
            let d = parseInt(parts[0]), m = parseInt(parts[1]) - 1, y = parseInt(parts[2]);
            if (parts[0].length === 4) { y = parseInt(parts[0]); d = parseInt(parts[2]); }
            if (m + 1 > 12) { const tmp = d; d = m + 1; m = tmp - 1; }
            const date = new Date(Date.UTC(y, m, d));
            if (!isNaN(date.getTime())) return date;
        }
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date(NaN) : d;
  }, []);

  // --- Dataset Loading ---
  const loadDataset = useCallback(async (file, customName) => {
    const { parseFileAsync } = await import('../utils/fileParser.js');
    setIsUploading(true);
    try {
      const parsed = await parseFileAsync(file);
      if (!parsed) { if (showToast) showToast('Could not parse file.'); return; }
      
      let backendDs;
      try {
          backendDs = await apiClient.upload('/upload', file);
      } catch (err) {
          console.error("Backend upload failed:", err);
          if (showToast) showToast('Backend upload failed.');
          return;
      }
      
      const id = backendDs.id;
      const tableName = backendDs.table_name;
      const name = customName || file.name;

      const newDs = { 
        id, 
        name, 
        tableName,
        originalFileName: file.name, 
        data: parsed.data.slice(0, 5), 
        headers: backendDs.headers || parsed.headers 
      };

      const sampleRow = parsed.data[0] || {};
      const model = parsed.headers.map(h => {
        const v = sampleRow[h];
        const isNum = typeof v === 'number' || (!isNaN(Number(v)) && v !== '' && v !== null);
        const lh = h.toLowerCase();
        const couldBeDate = lh.includes('date') || lh.includes('time') || lh.includes('day') || lh.includes('month') || lh.includes('year');
        return {
          id: h, label: h, type: isNum && !couldBeDate ? 'measure' : 'dimension',
          format: couldBeDate ? 'date' : (isNum ? 'number' : 'text'),
          aggType: 'sum', isCalculated: false, isJoined: false, isHidden: false,
          originDatasetId: id, originFieldId: h,
          filters: [], filterLogic: 'AND',
          timeConfig: { enabled: false, dateDimensionId: '', period: 'YTD' }
        };
      });

      setDatasets(prev => {
        const existing = prev.findIndex(d => d.id === id);
        if (existing !== -1) { const up = [...prev]; up[existing] = newDs; return up; }
        return [...prev, newDs];
      });
      setSemanticModels(prev => ({ ...prev, [id]: model }));
      setActiveDatasetId(id);
      if (showToast) showToast(`'${name}' loaded into SQL Engine!`);
    } catch (e) {
      console.error('Load failed:', e);
      if (showToast) showToast('Error loading file.');
    } finally {
      setIsUploading(false);
    }
  }, [setDatasets, setSemanticModels, setActiveDatasetId, setIsUploading, showToast]);

  const deleteDataset = useCallback((datasetId) => {
    setDatasets(prev => prev.filter(d => d.id !== datasetId));
    setSemanticModels(prev => { const n = { ...prev }; delete n[datasetId]; return n; });
    setRelationships(prev => prev.filter(r => r.fromDatasetId !== datasetId && r.toDatasetId !== datasetId));
    if (activeDatasetId === datasetId) setActiveDatasetId(null);
  }, [setDatasets, setSemanticModels, setRelationships, activeDatasetId, setActiveDatasetId]);

  const joinDatasets = useCallback((fromId, toId, fromCol, toCol, direction = 'left') => {
    const relId = `${fromId}_${toId}_${Date.now()}`;
    setRelationships(prev => [...prev, { id: relId, fromDatasetId: fromId, toDatasetId: toId, fromColumn: fromCol, toColumn: toCol, direction }]);
  }, [setRelationships]);

  const getCleanTableName = useCallback((id) => {
      const target = datasets.find(d => d.id === id);
      return target?.tableName || id;
  }, [datasets]);

  // --- Dynamic CTE Generator: BFS Join Traversal ---
  const generateUnifiedCTE = useCallback((rootId, scopedToFactOnly = false) => {
    const startId = rootId;
    if (!startId) return "";
    const activeDs = datasets.find(d => d.id === startId);
    if (!activeDs) return "";

    const isSecondaryFact = (dsId) => dsId !== startId &&
        (semanticModels[dsId] || []).some(f => f.type === 'measure' && !f.isCalculated);

    const baseTable = getCleanTableName(startId);
    const joinedTables = new Set([startId]);
    const queue = [startId];
    
    // Helper: Build SELECT clause with EXCEPT to avoid duplicate names in unified view
    const generateTableSelect = (id, isRoot = false) => {
        const tableName = getCleanTableName(id);
        if (isRoot) return `\`${tableName}\`.*`;
        
        // Find which keys to EXCEPT (the join keys used in the entire graph for this table)
        const tabRels = relationships.filter(r => r.fromDatasetId === id || r.toDatasetId === id);
        const joinKeys = Array.from(new Set(tabRels.map(r => r.fromDatasetId === id ? r.fromColumn : r.toColumn)));
        
        if (joinKeys.length > 0) {
            return `\`${tableName}\`.* EXCEPT (\`${joinKeys.join('`, `')}\`)`;
        }
        return `\`${tableName}\`.*`;
    };

    let selectItems = [generateTableSelect(startId, true)];
    let joinStrings = [];
    const visited = new Set([startId]);

    while (queue.length > 0) {
        const currentDsId = queue.shift();
        const currentTableName = getCleanTableName(currentDsId);
        const rels = relationships.filter(r => r.fromDatasetId === currentDsId || r.toDatasetId === currentDsId);
        
        rels.forEach(rel => {
            const isFrom = rel.fromDatasetId === currentDsId;
            const targetId = isFrom ? rel.toDatasetId : rel.fromDatasetId;
            const targetTable = getCleanTableName(targetId);
            
            if (!visited.has(targetId)) {
                if (scopedToFactOnly && isSecondaryFact(targetId)) return;

                visited.add(targetId);
                joinedTables.add(targetId);
                queue.push(targetId);
                
                const sourceCol = isFrom ? rel.fromColumn : rel.toColumn;
                const targetCol = isFrom ? rel.toColumn : rel.fromColumn;
                
                // --- Grain Hardening: Auto-detect Date/Time columns and cast to DATE for join safety ---
                const isDate = (col) => col.toLowerCase().includes('date') || col.toLowerCase().includes('time');
                const sourceExpr = isDate(sourceCol) ? `SAFE_CAST(\`${currentTableName}\`.\`${sourceCol}\` AS DATE)` : `\`${currentTableName}\`.\`${sourceCol}\``;
                const targetExpr = isDate(targetCol) ? `SAFE_CAST(\`${targetTable}\`.\`${targetCol}\` AS DATE)` : `\`${targetTable}\`.\`${targetCol}\``;

                selectItems.push(generateTableSelect(targetId));
                joinStrings.push(` LEFT JOIN \`${targetTable}\` ON ${sourceExpr} = ${targetExpr}`);
            }
        });
    }

    const sql = `WITH ds_unified AS (SELECT ${selectItems.join(', ')} FROM \`${baseTable}\`${joinStrings.join('')}) `;
    
    window.dispatchEvent(new CustomEvent('mvantage-debug', { 
        detail: { 
            type: 'info', 
            category: 'Join Trace', 
            message: `Join Chain [${datasets.find(d=>d.id===startId)?.name || startId}]: ${Array.from(joinedTables).map(id => datasets.find(d=>d.id===id)?.name || id).join(' -> ')}`,
            details: { tables: Array.from(joinedTables), joins: joinStrings.length, scopedToFactOnly }
        } 
    }));

    return sql;
  }, [activeDatasetId, relationships, getCleanTableName, datasets, semanticModels]);

  const updateSemanticModel = useCallback((datasetId, updatedModel) => {
    setSemanticModels(prev => ({ ...prev, [datasetId]: updatedModel }));
  }, [setSemanticModels]);
  
  const getJoinGroup = useCallback((startId) => {
    if (!startId) return [];
    const group = new Set([startId]);
    let added = true;
    while (added) {
        added = false;
        relationships.forEach(r => {
            if (group.has(r.fromDatasetId) && !group.has(r.toDatasetId)) { group.add(r.toDatasetId); added = true; }
            if (group.has(r.toDatasetId) && !group.has(r.fromDatasetId)) { group.add(r.fromDatasetId); added = true; }
        });
    }
    return Array.from(group);
  }, [relationships]);

  const getFactTablesInGroup = useCallback((startId) => {
    const group = getJoinGroup(startId);
    return group.filter(dsId =>
      (semanticModels[dsId] || []).some(f => f.type === 'measure' && !f.isCalculated)
    );
  }, [getJoinGroup, semanticModels]);

  const resolveMeasureOrigin = useCallback((measId, factTablesInGroup, defaultFactId) => {
    const measIdLower = String(measId || '').toLowerCase();
    
    // 1. Initial Match: Find the measure in the semantic models
    let foundMeasure = null;
    let fallbackDsId = defaultFactId;

    for (const dsId of factTablesInGroup) {
      const match = (semanticModels[dsId] || []).find(f => f.id.toLowerCase() === measIdLower);
      if (match) {
        foundMeasure = match;
        fallbackDsId = dsId;
        break;
      }
    }

  // 2. Smart Grain Peeking: If calculated, analyze its dependencies to find the true grain
    if (foundMeasure?.isCalculated && foundMeasure.expression) {
      const matches = foundMeasure.expression.match(/\[(.*?)\]/g) || [];
      const dependencies = matches.map(m => m.slice(1, -1).toLowerCase());
      
      if (dependencies.length > 0) {
          const factCounts = {};
          dependencies.forEach(depId => {
              for (const dsId of factTablesInGroup) {
                  // Check if this fact owns the underlying physical column
                  const isOwner = (semanticModels[dsId] || []).some(f => f.id.toLowerCase() === depId && !f.isCalculated);
                  if (isOwner) {
                      factCounts[dsId] = (factCounts[dsId] || 0) + 1;
                      break;
                  }
              }
          });

          // Route to the fact that owns the majority of the underlying columns
          const mostFrequentFact = Object.entries(factCounts).sort((a,b) => b[1] - a[1])[0];
          if (mostFrequentFact) {
              window.dispatchEvent(new CustomEvent('mvantage-debug', { 
                  detail: { 
                      type: 'success', 
                      category: 'Grain Trace', 
                      message: `Self-Healed: Routing '${measId}' to '${mostFrequentFact[0]}'`,
                      details: { reason: `Depends on: ${dependencies.join(', ')}` }
                  } 
              }));
              return mostFrequentFact[0];
          }
      }
    }

    // 3. Fallback: If not found in any model, search for raw column matches
    if (!foundMeasure) {
        for (const dsId of factTablesInGroup) {
            const isBaseField = (semanticModels[dsId] || []).some(f => f.id.toLowerCase() === measIdLower && !f.isCalculated);
            if (isBaseField) return dsId;
        }
    }

    return fallbackDsId;
  }, [semanticModels]);

  const groupMeasuresByFact = useCallback((measureIds, factTablesInGroup, contextDatasetId) => {
    const map = new Map();
    (measureIds || []).forEach(mId => {
      const factId = resolveMeasureOrigin(mId, factTablesInGroup, contextDatasetId);
      if (!map.has(factId)) map.set(factId, []);
      map.get(factId).push(mId);
    });
    return map;
  }, [resolveMeasureOrigin]);

  const getTableHeaders = useCallback((measures, dimensions) => {
    const resolveLabel = (id) => {
      const bareId = id.includes('::') ? id.split('::')[1] : id;
      const allSemanticFields = Object.values(semanticModels).flat();
      const match = allSemanticFields.find(x => x.id.toLowerCase() === bareId.toLowerCase());
      return match ? match.label : bareId;
    };
    return {
      headers: [...(dimensions || []).map(resolveLabel), ...(measures || []).map(resolveLabel)],
      headerIds: [...(dimensions || []), ...(measures || [])]
    };
  }, [semanticModels]);




  // --- SQL Generator Helper: Unified Approach ---
  const generateSQL = useCallback((datasetId, dimensions = [], measures = [], filters = [], limit = null, scopedFactId = null, overrideGlobalFilters = null) => {
    const activeJoinGroup = getJoinGroup(datasetId);
    const isMasterView = activeJoinGroup.includes(datasetId);
    const activeDs = datasets.find(d => d.id === datasetId);
    const sourceTable = isMasterView ? "ds_unified" : (activeDs?.tableName || datasetId);
    // scopedFactId: when set, CTE is built from this fact's roots only (Chasm Trap fix)
    const cteRootId = scopedFactId || datasetId;
    const ctePrefix = isMasterView ? generateUnifiedCTE(cteRootId, !!scopedFactId) : "";

    window.dispatchEvent(new CustomEvent('mvantage-debug', { 
      detail: { 
        type: 'info', 
        category: 'Engine', 
        message: `Generating SQL. Source: ${sourceTable}${scopedFactId ? ` [Scoped: ${scopedFactId}]` : ''}`, 
        details: { dimensions, measures, filters, ctePresent: !!ctePrefix, scopedFactId } 
      } 
    }));

    let selectClause = [];
    const sm = semanticModels[datasetId] || [];

    dimensions.forEach(dimId => {
        // Enforce string casting for dimensions in multi-fact mode to ensure merge-key compatibility
        const wrap = (expr) => scopedFactId ? `CAST(${expr} AS STRING)` : expr;

        if (dimId.includes('::')) {
            const [oDsId, oFId] = dimId.split('::');
            if (isMasterView) {
                selectClause.push(`${wrap(`\`${sourceTable}\`.\`${oFId}\``)} AS \`${dimId}\``);
            } else {
                const targetDs = datasets.find(d => d.id === oDsId);
                const targetTable = targetDs?.tableName || oDsId;
                selectClause.push(`${wrap(`\`${targetTable}\`.\`${oFId}\``)} AS \`${dimId}\``);
            }
        } else {
            selectClause.push(`${wrap(`\`${sourceTable}\`.\`${dimId}\``)} AS \`${dimId}\``);
        }
    });

    const resolveMeasureSQL = (measId, conditions = [], visited = new Set()) => {
        // --- Cycle Protection: Stop infinite recursion if a formula references itself ---
        if (visited.has(measId)) {
            console.warn(`Circular reference detected for measure: ${measId}. Returning NULL.`);
            return "NULL";
        }
        visited.add(measId);
        // Search across all models in the active join group to resolve the measure definition
        const localJoinGroup = getJoinGroup(datasetId);
        let f = null;
        for (const dsId of localJoinGroup) {
            f = semanticModels[dsId]?.find(x => x.id === measId);
            if (f) break;
        }

        if (!f && measId.includes('::')) {
            const [oDsId, oFId] = measId.split('::');
            if (isMasterView) {
                return `SUM(\`${sourceTable}\`.\`${oFId}\`)`;
            } else {
                const targetDs = datasets.find(d => d.id === oDsId);
                const targetTable = targetDs?.tableName || oDsId;
                return `SUM(\`${targetTable}\`.\`${oFId}\`)`; 
            }
        }
        if (!f) return "NULL";
        const localConds = [...conditions];

        if (f.filters && f.filters.length > 0) {
            const filterParts = f.filters.map(filt => {
                if (!filt.dimensionId) return 'TRUE';
                const col = `\`${sourceTable}\`.\`${filt.dimensionId}\``;
                let val = filt.value;
                if (filt.operator === '=') return `CAST(${col} AS STRING) = '${String(val).replace(/'/g, "''")}'`;
                if (filt.operator === '!=') return `CAST(${col} AS STRING) <> '${String(val).replace(/'/g, "''")}'`;
                if (filt.operator === 'contains') return `LOWER(CAST(${col} AS STRING)) LIKE LOWER('%${String(val).replace(/'/g, "''")}%')`;
                if (filt.operator === 'IN') {
                    if (!Array.isArray(val) || val.length === 0) return 'FALSE';
                    return `CAST(${col} AS STRING) IN (${val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')})`;
                }
                return 'TRUE';
            });
            localConds.push(`(${filterParts.join(` ${f.filterLogic || 'AND'} `)})`);
        }

        if (f.timeConfig && f.timeConfig.enabled && f.timeConfig.dateDimensionId) {
            const dateCol = `SAFE_CAST(\`${sourceTable}\`.\`${f.timeConfig.dateDimensionId}\` AS DATE)`;
            const baseKey = `${f.originDatasetId || datasetId}::${f.timeConfig.dateDimensionId}`;
            const mdc = maxDatesCacheRef.current[baseKey];
            let refDateStr = new Date().toISOString().split('T')[0];
            if (mdc && /^\d{4}-\d{2}-\d{2}$/.test(String(mdc))) refDateStr = String(mdc);
            const refDate = `CAST('${refDateStr}' AS DATE)`;
            const _now = new Date(); 
            const todayStr = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
            const staticRef = `CAST('${todayStr}' AS DATE)`;
            const fyRow = `(CASE WHEN EXTRACT(MONTH FROM ${dateCol}) >= 4 THEN EXTRACT(YEAR FROM ${dateCol}) + 1 ELSE EXTRACT(YEAR FROM ${dateCol}) END)`;
            const fyRefStatic = `(CASE WHEN EXTRACT(MONTH FROM ${staticRef}) >= 4 THEN EXTRACT(YEAR FROM ${staticRef}) + 1 ELSE EXTRACT(YEAR FROM ${staticRef}) END)`;
            const mo = `EXTRACT(MONTH FROM ${dateCol})`;
            const moRefStatic = `EXTRACT(MONTH FROM ${staticRef})`;

            switch (f.timeConfig.period) {
                case 'YTD':   localConds.push(`(${fyRow} = ${fyRefStatic} AND ${dateCol} <= ${staticRef})`); break;
                case 'LYYTD': localConds.push(`(${fyRow} = ${fyRefStatic} - 1 AND ${dateCol} <= ${staticRef} - INTERVAL 1 YEAR)`); break;
                case 'MTD':   localConds.push(`(${fyRow} = ${fyRefStatic} AND ${mo} = ${moRefStatic} AND ${dateCol} <= ${staticRef})`); break;
                case 'LY':    localConds.push(`(${fyRow} = ${fyRefStatic} - 1)`); break;
                case 'DYTD':  localConds.push(`(${fyRow} = (CASE WHEN EXTRACT(MONTH FROM ${refDate}) >= 4 THEN EXTRACT(YEAR FROM ${refDate}) + 1 ELSE EXTRACT(YEAR FROM ${refDate}) END) AND ${dateCol} <= ${refDate})`); break;
            }
        }
        
        if (!f.isCalculated) {
            const col = `\`${sourceTable}\`.\`${f.id}\``;
            const agg = f.aggType === 'countDistinct' ? 'COUNT(DISTINCT ' : (f.aggType === 'count' ? 'COUNT(' : `${(f.aggType || 'SUM').toUpperCase()}(`);
            if (localConds.length > 0) return `${agg}CASE WHEN ${localConds.join(' AND ')} THEN ${col} ELSE NULL END)`;
            return `${agg}${col})`;
        } else {
            let exprSQL = "NULL";
            if (f.expression) {
                let evalStr = f.expression;
                const matches = evalStr.match(/\[(.*?)\]/g) || [];
                for (const match of matches) {
                    const innerId = match.slice(1, -1);
                    const innerSQL = resolveMeasureSQL(innerId, localConds, new Set(visited));
                    evalStr = evalStr.replace(match, `COALESCE(CAST((${innerSQL}) AS FLOAT64), 0)`);
                }
                exprSQL = evalStr || "NULL";
            }
            return `(${exprSQL})`;
        }
    };

    measures.forEach(measId => { selectClause.push(`${resolveMeasureSQL(measId)} AS \`${measId}\``); });

    let whereClause = "";
    const filterParts = [];
    
    // 1. Process Global/Interactive Slicers (Report Level)
    const activeFilters = overrideGlobalFilters || globalFilters;
    Object.entries(activeFilters).forEach(([originKey, vals]) => {
      if (!vals || vals.length === 0) return;
      const [oDsId, oFId] = originKey.split('::');
      const colName = oFId ?? oDsId;
      const table = datasets.find(d => d.id === oDsId)?.tableName || oDsId;
      const colIdent = isMasterView ? `\`${colName}\`` : `\`${table}\`.\`${colName}\``;
      const valList = vals.map(v => typeof v === 'string' ? `'${String(v).replace(/'/g, "''")}'` : v).join(', ');
      filterParts.push(`CAST(${colIdent} AS STRING) IN (${valList})`);
    });

    // 2. Process Authored Report-Level Filters
    if (Array.isArray(authoredReportFilters) && authoredReportFilters.length > 0) {
        const reportFilterParts = authoredReportFilters.map(f => {
            if (!f.dimensionId) return 'TRUE';
            const colIdent = isMasterView ? `\`${f.dimensionId}\`` : `\`${sourceTable}\`.\`${f.dimensionId}\``;
            let val = f.value;
            if (f.operator === '=') return `CAST(${colIdent} AS STRING) = '${String(val).replace(/'/g, "''")}'`;
            if (f.operator === '!=') return `CAST(${colIdent} AS STRING) <> '${String(val).replace(/'/g, "''")}'`;
            if (f.operator === 'contains') return `LOWER(CAST(${colIdent} AS STRING)) LIKE LOWER('%${String(val).replace(/'/g, "''")}%')`;
            if (f.operator === 'IN') {
                if (!Array.isArray(val) || val.length === 0) return 'FALSE';
                return `CAST(${colIdent} AS STRING) IN (${val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')})`;
            }
            return 'TRUE';
        });
        filterParts.push(`(${reportFilterParts.join(' AND ')})`);
    }

    // 3. Process Authored Page-Level Filters
    const currentPageFilters = pageFilters[activePageId] || [];
    if (Array.isArray(currentPageFilters) && currentPageFilters.length > 0) {
        const pageFilterParts = currentPageFilters.map(f => {
            if (!f.dimensionId) return 'TRUE';
            const colIdent = isMasterView ? `\`${f.dimensionId}\`` : `\`${sourceTable}\`.\`${f.dimensionId}\``;
            let val = f.value;
            if (f.operator === '=') return `CAST(${colIdent} AS STRING) = '${String(val).replace(/'/g, "''")}'`;
            if (f.operator === '!=') return `CAST(${colIdent} AS STRING) <> '${String(val).replace(/'/g, "''")}'`;
            if (f.operator === 'contains') return `LOWER(CAST(${colIdent} AS STRING)) LIKE LOWER('%${String(val).replace(/'/g, "''")}%')`;
            if (f.operator === 'IN') {
                if (!Array.isArray(val) || val.length === 0) return 'FALSE';
                return `CAST(${colIdent} AS STRING) IN (${val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')})`;
            }
            return 'TRUE';
        });
        filterParts.push(`(${pageFilterParts.join(' AND ')})`);
    }

    // 4. Process Authored Visual-Level Filters (Passed via 'filters' param)
    if (Array.isArray(filters) && filters.length > 0) {
        const visualFilterParts = filters.map(f => {
            if (!f.dimensionId) return 'TRUE';
            const colIdent = isMasterView ? `\`${f.dimensionId}\`` : `\`${sourceTable}\`.\`${f.dimensionId}\``;
            let val = f.value;
            if (f.operator === '=') return `CAST(${colIdent} AS STRING) = '${String(val).replace(/'/g, "''")}'`;
            if (f.operator === '!=') return `CAST(${colIdent} AS STRING) <> '${String(val).replace(/'/g, "''")}'`;
            if (f.operator === 'contains') return `LOWER(CAST(${colIdent} AS STRING)) LIKE LOWER('%${String(val).replace(/'/g, "''")}%')`;
            if (f.operator === 'IN') {
                if (!Array.isArray(val) || val.length === 0) return 'FALSE';
                return `CAST(${colIdent} AS STRING) IN (${val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')})`;
            }
            return 'TRUE';
        });
        filterParts.push(`(${visualFilterParts.join(' AND ')})`);
    }

    // 5. Process Inherited Authored Filters (Drill-Through Mode)
    if (overrideGlobalFilters && drillThroughState.active && Array.isArray(drillThroughState.authoredFilters)) {
        const inheritedFilterParts = drillThroughState.authoredFilters.map(f => {
            if (!f.dimensionId) return 'TRUE';
            const colIdent = isMasterView ? `\`${f.dimensionId}\`` : `\`${sourceTable}\`.\`${f.dimensionId}\``;
            let val = f.value;
            if (f.operator === '=') return `CAST(${colIdent} AS STRING) = '${String(val).replace(/'/g, "''")}'`;
            if (f.operator === '!=') return `CAST(${colIdent} AS STRING) <> '${String(val).replace(/'/g, "''")}'`;
            if (f.operator === 'contains') return `LOWER(CAST(${colIdent} AS STRING)) LIKE LOWER('%${String(val).replace(/'/g, "''")}%')`;
            if (f.operator === 'IN') {
                if (!Array.isArray(val) || val.length === 0) return 'FALSE';
                return `CAST(${colIdent} AS STRING) IN (${val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ')})`;
            }
            return 'TRUE';
        });
        if (inheritedFilterParts.length > 0) filterParts.push(`(${inheritedFilterParts.join(' AND ')})`);
    }

    // NLP/AI filter support (legacy and high-recall)
    const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (Array.isArray(filters)) {
      filters.forEach(f => {
        if (!f.field || !f.value) return;
        const colIdent = isMasterView ? `\`${f.field}\`` : `\`${sourceTable}\`.\`${f.field}\``;
        const rawVal = String(f.value).trim();
        const opMap = { 'eq': '=', 'neq': '!=', '==': '=' };
        let op = opMap[f.operator?.toLowerCase()] || f.operator || "=";
        const opLower = op.toLowerCase();
        
        // High-Recall dimensional lookup
        const isDim = globalSemanticFields?.some(sf => (sf.id === f.field || sf.originFieldId === f.field) && sf.type === 'dimension');
        if (isDim && (opLower === "=" || opLower === "==" || opLower === "contains" || opLower === "in")) {
            let items = opLower === "in" ? rawVal.split(',').map(v=>v.trim()) : [rawVal];
            const pattern = items.map(escapeRegex).join('|');
            filterParts.push(`REGEXP_CONTAINS(LOWER(CAST(${colIdent} AS STRING)), LOWER('${pattern.replace(/'/g, "''")}'))`);
        } else if (opLower === "in") {
           const inList = rawVal.split(',').map(v => `'${v.trim().replace(/'/g, "''")}'`).join(', ');
           filterParts.push(`CAST(${colIdent} AS STRING) IN (${inList})`);
        } else {
           filterParts.push(`CAST(${colIdent} AS STRING) ${op} '${rawVal.replace(/'/g, "''")}'`);
        }
      });
    }

    if (filterParts.length > 0) whereClause = ` WHERE ${filterParts.join(' AND ')}`;

    const groupByClause = dimensions.length > 0 ? ` GROUP BY ${dimensions.map((_, i) => i + 1).join(', ')}` : "";
    const limitClause = limit ? ` LIMIT ${limit}` : "";
    
    const renderSource = sourceTable === "ds_unified" ? sourceTable : `\`${sourceTable}\``;
    const sql = `${ctePrefix}SELECT ${selectClause.join(', ')} FROM ${renderSource}${whereClause}${groupByClause}${limitClause}`;
    
    window.dispatchEvent(new CustomEvent('mvantage-debug', { 
       detail: { type: 'success', category: 'Engine', message: 'SQL Generated Successfully', details: { sql } } 
    }));
    
    return sql;
  }, [datasets, semanticModels, activeDatasetId, relationships, globalFilters, drillThroughState, generateUnifiedCTE, pageFilters, authoredReportFilters, activePageId, globalSemanticFields]);

  const applyFilters = useCallback((data, datasetId) => {
      let filteredData = data;
      const sm = semanticModels[datasetId] || [];
      Object.entries(globalFilters).forEach(([originKey, filterVals]) => {
        if (!filterVals || filterVals.length === 0) return;
        const [oDsId, oFId] = originKey.split('::');
        const localField = sm.find(f => (f.originDatasetId || datasetId).toLowerCase() === oDsId.toLowerCase() && (f.originFieldId || f.id).toLowerCase() === oFId.toLowerCase());
        if (localField) {
           const localDimId = localField.id;
           filteredData = filteredData.filter(row => filterVals.includes(String(row[localDimId])));
        }
      });
      return filteredData;
  }, [globalFilters, semanticModels]);

  const getAggregatedData = useCallback(async (chart, overrideGlobalFilters = null) => {
    const datasetId = chart?.datasetId;
    const dimensionId = chart?.dimension;
    const measureId = chart?.measure;
    const legendId = chart?.legend;
    const filters = chart?.filters || [];
    
    if (!datasetId || !dimensionId || !measureId) return { data: [], legendKeys: [] };
    const dimensions = [dimensionId];
    if (legendId) dimensions.push(legendId);
    const sql = generateSQL(datasetId, dimensions, [measureId], filters, null, null, overrideGlobalFilters);
    try {
      const results = await queryDuckDB(sql);
      const dataMap = new Map();
      
      results.forEach(row => {
        const xVal = row[dimensionId];
        let item = dataMap.get(xVal);
        if (!item) {
          item = { name: xVal };
          dataMap.set(xVal, item);
        }
        if (legendId) item[row[legendId]] = row[measureId];
        else item.value = row[measureId];
      });

      const data = Array.from(dataMap.values());
      const legendKeys = legendId ? [...new Set(results.map(r => r[legendId]))] : ['value'];
      return { data, legendKeys };
    } catch (e) { console.error("Agg Error:", e); throw e; }
  }, [generateSQL]);

  const getHierarchicalData = useCallback(async (chart, overrideGlobalFilters = null) => {
    const datasetId = chart?.datasetId;
    const dimensions = chart?.treeDimensions || [];
    const measureId = chart?.measure;
    const filters = chart?.filters || [];
    
    if (!datasetId || !dimensions || dimensions.length === 0 || !measureId) return [];
    
    // We group by all dimensions in the hierarchy
    const sql = generateSQL(datasetId, dimensions, [measureId], filters, null, null, overrideGlobalFilters);
    try {
      const results = await queryDuckDB(sql);
      
      const root = { name: 'root', children: [], value: 0 };
      
      results.forEach(row => {
        let currentLevel = root.children;
        const measureVal = Number(row[measureId]) || 0;
        root.value += measureVal;
        let pathSoFar = [];
        dimensions.forEach((dim, idx) => {
          const val = row[dim] === null || row[dim] === undefined ? 'Unknown' : String(row[dim]);
          const isLast = idx === dimensions.length - 1;
          pathSoFar.push(val);
          
          let existingNode = currentLevel.find(c => c.origName === val);
          
          if (!existingNode) {
            existingNode = { 
                name: val, 
                origName: val,
                value: 0, 
                rootIndex: root.children.findIndex(c => c.origName === pathSoFar[0])
            };
            if (idx === 0) existingNode.rootIndex = root.children.length; // Set rootIndex for top level
            
            if (!isLast) {
              existingNode.children = [];
            }
            currentLevel.push(existingNode);
          }
          
          existingNode.value += measureVal;
          if (!isLast) {
            currentLevel = existingNode.children;
          }
        });
      });
      
      return root.children;
    } catch (e) {
      console.error("Hierarchical Error:", e);
      throw e;
    }
  }, [generateSQL]);

    const getTableData = useCallback(async (chart, overrideGlobalFilters = null) => {
       const datasetId = chart?.datasetId;
       const dimensions = chart?.tableDimensions || [];
       const measures = chart?.tableMeasures || [];
       const totalMode = chart?.totalMode || 'calculated';
       const filters = chart?.filters || [];
       
       if (!datasetId || (!dimensions.length && !measures.length)) return { headers: [], headerIds: [], rows: [] };
       const { headers, headerIds } = getTableHeaders(measures, dimensions);
       const factTablesInGroup = getFactTablesInGroup(datasetId);
       const isMultiFactModel = factTablesInGroup.length > 1;
       const measuresByFact = groupMeasuresByFact(measures, factTablesInGroup, datasetId);

       try {
         if (isMultiFactModel) {
           const mergedByKey = new Map();
           const mergeStats = [];
           let grandTotals = {};
           
           const factTasks = Array.from(measuresByFact.entries()).map(async ([factId, factMeasures]) => {
             const sql = generateSQL(datasetId, dimensions, factMeasures, filters, null, factId, overrideGlobalFilters);
             const totalsSql = totalMode === 'sum' 
               ? `WITH base AS (${sql}) SELECT ${factMeasures.map(m => `SUM(\`${m}\`) as \`${m}\``).join(', ')} FROM base`
               : generateSQL(datasetId, [], factMeasures, filters, null, factId, overrideGlobalFilters);
             
             const [rows, totalsResp] = await Promise.all([
               queryDuckDB(sql),
               queryDuckDB(totalsSql)
             ]);
             
             const tRow = (totalsResp && totalsResp[0]) || {};
             factMeasures.forEach(mId => grandTotals[mId] = tRow[mId] !== undefined ? tRow[mId] : 0);

             return { factId, factMeasures, rows: rows || [] };
           });

           const results = await Promise.all(factTasks);

           for (const { factId, rows } of results) {
             mergeStats.push(`${factId}: ${rows.length} rows`);
             rows.forEach(row => {
               const dimKey = (dimensions || []).map(d => {
                 const val = row[d];
                 return val === null || val === undefined ? '' : String(val).trim();
               }).join('\x00');

               if (!mergedByKey.has(dimKey)) {
                 mergedByKey.set(dimKey, { ...Object.fromEntries((dimensions || []).map(d => [d, row[d]])) });
               }
               const targetRow = mergedByKey.get(dimKey);
               Object.assign(targetRow, row);
             });
           }

           if (totalMode === 'calculated') {
             const grandSql = generateSQL(datasetId, [], measures, filters, null, null, overrideGlobalFilters);
             const gRes = await queryDuckDB(grandSql);
             if (gRes && gRes[0]) Object.assign(grandTotals, gRes[0]);
           }

           window.dispatchEvent(new CustomEvent('mvantage-debug', { 
             detail: { type: 'success', category: 'Merge', message: `Table merge complete: ${mergedByKey.size} rows`, details: { stats: mergeStats.join(' | ') } } 
           }));
           return { headers, headerIds, rows: Array.from(mergedByKey.values()), totals: grandTotals };
         }

         const sql = generateSQL(datasetId, dimensions, measures, filters, 1500, null, overrideGlobalFilters);
         const totalsSql = totalMode === 'sum' 
             ? `WITH base AS (${sql}) SELECT ${measures.map(m => `SUM(\`${m}\`) as \`${m}\``).join(', ')} FROM base`
             : generateSQL(datasetId, [], measures, filters, null, null, overrideGlobalFilters);
         
         const [rows, totalsResp] = await Promise.all([
            queryDuckDB(sql),
            (measures && measures.length > 0) ? queryDuckDB(totalsSql) : Promise.resolve([])
         ]);
         
         return { headers, headerIds, rows: rows || [], totals: (totalsResp && totalsResp[0]) || {} };
       } catch (e) { console.error("Table Error:", e); throw e; }
    }, [generateSQL, getFactTablesInGroup, resolveMeasureOrigin, activeDatasetId, semanticModels, datasets, groupMeasuresByFact, getTableHeaders]);


  const getPivotData = useCallback(async (chart, overrideGlobalFilters = null) => {
     const datasetId = chart?.datasetId;
     const rowDims = chart?.pivotRows || [];
     const colDims = chart?.pivotCols || [];
     const measureIds = chart?.pivotMeasures || [];
     const totalMode = chart?.totalMode || 'calculated';
     const filters = chart?.filters || [];
     
     if (!datasetId || (rowDims.length === 0 && colDims.length === 0)) return { rowKeys: [], colKeys: [], matrix: {} };

     const allDims = [...(rowDims || []), ...(colDims || [])];
     const factTablesInGroup = getFactTablesInGroup(datasetId);
     const isMultiFactModel = factTablesInGroup.length > 1;
     const measuresByFact = groupMeasuresByFact(measureIds, factTablesInGroup, datasetId);

     const buildMatrix = (results, measures) => {
       const matrix = {}; const rowKeysSet = new Set(); const colKeysSet = new Set();
       (results || []).forEach(row => {
         const rKey = rowDims.map(d => row[d]).join(' | ');
         const cKeyBase = colDims.map(d => row[d]).join(' | ');
         rowKeysSet.add(rKey);
         if (!matrix[rKey]) matrix[rKey] = {};
         measures.forEach(m => {
           const cKey = colDims.length > 0 || measureIds.length > 1 ? (cKeyBase ? `${cKeyBase} | ${m}` : m) : m;
           colKeysSet.add(cKey);
           matrix[rKey][cKey] = row[m];
         });
       });
       return { rowKeysSet, colKeysSet, matrix };
     };

     try {
       let mergedMatrix = {}; let allRowKeys = new Set(); let allColKeys = new Set();
       let calcRowTotals = {}; let calcColTotals = {}; let grandTotal = {};

       if (isMultiFactModel) {
         for (const [factId, factMeasures] of measuresByFact) {
           const sql = generateSQL(datasetId, allDims, factMeasures, filters, null, factId, overrideGlobalFilters);
           const results = await queryDuckDB(sql) || [];
           const { rowKeysSet, colKeysSet, matrix } = buildMatrix(results, factMeasures);
           rowKeysSet.forEach(k => allRowKeys.add(k)); colKeysSet.forEach(k => allColKeys.add(k));
           Object.entries(matrix).forEach(([rk, cols]) => {
             if (!mergedMatrix[rk]) mergedMatrix[rk] = {};
             Object.assign(mergedMatrix[rk], cols);
           });

           if (totalMode === 'calculated') {
             const rowSql = generateSQL(datasetId, rowDims, factMeasures, filters, null, factId, overrideGlobalFilters);
             const colSql = colDims.length > 0 ? generateSQL(datasetId, colDims, factMeasures, filters, null, factId, overrideGlobalFilters) : null;
             const grandSql = generateSQL(datasetId, [], factMeasures, filters, null, factId, overrideGlobalFilters);
             
             const [rRes, cRes, gRes] = await Promise.all([
               queryDuckDB(rowSql),
               colSql ? queryDuckDB(colSql) : Promise.resolve([]),
               queryDuckDB(grandSql)
             ]);
             
             rRes.forEach(row => {
               const rk = rowDims.map(d => row[d]).join(' | ');
               if (!calcRowTotals[rk]) calcRowTotals[rk] = {};
               factMeasures.forEach(m => calcRowTotals[rk][m] = row[m]);
             });
             cRes.forEach(row => {
               const ckBase = colDims.map(d => row[d]).join(' | ');
               factMeasures.forEach(m => {
                  const ck = ckBase ? `${ckBase} | ${m}` : m;
                  calcColTotals[ck] = row[m];
               });
             });
             if (gRes && gRes[0]) factMeasures.forEach(m => grandTotal[m] = gRes[0][m]);
           }
         }
       } else {
         const sql = generateSQL(datasetId, allDims, measureIds, filters, null, null, overrideGlobalFilters);
         const results = await queryDuckDB(sql) || [];
         const { rowKeysSet, colKeysSet, matrix } = buildMatrix(results, measureIds);
         allRowKeys = rowKeysSet; allColKeys = colKeysSet; mergedMatrix = matrix;

         if (totalMode === 'calculated') {
            const rowSql = generateSQL(datasetId, rowDims, measureIds, filters, null, null, overrideGlobalFilters);
            const colSql = colDims.length > 0 ? generateSQL(datasetId, colDims, measureIds, filters, null, null, overrideGlobalFilters) : null;
            const grandSql = generateSQL(datasetId, [], measureIds, filters, null, null, overrideGlobalFilters);
            
            const [rRes, cRes, gRes] = await Promise.all([
              queryDuckDB(rowSql),
              colSql ? queryDuckDB(colSql) : Promise.resolve([]),
              queryDuckDB(grandSql)
            ]);
            
            rRes.forEach(row => {
              const rk = rowDims.map(d => row[d]).join(' | ');
              calcRowTotals[rk] = {};
              measureIds.forEach(m => calcRowTotals[rk][m] = row[m]);
            });
            cRes.forEach(row => {
               const ckBase = colDims.map(d => row[d]).join(' | ');
               measureIds.forEach(m => {
                  const ck = ckBase ? `${ckBase} | ${m}` : m;
                  calcColTotals[ck] = row[m];
               });
            });
            if (gRes && gRes[0]) measureIds.forEach(m => grandTotal[m] = gRes[0][m]);
         }
       }

       return { 
         rowKeys: Array.from(allRowKeys).sort(), 
         colKeys: Array.from(allColKeys).sort(), 
         matrix: mergedMatrix,
         rowTotals: calcRowTotals,
         colTotals: calcColTotals,
         grandTotal: grandTotal
       };
     } catch (e) { console.error("Pivot Error:", e); throw e; }
   }, [generateSQL, getFactTablesInGroup, resolveMeasureOrigin, activeDatasetId, semanticModels, datasets, groupMeasuresByFact]);


  const getScatterData = useCallback(async (chart, overrideGlobalFilters = null) => {
    const datasetId = chart?.datasetId;
    const dimensionId = chart?.dimension;
    const xMeas = chart?.xMeasure;
    const yMeas = chart?.yMeasure;
    const cMeas = chart?.colorMeasure;
    const sMeas = chart?.sizeMeasure;
    const filters = chart?.filters || [];
    
    if (!datasetId || !dimensionId || !xMeas || !yMeas) return [];
    const measures = [xMeas, yMeas];
    if (cMeas) measures.push(cMeas);
    if (sMeas) measures.push(sMeas);
    const sql = generateSQL(datasetId, [dimensionId], measures, filters, 500, null, overrideGlobalFilters);
    try {
      const results = await queryDuckDB(sql);
      return results.map(row => ({ name: row[dimensionId], x: row[xMeas], y: row[yMeas], color: cMeas ? row[cMeas] : null, size: sMeas ? row[sMeas] : null }));
    } catch (e) { console.error("Scatter Error:", e); throw e; }
  }, [generateSQL]);

  const getUniqueValuesForDim = useCallback(async (datasetId, dimensionId) => {
    if (!datasetId || !dimensionId) return [];
    const cacheKey = `${datasetId}::${dimensionId}`;

    if (slicerOptionsCache.current[cacheKey]) return slicerOptionsCache.current[cacheKey];

    const ds = datasetsRef.current.find(d => d.id === datasetId);
    const tableName = ds?.tableName || datasetId;
    const sql = `SELECT DISTINCT \`${dimensionId}\` FROM \`${tableName}\` WHERE \`${dimensionId}\` IS NOT NULL ORDER BY 1 LIMIT 1000`;
    
    try {
      const results = await queryDuckDB(sql);
      const values = results.map(r => String(r[dimensionId] ?? Object.values(r)[0] ?? ''));
      slicerOptionsCache.current[cacheKey] = values;
      return values;
    } catch (e) { 
      console.error("Unique Values Error:", e); 
      return []; 
    }
  }, []);

  useEffect(() => {
    initDuckDB().catch(e => console.error("DuckDB Init failed:", e));
  }, []);

  const getMatrixData = useCallback(async (chart, overrideGlobalFilters = null) => {
    const { matrixMeasures = [], matrixColumns = [], datasetId } = chart;
    const scopeCols = matrixColumns.filter(c => c.type === 'scope');
    if (!datasetId || matrixMeasures.length === 0 || scopeCols.length === 0) return null;

    const factTablesInGroup = getFactTablesInGroup(datasetId);
    const isMultiFactModel = factTablesInGroup.length > 1;
    const localJoinGroup = getJoinGroup(datasetId);
    const isMasterView = factTablesInGroup.length > 0;
    const activeDs = datasets.find(d => d.id === datasetId);
    const sourceTable = isMasterView ? 'ds_unified' : (activeDs?.tableName || datasetId);

    const measuresByFact = new Map();
    matrixMeasures.forEach(measId => {
      const originFact = resolveMeasureOrigin(measId, factTablesInGroup, datasetId);
      if (!measuresByFact.has(originFact)) measuresByFact.set(originFact, []);
      measuresByFact.get(originFact).push(measId);
    });

    const activeGlobalFilters = overrideGlobalFilters || globalFilters;
    const slicerParts = [];
    Object.entries(activeGlobalFilters).forEach(([originKey, vals]) => {
      if (!vals || vals.length === 0) return;
      const [oDsId, oFId] = originKey.split('::');
      const colName = oFId ?? oDsId;
      const colIdent = isMasterView ? `\`${colName}\`` : `\`${sourceTable}\`.\`${colName}\``;
      const valList = vals.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ');
      slicerParts.push(`CAST(${colIdent} AS STRING) IN (${valList})`);
    });

    if (Array.isArray(authoredReportFilters) && authoredReportFilters.length > 0) {
        authoredReportFilters.forEach(f => {
            if (!f.dimensionId) return;
            const colIdent = isMasterView ? `\`${f.dimensionId}\`` : `\`${sourceTable}\`.\`${f.dimensionId}\``;
            if (f.operator === '=') slicerParts.push(`CAST(${colIdent} AS STRING) = '${String(f.value).replace(/'/g, "''")}'`);
            else if (f.operator === 'IN' && Array.isArray(f.value)) {
              slicerParts.push(`CAST(${colIdent} AS STRING) IN (${f.value.map(v=>`'${String(v).replace(/'/g,"''")}'`).join(',')})`);
            }
        });
    }

    // Process Inherited Authored Filters (Drill-Through Mode)
    if (overrideGlobalFilters && drillThroughState.active && Array.isArray(drillThroughState.authoredFilters)) {
        drillThroughState.authoredFilters.forEach(f => {
            if (!f.dimensionId) return;
            const colIdent = isMasterView ? `\`${f.dimensionId}\`` : `\`${sourceTable}\`.\`${f.dimensionId}\``;
            if (f.operator === '=') slicerParts.push(`CAST(${colIdent} AS STRING) = '${String(f.value).replace(/'/g, "''")}'`);
            else if (f.operator === 'IN' && Array.isArray(f.value)) {
              slicerParts.push(`CAST(${colIdent} AS STRING) IN (${f.value.map(v=>`'${String(v).replace(/'/g,"''")}'`).join(',')})`);
            }
        });
    }

    const whereClause = slicerParts.length > 0 ? ` WHERE ${slicerParts.join(' AND ')}` : '';

    const buildScopeCondition = (col) => {
      const parts = [];
      (col.filters || []).forEach(filt => {
        if (!filt.dimensionId || filt.value === '') return;
        const col_ref = `\`${sourceTable}\`.\`${filt.dimensionId}\``;
        const val = String(filt.value).replace(/'/g, "''");
        if (filt.operator === '=') parts.push(`CAST(${col_ref} AS STRING) = '${val}'`);
        else if (filt.operator === 'IN') {
          const items = (Array.isArray(filt.value) ? filt.value : String(filt.value).split(',')).map(v => `'${String(v).trim().replace(/'/g,"''")}'`).join(',');
          parts.push(`CAST(${col_ref} AS STRING) IN (${items})`);
        }
      });
      if (col.timeConfig?.enabled && col.timeConfig?.dateDimensionId) {
        const dateCol = `SAFE_CAST(\`${sourceTable}\`.\`${col.timeConfig.dateDimensionId}\` AS DATE)`;
        const todayStr = new Date().toISOString().split('T')[0];
        const staticRef = `CAST('${todayStr}' AS DATE)`;
        const fyRow = `(CASE WHEN EXTRACT(MONTH FROM ${dateCol}) >= 4 THEN EXTRACT(YEAR FROM ${dateCol}) + 1 ELSE EXTRACT(YEAR FROM ${dateCol}) END)`;
        const fyRef = `(CASE WHEN EXTRACT(MONTH FROM ${staticRef}) >= 4 THEN EXTRACT(YEAR FROM ${staticRef}) + 1 ELSE EXTRACT(YEAR FROM ${staticRef}) END)`;
        if (col.timeConfig.period === 'YTD') parts.push(`(${fyRow} = ${fyRef} AND ${dateCol} <= ${staticRef})`);
        else if (col.timeConfig.period === 'LY') parts.push(`(${fyRow} = ${fyRef} - 1)`);
      }
      return parts.length > 0 ? parts.join(` ${col.filterLogic || 'AND'} `) : 'TRUE';
    };

    const buildMeasureExpr = (measId, extraConditions = [], visited = new Set()) => {
      if (visited.has(measId)) return 'NULL'; // cycle guard
      visited.add(measId);
      let f = null;
      for (const dsId of localJoinGroup) {
        f = semanticModels[dsId]?.find(x => x.id === measId);
        if (f) break;
      }
      if (!f) return `SUM(\`${sourceTable}\`.\`${measId}\`)`;
      const allConds = [...extraConditions];

      if (f.isCalculated && f.expression) {
        // Recursively resolve formula — e.g. [Sales] / [Units_Sold]
        let evalStr = f.expression;
        const matches = evalStr.match(/\[(.*?)\]/g) || [];
        for (const match of matches) {
          const innerId = match.slice(1, -1);
          const innerSQL = buildMeasureExpr(innerId, allConds, new Set(visited));
          evalStr = evalStr.replace(match, `COALESCE(CAST((${innerSQL}) AS FLOAT64), 0)`);
        }
        return `(${evalStr || 'NULL'})`;
      }

      const col_ref = `\`${sourceTable}\`.\`${f.id}\``;
      const agg = f.aggType === 'countDistinct' ? 'COUNT(DISTINCT ' : (f.aggType === 'count' ? 'COUNT(' : `${(f.aggType || 'SUM').toUpperCase()}(`);
      if (allConds.length > 0) return `${agg}CASE WHEN ${allConds.join(' AND ')} THEN ${col_ref} ELSE NULL END)`;
      return `${agg}${col_ref})`;
    };

    const mergedResult = {};
    for (const [scopedFactId, factMeasures] of measuresByFact) {
        const ctePrefix = isMasterView ? generateUnifiedCTE(scopedFactId, isMultiFactModel) : '';
        const selectParts = [];
        scopeCols.forEach(col => {
            const condition = buildScopeCondition(col);
            const safeColId = col.id.replace(/[^a-zA-Z0-9_]/g, '_');
            factMeasures.forEach(measId => {
                const safeMeasId = measId.replace(/[^a-zA-Z0-9_]/g, '_');
                const resolvedExpr = buildMeasureExpr(measId, [condition]);
                selectParts.push(`${resolvedExpr} AS \`m_${safeMeasId}_${safeColId}\``);
            });
        });
        if (selectParts.length === 0) continue;
        const renderSource = sourceTable === "ds_unified" ? sourceTable : `\`${sourceTable}\``;
        const sql = `${ctePrefix}SELECT ${selectParts.join(', ')} FROM ${renderSource}${whereClause}`;
        try {
            const results = await queryDuckDB(sql);
            if (results && results[0]) Object.assign(mergedResult, results[0]);
        } catch (err) { console.error(`Matrix Batch failed:`, err); }
    }
    return Object.keys(mergedResult).length > 0 ? mergedResult : null;
  }, [datasets, semanticModels, globalFilters, drillThroughState, authoredReportFilters, getJoinGroup, generateUnifiedCTE, getFactTablesInGroup, resolveMeasureOrigin]);

  return {
    datasets,
    semanticModels,
    maxDatesCache,
    isLoading,
    loadDataset,
    deleteDataset,
    joinDatasets,
    updateSemanticModel,
    getUniqueValuesForDim,
    globalSemanticFields,
    applyFilters,
    getAggregatedData,
    getHierarchicalData,
    getPivotData,
    getTableData,
    getScatterData,
    getMatrixData,
    executeExploreQuery: async (dsId, dims, meass, filts, limit) => await queryDuckDB(generateSQL(dsId, dims, meass, filts, limit)),
    generateUnifiedCTE,
    datesReady
  };
};
