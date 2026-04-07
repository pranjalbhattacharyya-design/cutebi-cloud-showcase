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
    activeDatasetId, setActiveDatasetId,
    hiddenDatasetIds,
    globalSemanticFields, isUnified,
    isUploading, setIsUploading,
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
  const generateUnifiedCTE = useCallback((rootId = null) => {
    const startId = rootId || activeDatasetId;
    if (!startId) return "";
    const activeDs = datasets.find(d => d.id === startId);
    if (!activeDs) return "";

    const baseTable = getCleanTableName(startId);
    const joinedTables = new Set([startId]);
    const queue = [startId];
    
    let selectItems = [`\`${baseTable}\`.*`];
    let joinStrings = [];
    const usedJoinKeys = new Set(); // Prevent duplicate join keys in select if possible

    // Breadth-First Search to traverse the relationship graph starting from the active dataset
    while (queue.length > 0) {
        const currentDsId = queue.shift();
        const currentTableName = getCleanTableName(currentDsId);
        
        // Find all relationships connected to the current table in our traversal
        const rels = relationships.filter(r => r.fromDatasetId === currentDsId || r.toDatasetId === currentDsId);
        
        rels.forEach(rel => {
            const isFrom = rel.fromDatasetId === currentDsId;
            const targetId = isFrom ? rel.toDatasetId : rel.fromDatasetId;
            const targetTable = getCleanTableName(targetId);
            
            if (!joinedTables.has(targetId)) {
                joinedTables.add(targetId);
                queue.push(targetId);
                
                const sourceCol = isFrom ? rel.fromColumn : rel.toColumn;
                const targetCol = isFrom ? rel.toColumn : rel.fromColumn;
                
                // Add the table's data, excluding the join key to avoid naming collisions
                selectItems.push(`\`${targetTable}\`.* EXCEPT (\`${targetCol}\`)`);
                
                // Construct the join back to the current table in the traversal path
                joinStrings.push(` LEFT JOIN \`${targetTable}\` ON \`${currentTableName}\`.\`${sourceCol}\` = \`${targetTable}\`.\`${targetCol}\``);
            }
        });
    }

    const sql = `WITH ds_unified AS (SELECT ${selectItems.join(', ')} FROM \`${baseTable}\`${joinStrings.join('')}) `;
    
    // --- Unified Model Debug Trace: Log the exact join path to the debug panel ---
    if (joinStrings.length > 0) {
        window.dispatchEvent(new CustomEvent('mvantage-debug', { 
            detail: { 
                type: 'success', 
                category: 'Join Trace', 
                message: `Unified Model Active: [${Array.from(joinedTables).map(id => datasets.find(d=>d.id===id)?.name || id).join(' -> ')}]`,
                details: { tableCount: joinedTables.size, joins: joinStrings.length }
            } 
        }));
    }

    return sql;
  }, [activeDatasetId, relationships, getCleanTableName, datasets]);

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




  // --- SQL Generator Helper: Unified Approach ---
  const generateSQL = useCallback((datasetId, dimensions = [], measures = [], filters = [], limit = null) => {
    const activeJoinGroup = getJoinGroup(activeDatasetId);
    const isMasterView = activeJoinGroup.includes(datasetId);
    const activeDs = datasets.find(d => d.id === datasetId);
    const sourceTable = isMasterView ? "ds_unified" : (activeDs?.tableName || datasetId);
    const ctePrefix = isMasterView ? generateUnifiedCTE(datasetId) : "";

    window.dispatchEvent(new CustomEvent('mvantage-debug', { 
      detail: { 
        type: 'info', 
        category: 'Engine', 
        message: `Generating SQL. Source: ${sourceTable}`, 
        details: { dimensions, measures, filters, ctePresent: !!ctePrefix } 
      } 
    }));

    let selectClause = [];
    const sm = semanticModels[datasetId] || [];

    dimensions.forEach(dimId => {
       if (dimId.includes('::')) {
           const [oDsId, oFId] = dimId.split('::');
           if (isMasterView) {
               selectClause.push(`\`${sourceTable}\`.\`${oFId}\` AS \`${dimId}\``);
           } else {
               const targetDs = datasets.find(d => d.id === oDsId);
               const targetTable = targetDs?.tableName || oDsId;
               selectClause.push(`\`${targetTable}\`.\`${oFId}\` AS \`${dimId}\``);
           }
       } else {
           selectClause.push(`\`${sourceTable}\`.\`${dimId}\` AS \`${dimId}\``);
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
        const activeJoinGroup = getJoinGroup(activeDatasetId);
        let f = null;
        for (const dsId of activeJoinGroup) {
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
    
    // 1. Process global UI filters
    Object.entries(globalFilters).forEach(([originKey, vals]) => {
      if (!vals || vals.length === 0) return;
      const [oDsId, oFId] = originKey.split('::');
      const colName = oFId ?? oDsId; // if no '::' separator, the whole key IS the column name
      const table = datasets.find(d => d.id === oDsId)?.tableName || oDsId;
      const colIdent = isMasterView ? `\`${colName}\`` : `\`${table}\`.\`${colName}\``;
      const valList = vals.map(v => typeof v === 'string' ? `'${String(v).replace(/'/g, "''")}'` : v).join(', ');
      filterParts.push(`CAST(${colIdent} AS STRING) IN (${valList})`);
    });
    
    // 2. Process AI-generated filters
    const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (Array.isArray(filters)) {
      filters.forEach(f => {
        if (!f.field || !f.value) return;
        const colIdent = isMasterView ? `\`${f.field}\`` : `\`${sourceTable}\`.\`${f.field}\``;
        const rawVal = String(f.value).trim();
        
        // Normalize AI operators to SQL standard
        const opMap = { 'eq': '=', 'neq': '!=', '==': '=' };
        let op = opMap[f.operator?.toLowerCase()] || f.operator || "=";
        const opLower = op.toLowerCase();
        
        // Check if this field is a dimension for fuzzy matching
        const isDim = globalSemanticFields.some(sf => (sf.id === f.field || sf.originFieldId === f.field) && sf.type === 'dimension');

        // Explicitly handle REGEXP_CONTAINS as a function (BigQuery requirement)
        if (opLower === 'regexp_contains') {
            filterParts.push(`REGEXP_CONTAINS(LOWER(CAST(${colIdent} AS STRING)), LOWER('${rawVal.replace(/'/g, "''")}'))`);
            return;
        }
        
        if (isDim && (opLower === "=" || opLower === "==" || opLower === "contains" || opLower === "in")) {
            // HIGH-RECALL ARCHITECTURE: Use REGEXP_CONTAINS for all dimensional lookups
            // This handles partial matches ("26" -> "2026"), Case-Insensitivity, and Lists ("26|25")
            let items = [];
            
            if (opLower === "in") {
                try {
                    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
                        const parsed = JSON.parse(rawVal);
                        if (Array.isArray(parsed)) items = parsed.map(v => String(v));
                    }
                } catch (e) { /* fallback to NLP split */ }
                
                if (items.length === 0) {
                    const valClean = rawVal.replace(/\b(and|vs|or)\b/gi, ',');
                    items = valClean.split(',').map(v => v.trim()).filter(v => v !== "");
                }
            } else {
                items = [rawVal];
            }

            if (items.length > 0) {
                const pattern = items.map(escapeRegex).join('|');
                filterParts.push(`REGEXP_CONTAINS(LOWER(CAST(${colIdent} AS STRING)), LOWER('${pattern.replace(/'/g, "''")}'))`);
            }
        } else if (opLower === "in") {
            // Standard IN for measures (strict matching)
            const valClean = rawVal.replace(/\b(and|vs|or)\b/gi, ',');
            const items = valClean.split(',').map(v => v.trim()).filter(v => v !== "");
            const inList = items.map(v => `'${String(v).replace(/'/g, "''")}'`).join(', ');
            if (items.length > 0) filterParts.push(`CAST(${colIdent} AS STRING) IN (${inList})`);
        } else if (opLower === "=" || opLower === "==") {
            filterParts.push(`LOWER(CAST(${colIdent} AS STRING)) = LOWER('${rawVal.replace(/'/g, "''")}')`);
        } else {
            // Fallback for !=, <, >, etc.
            filterParts.push(`CAST(${colIdent} AS STRING) ${op} '${rawVal.replace(/'/g, "''")}'`);
        }

      });
    }



    if (filterParts.length > 0) whereClause = ` WHERE ${filterParts.join(' AND ')}`;

    const groupByClause = dimensions.length > 0 ? ` GROUP BY ${dimensions.map((_, i) => i + 1).join(', ')}` : "";
    const limitClause = limit ? ` LIMIT ${limit}` : "";
    const sql = `${ctePrefix}SELECT ${selectClause.join(', ')} FROM \`${sourceTable}\`${whereClause}${groupByClause}${limitClause}`;
    
    window.dispatchEvent(new CustomEvent('mvantage-debug', { 
       detail: { type: 'success', category: 'Engine', message: 'SQL Generated Successfully', details: { sql } } 
    }));
    
    return sql;
  }, [datasets, semanticModels, activeDatasetId, relationships, globalFilters, generateUnifiedCTE]);


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

  const getAggregatedData = useCallback(async (datasetId, dimensionId, measureId, legendId) => {
    if (!datasetId || !dimensionId || !measureId) return { data: [], legendKeys: [] };
    const dimensions = [dimensionId];
    if (legendId) dimensions.push(legendId);
    const sql = generateSQL(datasetId, dimensions, [measureId]);
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

  const getPivotData = useCallback(async (datasetId, rowDims, colDims, measureIds) => {
     if (!datasetId || !rowDims?.length || !measureIds?.length) return { rowKeys: [], colKeys: [], matrix: {} };
     const sql = generateSQL(datasetId, [...(rowDims || []), ...(colDims || [])], measureIds);
     try {
       const results = await queryDuckDB(sql);
       const matrix = {};
       const colKeysSet = new Set();
       const rowKeysSet = new Set();
       results.forEach(row => {
          const rowKey = rowDims.map(d => row[d]).join(' | ');
          const baseColKey = colDims?.length ? colDims.map(d => row[d]).join(' | ') : 'All';
          rowKeysSet.add(rowKey);
          if (!matrix[rowKey]) matrix[rowKey] = {};
          measureIds.forEach(mId => {
             const fullColKey = measureIds.length > 1 ? `${baseColKey} | ${mId}` : baseColKey;
             colKeysSet.add(fullColKey);
             matrix[rowKey][fullColKey] = row[mId];
          });
       });
       return { rowKeys: Array.from(rowKeysSet).sort(), colKeys: Array.from(colKeysSet).sort(), matrix };
     } catch (e) { console.error("Pivot Error:", e); throw e; }
  }, [generateSQL]);

  const getTableData = useCallback(async (datasetId, dimensions, measures) => {
     if (!datasetId || (!dimensions?.length && !measures?.length)) return { headers: [], headerIds: [], rows: [] };
     const sql = generateSQL(datasetId, dimensions, measures);
     const sm = semanticModels[datasetId] || [];
     try {
       const rows = await queryDuckDB(`${sql} LIMIT 100`) || [];
       const resolveLabel = (id) => {
           const localField = sm.find(x => x.id === id);
           if (localField) return localField.label;
           if (id.includes('::')) {
               const [oDsId, oFId] = id.split('::');
               const ds = datasets.find(d => d.id === oDsId);
               return ds ? `${oFId} (${ds.name})` : oFId;
           }
           return id;
       };
       const headers = [...(dimensions || []).map(resolveLabel), ...(measures || []).map(resolveLabel)];
       const headerIds = [...(dimensions || []), ...(measures || [])];
       return { headers, headerIds, rows };
     } catch (e) { console.error("Table Error:", e); throw e; }
  }, [generateSQL, semanticModels, datasets]);

  const getScatterData = useCallback(async (datasetId, dimensionId, xMeas, yMeas, cMeas, sMeas) => {
    if (!datasetId || !dimensionId || !xMeas || !yMeas) return [];
    const measures = [xMeas, yMeas];
    if (cMeas) measures.push(cMeas);
    if (sMeas) measures.push(sMeas);
    const sql = generateSQL(datasetId, [dimensionId], measures);
    try {
      const results = await queryDuckDB(sql);
      return results.map(row => ({ name: row[dimensionId], x: row[xMeas], y: row[yMeas], color: cMeas ? row[cMeas] : null, size: sMeas ? row[sMeas] : null }));
    } catch (e) { console.error("Scatter Error:", e); throw e; }
  }, [generateSQL]);

  const getUniqueValuesForDim = useCallback(async (datasetId, dimensionId) => {
    if (!datasetId || !dimensionId) return [];
    const cacheKey = `${datasetId}::${dimensionId}`;

    // Return cached result immediately — handles StrictMode double-invoke and re-opens
    if (slicerOptionsCache.current[cacheKey]) return slicerOptionsCache.current[cacheKey];

    // Query the raw source table directly (no expensive join needed for dropdown population)
    const ds = datasetsRef.current.find(d => d.id === datasetId);
    const tableName = ds?.tableName || datasetId;
    const sql = `SELECT DISTINCT \`${dimensionId}\` FROM \`${tableName}\` WHERE \`${dimensionId}\` IS NOT NULL ORDER BY 1 LIMIT 1000`;
    
    try {
      const results = await queryDuckDB(sql);
      const values = results.map(r => String(r[dimensionId] ?? Object.values(r)[0] ?? ''));
      slicerOptionsCache.current[cacheKey] = values; // Populate cache
      return values;
    } catch (e) { 
      console.error("Unique Values Error:", e); 
      return []; 
    }
  }, []); // Empty deps: stable reference for the lifetime of the hook instance

  // Auto-initialize DuckDB on mount
  useEffect(() => {
    initDuckDB().catch(e => console.error("DuckDB Init failed:", e));
  }, []);


  // --- KPI Matrix Data Fetcher ---
  const getMatrixData = useCallback(async (chart) => {
    const { matrixMeasures = [], matrixColumns = [], datasetId } = chart;
    const scopeCols = matrixColumns.filter(c => c.type === 'scope');
    if (!datasetId || matrixMeasures.length === 0 || scopeCols.length === 0) return null;

    const activeJoinGroup = getJoinGroup(activeDatasetId);
    const isMasterView = activeJoinGroup.includes(datasetId);
    const activeDs = datasets.find(d => d.id === datasetId);
    const sourceTable = isMasterView ? 'ds_unified' : (activeDs?.tableName || datasetId);
    const ctePrefix = isMasterView ? generateUnifiedCTE(datasetId) : '';

    // Build outer WHERE from global slicers
    const slicerParts = [];
    Object.entries(globalFilters).forEach(([originKey, vals]) => {
      if (!vals || vals.length === 0) return;
      const [oDsId, oFId] = originKey.split('::');
      const colName = oFId ?? oDsId;
      const colIdent = isMasterView ? `\`${colName}\`` : `\`${sourceTable}\`.\`${colName}\``;
      const valList = vals.map(v => `'${String(v).replace(/'/g, "''")}' `).join(', ');
      slicerParts.push(`CAST(${colIdent} AS STRING) IN (${valList})`);
    });
    const whereClause = slicerParts.length > 0 ? ` WHERE ${slicerParts.join(' AND ')}` : '';

    // Helper: build CASE WHEN condition string for one scope column
    const buildScopeCondition = (col) => {
      const parts = [];

      // Filter context
      (col.filters || []).forEach(filt => {
        if (!filt.dimensionId || filt.value === '') return;
        const col_ref = `\`${sourceTable}\`.\`${filt.dimensionId}\``;
        const val = String(filt.value).replace(/'/g, "''");
        if (filt.operator === '=') parts.push(`CAST(${col_ref} AS STRING) = '${val}'`);
        else if (filt.operator === '!=') parts.push(`CAST(${col_ref} AS STRING) <> '${val}'`);
        else if (filt.operator === 'contains') parts.push(`LOWER(CAST(${col_ref} AS STRING)) LIKE LOWER('%${val}%')`);
        else if (filt.operator === 'IN') {
          const items = val.split(',').map(v => `'${v.trim().replace(/'/g,"''")}'`).join(',');
          parts.push(`CAST(${col_ref} AS STRING) IN (${items})`);
        }
      });
      const filterLogic = col.filterLogic || 'AND';

      // Time intelligence
      if (col.timeConfig?.enabled && col.timeConfig?.dateDimensionId) {
        const dateCol = `SAFE_CAST(\`${sourceTable}\`.\`${col.timeConfig.dateDimensionId}\` AS DATE)`;
        const _now = new Date();
        const todayStr = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;
        const staticRef = `CAST('${todayStr}' AS DATE)`;
        const fyRow = `(CASE WHEN EXTRACT(MONTH FROM ${dateCol}) >= 4 THEN EXTRACT(YEAR FROM ${dateCol}) + 1 ELSE EXTRACT(YEAR FROM ${dateCol}) END)`;
        const fyRef = `(CASE WHEN EXTRACT(MONTH FROM ${staticRef}) >= 4 THEN EXTRACT(YEAR FROM ${staticRef}) + 1 ELSE EXTRACT(YEAR FROM ${staticRef}) END)`;
        const mo = `EXTRACT(MONTH FROM ${dateCol})`;
        const moRef = `EXTRACT(MONTH FROM ${staticRef})`;
        switch (col.timeConfig.period) {
          case 'YTD':   parts.push(`(${fyRow} = ${fyRef} AND ${dateCol} <= ${staticRef})`); break;
          case 'LYYTD': parts.push(`(${fyRow} = ${fyRef} - 1 AND ${dateCol} <= ${staticRef} - INTERVAL 1 YEAR)`); break;
          case 'MTD':   parts.push(`(${fyRow} = ${fyRef} AND ${mo} = ${moRef} AND ${dateCol} <= ${staticRef})`); break;
          case 'LY':    parts.push(`(${fyRow} = ${fyRef} - 1)`); break;
          default: break;
        }
      }

      return parts.length > 0 ? parts.join(` ${filterLogic} `) : 'TRUE';
    };

    // For each measure × scope column, generate CASE WHEN aggregate + date bounds
    const selectParts = [];
    scopeCols.forEach(col => {
      const condition = buildScopeCondition(col);
      const safeColId = col.id.replace(/[^a-zA-Z0-9_]/g, '_');

      matrixMeasures.forEach(measId => {
        const safeMeasId = measId.replace(/[^a-zA-Z0-9_]/g, '_');
        const measField = (() => {
          for (const dsId of activeJoinGroup) {
            const f = semanticModels[dsId]?.find(x => x.id === measId);
            if (f) return f;
          }
          return null;
        })();
        const rawCol = measField ? `\`${sourceTable}\`.\`${measField.id}\`` : `\`${sourceTable}\`.\`${measId}\``;
        const agg = measField?.aggType === 'countDistinct' ? 'COUNT(DISTINCT' : (measField?.aggType === 'count' ? 'COUNT(' : 'SUM(');
        selectParts.push(
          `${agg}CASE WHEN (${condition}) THEN ${rawCol} ELSE NULL END) AS \`m_${safeMeasId}_${safeColId}\``
        );
      });

      // Dynamic date bounds (if a date field is configured via time intelligence or any filter uses a date dim)
      const dateDimId = col.timeConfig?.enabled ? col.timeConfig?.dateDimensionId : '';
      if (dateDimId) {
        const dc = `SAFE_CAST(\`${sourceTable}\`.\`${dateDimId}\` AS DATE)`;
        const safeColId2 = col.id.replace(/[^a-zA-Z0-9_]/g, '_');
        selectParts.push(`MIN(CASE WHEN (${condition}) THEN ${dc} END) AS \`start_${safeColId2}\``);
        selectParts.push(`MAX(CASE WHEN (${condition}) THEN ${dc} END) AS \`end_${safeColId2}\``);
      }
    });

    if (selectParts.length === 0) return null;

    const sql = `${ctePrefix}SELECT ${selectParts.join(', ')} FROM \`${sourceTable}\`${whereClause}`;

    window.dispatchEvent(new CustomEvent('mvantage-debug', {
      detail: { type: 'info', category: 'Matrix', message: 'KPI Matrix SQL Generated', details: { sql } }
    }));

    try {
      // Direct (non-batched) call so BigQuery errors are surfaced in debug panel
      const response = await apiClient.post('/query', { sql });

      if (response?.error) {
        window.dispatchEvent(new CustomEvent('mvantage-debug', {
          detail: { type: 'error', category: 'Matrix', message: `BigQuery error: ${response.error}`, details: { transformedSql: response.sql } }
        }));
        return null;
      }

      const rows = response?.data || [];
      const row = rows[0] || null;
      window.dispatchEvent(new CustomEvent('mvantage-debug', {
        detail: { type: 'success', category: 'Matrix', message: 'KPI Matrix raw result', details: {
          engine: response?.engine,
          resultsLength: rows.length,
          firstRowKeys: row ? Object.keys(row) : null,
          firstRow: row
        }}
      }));
      return row;
    } catch (err) {
      console.error('[getMatrixData] Query failed:', err);
      window.dispatchEvent(new CustomEvent('mvantage-debug', {
        detail: { type: 'error', category: 'Matrix', message: `Query exception: ${err.message}` }
      }));
      return null;
    }
  }, [activeDatasetId, datasets, semanticModels, globalFilters, getJoinGroup, generateUnifiedCTE]);

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
    getPivotData,
    getTableData,
    getScatterData,
    getMatrixData,
    executeExploreQuery: async (dsId, dims, meass, filts, limit) => await queryDuckDB(generateSQL(dsId, dims, meass, filts, limit)),
    generateUnifiedCTE,
    datesReady
  };
};
