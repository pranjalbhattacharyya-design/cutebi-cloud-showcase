import { useRef } from 'react';
import { useAppState } from '../contexts/AppStateContext';
import { useDataEngine } from './useDataEngine';
import { syncSemanticModels } from '../utils/dataParser';
import { apiClient } from '../services/api';

// ---------------------------------------------------------------------------
// Shared AI proxy helper
// All Gemini/Imagen calls go through the FastAPI backend.
// The API key NEVER lives in the browser.
// ---------------------------------------------------------------------------
async function callAI(payload) {
  const result = await apiClient.aiExplore(payload);
  if (!result?.text) throw new Error('Empty response from AI server.');
  return result.text;
}

export const useAI = () => {
  const {
    activeDataset, isThinking, setIsThinking, showToast,
    setDatasets, setSemanticModels, activeDatasetId, relationships,
    semanticModels, datasets, chatInput, setChatInput,
    aiMode, exploreHistory, setExploreHistory,
    setPendingAIAction, activePageId,
    setAiError, setIsExploreOpen, setAiMode, pendingAIAction,
    aiThinkingLabel, setAiThinkingLabel,
    deepDiveHierarchy, setDeepDiveHierarchy,
    hierarchyPending, setHierarchyPending,
    lastIntentState, setLastIntentState,
    lastSummaryPayload, setLastSummaryPayload,
  } = useAppState();

  const { globalSemanticFields, executeExploreQuery, generateUnifiedCTE } = useDataEngine();

  // Per-conversation session cache (resets on page refresh)
  const sessionCache = useRef({
    dataTable: null,
    microInsight: null,
    mesoInsight: null,
    macroInsight: null,
  });

  // ---------------------------------------------------------------------------
  // Build enriched semantic context payload
  // ---------------------------------------------------------------------------
  const buildSemanticContext = () => {
    const dimensions = globalSemanticFields
      .filter(f => f.type === 'dimension' && !f.isHidden)
      .map(d => ({
        id: d.value,
        label: d.rawLabel,
        description: d.description || '',
      }));

    const measures = globalSemanticFields
      .filter(f => f.type === 'measure' && !f.isHidden)
      .map(m => ({
        id: m.value,
        label: m.rawLabel,
        description: m.description || '',
        aggType: m.aggType || 'sum',
        isTimeIntelligence: m.timeConfig?.enabled || false,
        timePeriod: m.timeConfig?.period || null,
      }));

    // Base table description (root fact dataset only)
    const model_description = activeDataset?.description || activeDataset?.name || '';

    return { dimensions, measures, model_description };
  };

  // ---------------------------------------------------------------------------
  // Auto-fill descriptions (Build mode — calls Gemini via backend proxy)
  // ---------------------------------------------------------------------------
  const handleAutoFillDescriptions = async () => {
    if (!activeDataset || isThinking) return;
    setIsThinking(true);
    setAiThinkingLabel('Generating descriptions...');
    showToast('✨ AI is analyzing your data to write descriptions...');

    const prompt = `Analyze this dataset.
Table Name: ${activeDataset.name}
Columns: ${activeDataset.headers.join(', ')}

Write a short, professional business description for the table itself, and a short business description for each column.
Return JSON format EXACTLY matching this schema:
{
  "tableDescription": "string",
  "columns": [
    { "id": "string (the exact column name)", "description": "string" }
  ]
}`;

    try {
      const text = await callAI({ query: prompt, phase: 'auto_fill', model_description: '', dimensions: [], measures: [] });
      const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const aiData = JSON.parse(clean);
      
      window.dispatchEvent(new CustomEvent('mvantage-debug', { 
         detail: { type: 'info', category: 'Auto-Fill', message: `Parsed JSON from Gemini API:`, details: aiData } 
      }));
      
      setDatasets(prev => prev.map(d => d.id === activeDatasetId ? { ...d, description: aiData.tableDescription } : d));
      setSemanticModels(prev => {
        const next = { ...prev };
        const model = next[activeDatasetId] || [];
        next[activeDatasetId] = model.map(field => {
          const aiMatch = aiData.columns?.find(c => {
             if (!c || !c.id) return false;
             const cid = String(c.id).trim().toLowerCase();
             const fid = field.id ? String(field.id).trim().toLowerCase() : '';
             const oId = field.originalId ? String(field.originalId).trim().toLowerCase() : '';
             return cid === fid || cid === oId;
          });
          if (aiMatch && aiMatch.description) return { ...field, description: aiMatch.description };
          return field;
        });
        return syncSemanticModels(next, relationships);
      });
      showToast('✨ Descriptions auto-filled successfully!');
    } catch (e) {
      console.error('Auto-fill failed:', e);
      showToast("Oops! AI couldn't generate descriptions right now.");
    } finally {
      setIsThinking(false);
      setAiThinkingLabel('Analyzing...');
    }
  };

  // ---------------------------------------------------------------------------
  // handleConfirmPendingAI (Build mode measure approval — unchanged)
  // ---------------------------------------------------------------------------
  const handleConfirmPendingAI = () => {
    if (!pendingAIAction) return;
    const { measures, charts } = pendingAIAction;

    let updatedModel = [...(semanticModels[activeDatasetId] || [])];

    const mapIdToLocalActiveDs = (origStr) => {
      if (!origStr) return '';
      if (!origStr.includes('::')) return origStr;
      const [oDsId, oFId] = origStr.split('::');
      const f = (semanticModels[activeDatasetId] || []).find(x => (x.originDatasetId || activeDatasetId) === oDsId && (x.originFieldId || x.id) === oFId);
      return f ? f.id : '';
    };

    if (measures?.length > 0) {
      const newFields = measures.map(calc => {
        let baseId = calc.label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        if (!baseId || baseId === '_') baseId = 'calc';
        let newCalcId = baseId; let count = 1;
        while (updatedModel.some(m => m.id === newCalcId)) { newCalcId = `${baseId}_${count}`; count++; }
        return {
          id: newCalcId, label: calc.label, type: 'measure', isHidden: false,
          isCalculated: true, format: calc.format || 'auto', description: 'AI Generated Measure',
          expression: `[${mapIdToLocalActiveDs(calc.op1) || calc.op1}] ${calc.operator || '+'} [${mapIdToLocalActiveDs(calc.op2) || calc.op2}]`,
          filters: [], filterLogic: 'AND',
          timeConfig: { enabled: false, dateDimensionId: '', period: 'MTD' },
          originDatasetId: activeDatasetId, originFieldId: newCalcId, category: 'Uncategorized',
        };
      });
      updatedModel = [...updatedModel, ...newFields];
      setSemanticModels(prev => syncSemanticModels({ ...prev, [activeDatasetId]: updatedModel }, relationships));
    }

    if (charts?.length > 0) {
      const resolveDs = (origins) => {
        const req = origins.filter(o => o?.includes('::'));
        if (!req.length) return activeDatasetId;
        for (const dsId of datasets.map(d => d.id)) {
          const model = semanticModels[dsId] || [];
          if (req.every(o => { const [od, of_] = o.split('::'); return model.some(f => (f.originDatasetId || dsId) === od && (f.originFieldId || f.id) === of_); })) return dsId;
        }
        return null;
      };
      const fuzzy = (val) => {
        if (!val) return null;
        if (val.includes('::')) return val;
        const exact = globalSemanticFields.find(f => f.rawLabel.toLowerCase() === val.toLowerCase() || f.value === val);
        return exact ? exact.value : val;
      };
      const newCharts = charts.map((chart, idx) => {
        const mD = fuzzy(chart.dimension), mM = fuzzy(chart.measure);
        const mX = fuzzy(chart.xMeasure), mY = fuzzy(chart.yMeasure);
        const mPR = (chart.pivotRows || []).map(fuzzy).filter(Boolean);
        const mPC = (chart.pivotCols || []).map(fuzzy).filter(Boolean);
        const mPM = (chart.pivotMeasures || []).map(fuzzy).filter(Boolean);
        const bestDs = resolveDs([mD, mM, mX, mY, ...mPR, ...mPC, ...mPM]) || activeDatasetId;
        const local = (s) => {
          if (!s) return '';
          if (!s.includes('::')) return s;
          const [od, of_] = s.split('::');
          const f = semanticModels[bestDs]?.find(x => (x.originDatasetId || bestDs) === od && (x.originFieldId || x.id) === of_);
          return f ? f.id : '';
        };
        return {
          ...chart,
          dimension: local(mD), measure: local(mM), xMeasure: local(mX), yMeasure: local(mY),
          showDataLabels: true,
          pivotRows: mPR.map(local).filter(Boolean), pivotCols: mPC.map(local).filter(Boolean),
          pivotMeasures: mPM.map(local).filter(Boolean),
          id: Date.now() + '_ai_' + idx, datasetId: bestDs, verticalSize: chart.verticalSize || 'normal',
        };
      });
      const valid = newCharts.filter(c => {
        if (c.type === 'pivot') return c.pivotRows?.length > 0 && c.pivotMeasures?.length > 0;
        if (c.type === 'scatter') return c.dimension && c.xMeasure && c.yMeasure;
        return c.dimension && c.measure;
      });
      if (valid.length > 0) setPendingAIAction(prev => ({ ...prev, charts: valid }));
    }

    setPendingAIAction(null);
    showToast('✨ Action completed!');
  };

  // ---------------------------------------------------------------------------
  // handleGenerateInfographic — Canvas-based, zero Imagen cost
  // Gemini returns structured JSON → rendered in browser via InfographicCanvas
  // ---------------------------------------------------------------------------
  const handleGenerateInfographic = async (text, userQuery) => {
    setIsThinking(true);
    setAiThinkingLabel('Building your infographic...');
    showToast('✨ Structuring your key insights...');

    try {
      const jsonText = await callAI({
        query:          'Generate infographic data',
        phase:          'infographic_data',
        model_description: '',
        dimensions:     [],
        measures:       [],
        data_table:     [],
        prior_output:   String(text).substring(0, 3000),
      });

      const infographicData = JSON.parse(
        jsonText.replace(/```json/gi, '').replace(/```/g, '').trim()
      );

      setExploreHistory(prev => [
        ...prev,
        {
          role: 'ai',
          text: '📊 Infographic ready — click Download to save as PNG.',
          infographicData,
          userQuery,
          isInfographic: true,
        },
      ]);

      showToast('✨ Infographic ready!');
    } catch (e) {
      console.error('Infographic error:', e);
      setExploreHistory(prev => [
        ...prev,
        { role: 'ai', text: `Infographic generation failed: ${e.message}`, isError: true, isInfographic: true },
      ]);
    } finally {
      setIsThinking(false);
      setAiThinkingLabel('Analyzing...');
    }
  };

  // ---------------------------------------------------------------------------
  // handleHierarchyAnswer — AI-resolves user labels to exact semantic field IDs
  // ---------------------------------------------------------------------------
  const handleHierarchyAnswer = async (answer, pendingQuery) => {
    // Add the user's answer to the chat history immediately
    setExploreHistory(prev => [...prev, { id: Date.now().toString(), role: 'user', text: answer }]);

    const parts = answer.split(/[,|\n\-]+/).map(p => p.trim()).filter(Boolean);
    
    // Validate the hierarchy answer
    if (parts.length < 2 || parts[0].length > 50) {
      setExploreHistory(prev => [...prev, {
        id: Date.now().toString() + '-err',
        role: 'ai',
        text: '⚠️ I need distinct reporting levels separated by commas (e.g., "Zone, Area, Dealer" or "Category, Subcategory") to structure a Deep Dive. Please try typing just the hierarchy levels, or use the ⚡ Trend mode if you only want to analyze a single dimension!'
      }]);
      return;
    }

    setIsThinking(true);
    setAiThinkingLabel('Mapping your hierarchy to data fields...');

    const { dimensions, measures, model_description } = buildSemanticContext();

    let macro_dim = parts[0];
    let meso_dim  = parts[1];
    let micro_dim = parts[2] || parts[1];

    try {
      // Ask Gemini to resolve the user's plain-English labels to exact field IDs
      const resolveRes = await callAI({
        query: '',
        phase: 'hierarchy_resolve',
        model_description,
        dimensions,
        measures,
        data_table: [],
        macro_dim: parts[0],
        meso_dim:  parts[1],
        micro_dim: parts[2] || parts[1],
      });
      const resolved = JSON.parse(resolveRes.replace(/```json/gi, '').replace(/```/g, '').trim());
      if (resolved.macro_dim) macro_dim = resolved.macro_dim;
      if (resolved.meso_dim)  meso_dim  = resolved.meso_dim;
      if (resolved.micro_dim) micro_dim = resolved.micro_dim;
    } catch (e) {
      console.warn('Hierarchy resolve failed, using raw parts:', e);
    } finally {
      setIsThinking(false);
      setAiThinkingLabel('Analyzing...');
    }

    const hierarchy = { macro_dim, meso_dim, micro_dim };
    setDeepDiveHierarchy(hierarchy);
    setHierarchyPending(null);

    // Log to debug panel
    window.dispatchEvent(new CustomEvent('mvantage-debug', {
      detail: { type: 'info', category: 'Deep Dive', message: `Hierarchy resolved: ${macro_dim} → ${meso_dim} → ${micro_dim}`, details: hierarchy }
    }));

    // Kick off the actual deep dive now that hierarchy is resolved to field IDs
    executeExploreDataLogic(pendingQuery, 'explore', 'deep_dive', hierarchy, true);
  };

  // ---------------------------------------------------------------------------
  // executeExploreDataLogic — Main Explore Chat handler
  // path: "fast" | "deep_dive"
  // ---------------------------------------------------------------------------
  const executeExploreDataLogic = async (query, mode, path = 'fast', hierarchyOverride = null, skipUserBubble = false) => {
    if (!query.trim() || !activeDataset || isThinking) return;
    setLastSummaryPayload(null);

    setIsThinking(true);
    setAiError(null);

    const { dimensions, measures, model_description } = buildSemanticContext();
    let newHistory = [...exploreHistory];
    
    if (!skipUserBubble) {
      newHistory = [...newHistory, { role: 'user', text: query, analysisPath: path }];
      setChatInput('');
    }
    
    setExploreHistory(newHistory);

    const commonPayload = { model_description, dimensions, measures };

    // ── COUNTER-QUESTION: ask hierarchy before deep dive ─────────────────────
    if (path === 'deep_dive' && !hierarchyOverride && !deepDiveHierarchy) {
      // First, we call sql_gen to get the dims and facts dynamically 
      try {
        const sqlRes = await callAI({ ...commonPayload, query, phase: 'sql_gen', data_table: [] });
        const parsed = JSON.parse(sqlRes.replace(/```json/gi, '').replace(/```/g, '').trim());
        if (parsed.sql_query && parsed.sql_query.dimensions) {
           sessionCache.current.preflightDims = parsed.sql_query.dimensions;
        }
        if (parsed.sql_query && parsed.sql_query.measures) {
           sessionCache.current.preflightFacts = parsed.sql_query.measures;
        }
      } catch (e) { console.error("sql_gen prep fail:", e); }
      
      setExploreHistory([...newHistory, {
        role: 'ai',
        path: 'hierarchy_question',
        text: 'To structure this analysis meaningfully, please tell me your three reporting levels from broadest to most granular — in plain business language. For example: "Zone, Area, Dealer" or "Region, District, Store" or "Division, Department, Team".',
        pendingQuery: query,
      }]);
      setHierarchyPending(query);
      setIsThinking(false);
      return;
    }

    // ── DIMENSION TREND: show picker ─────────────────────────
    if (path === 'trend') {
       setExploreHistory([...newHistory, {
         role: 'ai',
         path: 'trend_picker',
         dimensions,
         measures,
         datasetId: activeDatasetId,
         userQuery: query
       }]);
       setIsThinking(false);
       return;
    }

    const hierarchy = hierarchyOverride || deepDiveHierarchy || {};
    const { macro_dim = '', meso_dim = '', micro_dim = '' } = hierarchy;

    try {
      // ── Step 1: Generate SQL or get a direct answer ─────────────────────────
      const hasFreshCache = sessionCache.current.dataTable && sessionCache.current.microInsight;
      let dataResult = null;

      if (!hasFreshCache) {
        setAiThinkingLabel('Fetching your answer...');

        // ── CONVERSATIONAL MEMORY: Format chat history for AI ─────────────────
        const recentHistory = exploreHistory
          .filter(h => h.role === 'user' || (h.role === 'ai' && h.text && !h.isError))
          .slice(-6) // Last 3 turns
          .map(h => ({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.text || ''
          }));

        const aiPhase = path === 'fast' ? 'sql_gen_fast' : 'sql_gen';
        const aiPayload = { 
          ...commonPayload, 
          query, 
          phase: aiPhase, 
          data_table: [], 
          macro_dim, 
          meso_dim, 
          micro_dim,
          chat_history: recentHistory,
          active_state: aiPhase === 'sql_gen_fast' ? lastIntentState : null
        };

        const aiResponseText = await callAI(aiPayload);
        
        let parsed = {};
        try {
            if (aiPhase === 'sql_gen_fast') {
                const thinkingMatch = aiResponseText.match(/<thinking>([\s\S]*?)<\/thinking>/);
                const jsonMatch = aiResponseText.match(/<json>([\s\S]*?)<\/json>/);
                
                if (thinkingMatch) {
                   const reasoning = thinkingMatch[1].trim();
                   window.dispatchEvent(new CustomEvent('mvantage-debug', { 
                       detail: { type: 'info', category: 'AI Trace', message: 'Deductive Reasoning', details: { reasoning } } 
                   }));
                }
                
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[1].trim().replace(/```json/gi, '').replace(/```/g, '').trim());
                    
                    // Conversational Memory: Store the JSON intent for next turn
                    if (parsed.action === 'query' && parsed.sql_query) {
                        setLastIntentState(parsed.sql_query);
                    }
                } else {
                    parsed = JSON.parse(aiResponseText.replace(/```json/gi, '').replace(/```/g, '').trim());
                }
            } else {
                parsed = JSON.parse(aiResponseText.replace(/```json/gi, '').replace(/```/g, '').trim());
            }
        } catch (e) {
            console.error("AI Parse Error:", e, aiResponseText);
            throw new Error("Failed to parse AI intent. Please try rephrasing.");
        }

        if (parsed.action === 'answer') {
          setExploreHistory([...newHistory, { role: 'ai', text: parsed.text, path: 'fast' }]);
          return;
        }


        if (parsed.action === 'query' && parsed.sql_query) {
          const { dimensions: dims, measures: meas, filters } = parsed.sql_query;
          const limit = path === 'fast' ? 1500 : null;
          dataResult = await executeExploreQuery(activeDatasetId, dims, meas, filters, limit);
          sessionCache.current = { dataTable: dataResult, microInsight: null, mesoInsight: null, macroInsight: null };
        }
      } else {
        dataResult = sessionCache.current.dataTable;
      }

      // ── Empty data guard ─────────────────────────────────────────────────────
      const isEmpty = !dataResult || (Array.isArray(dataResult) && dataResult.length === 0);
      if (isEmpty) {
        setExploreHistory([...newHistory, {
          role: 'ai',
          text: 'No data was found for this query. Try adjusting your filters or date range.',
          path: 'fast', isEmpty: true,
        }]);
        return;
      }

      // ── FAST PATH ────────────────────────────────────────────────────────────
      if (path === 'fast') {
        setAiThinkingLabel('Fetching your answer...');
        const answer = await callAI({ ...commonPayload, query, phase: 'fast_answer', data_table: dataResult });
        setExploreHistory([...newHistory, { role: 'ai', text: answer, path: 'fast', data: dataResult, userQuery: query }]);

      // ── DEEP DIVE PATH ───────────────────────────────────────────────────────
      } else if (path === 'deep_dive') {
        // Pre-Flight phase 
        setAiThinkingLabel('Gathering Pre-flight Statistics...');
        
        // We ensure we send all dimensions, preflight endpoint will extract hierarchy/time vs analytical
        try {
          const preflightReq = {
             phase: "preflight",
             dataset_id: activeDatasetId,
             micro_dim: micro_dim,
             meso_dim: meso_dim,
             macro_dim: macro_dim,
             dimensions: dimensions,   // send ALL dims — backend separates hierarchy vs analytical
             measures: measures,        // send ALL measures — backend returns them as selectable facts
             query: query,
             cte_sql: generateUnifiedCTE ? generateUnifiedCTE() : ''
          };
          
          const preflightResult = await apiClient.aiDeepDivePreflight(preflightReq);
          
          setExploreHistory(prev => [...prev, {
             role: 'ai',
             path: 'preflight_card',
             preflightData: preflightResult,
             datasetId: activeDatasetId,
             cteSql: preflightReq.cte_sql,
             userQuery: query,
             hierarchy: hierarchy
          }]);
          
        } catch (e) {
           setAiError(`Failed to run preflight bounds: ${e.message}`);
        }
      }

    } catch (e) {
      console.error('Explore AI Error:', e);
      setAiError(e.message.includes('timed out') ? 'The request timed out. Please try again.' : e.message);
    } finally {
      setIsThinking(false);
      setAiThinkingLabel('Analyzing...');
    }
  };

  // ---------------------------------------------------------------------------
  // handleTrendExecute — Fast trend analysis path
  // ---------------------------------------------------------------------------
  const handleTrendExecute = async (scope, query) => {
    setIsThinking(true);
    setAiError(null);
    setAiThinkingLabel('Analyzing dimension trend...');
    
    // First, push a placeholder deep\_dive\_progress into history to show SSE loading
    setExploreHistory(prev => [...prev, {
      role: 'ai',
      text: 'Analyzing trend...',
      path: 'fast',
      userQuery: query
    }]);

    try {
      const res = await apiClient.aiDimensionTrend({
         dataset_id: activeDatasetId,
         trend_dim: scope.dim,
         trend_time_grain: scope.time,
         selected_facts: undefined, // uses default currently
         macro_dim: deepDiveHierarchy?.macro_dim,
         meso_dim: deepDiveHierarchy?.meso_dim,
      });
      
      setExploreHistory(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'ai', text: res.text || 'Done', path: 'fast', userQuery: query };
        return next;
      });
      
    } catch (e) {
      setExploreHistory(prev => {
         const next = [...prev];
         next.pop();
         return next;
      });
      setAiError(`Trend Analysis Failed: ${e.message}`);
    } finally {
      setIsThinking(false);
      setAiThinkingLabel('Analyzing...');
    }
  };

  // ---------------------------------------------------------------------------
  // handleDeepDiveExecute — SSE Streaming Map-Reduce
  // ---------------------------------------------------------------------------
  const handleDeepDiveExecute = async (scope, query, preflightData) => {
    setIsThinking(false); 
    setAiError(null);
    
    const hierarchy = deepDiveHierarchy || {};

    const progressMsg = {
       role: 'ai',
       path: 'deep_dive_progress',
       totalWaves: 1, // updated dynamically
       completedWaves: 0,
       statusMessage: "Starting Map-Reduce Pipeline...",
       currentPhase: 'micro',
       userQuery: query
    };

    setExploreHistory(prev => [...prev, progressMsg]);
    
    const token = null; // No custom auth token needed if local/proxy 
    
    const basePayload = {
      dataset_id: activeDatasetId,
      micro_dim: hierarchy.micro_dim,
      meso_dim: hierarchy.meso_dim,
      macro_dim: hierarchy.macro_dim,
      ...scope
    };

    // Use raw fetch for SSE
    const isProd = window.location.hostname !== 'localhost';
    const baseUrl = isProd ? '/api' : 'http://localhost:8000/api';
    
    try {
      const response = await fetch(`${baseUrl}/ai/deep-dive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify(basePayload),
      });

      if (!response.ok) {
        throw new Error(`SSE request failed: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder()
      
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\\n');
        
        let currentEvent = "";
        for (const line of lines) {
           if (line.startsWith("event: ")) {
              currentEvent = line.substring(7).trim();
           } else if (line.startsWith("data: ")) {
              const dataStr = line.substring(6).trim();
              if (!dataStr) continue;
              
              let dataObj = {};
              try { dataObj = JSON.parse(dataStr); } catch (e) { }
              
              setExploreHistory(prev => {
                 const next = [...prev];
                 const lastIdx = next.length - 1;
                 const msg = { ...next[lastIdx] };
                 
                 if (msg.path !== 'deep_dive_progress') return next;
                 
                 if (currentEvent === 'max_waves') {
                    msg.totalWaves = dataObj.total;
                 } else if (currentEvent === 'wave_complete') {
                    msg.completedWaves = dataObj.completed;
                    msg.statusMessage = `Processing ${dataObj.completed} of ${msg.totalWaves} micro-slices...`;
                 } else if (currentEvent === 'stitch_complete') {
                    msg.currentPhase = 'stitch';
                    msg.statusMessage = dataObj.message || 'Stitching complete.';
                 } else if (currentEvent === 'meso_complete') {
                    msg.currentPhase = 'meso';
                    msg.statusMessage = 'Meso synthesis finished.';
                 } else if (currentEvent === 'macro_complete') {
                    msg.currentPhase = 'macro';
                    msg.statusMessage = 'Macro synthesis finished.';
                 } else if (currentEvent === 'done') {
                    msg.path = 'deep_dive'; 
                    msg.phases = {
                       micro: dataObj.micro_stitched_preview,
                       meso: dataObj.meso,
                       macro: dataObj.macro
                    };
                    msg.data = []; // Not retaining full huge dataset in UI table
                 }
                 next[lastIdx] = msg;
                 return next;
              });
           }
        }
      }
    } catch (err) {
      setAiError(`Deep Dive Failed: ${err.message}`);
    }
  };

  // ---------------------------------------------------------------------------
  // handleAskAI — Build mode (chart generation via backend proxy)
  // ---------------------------------------------------------------------------
  const handleAskAI = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim() || !activeDataset || isThinking) return;
    if (aiMode === 'explore') return;

    setIsThinking(true);
    setAiThinkingLabel('Building your dashboard...');

    const { dimensions, measures, model_description } = buildSemanticContext();
    const query = chatInput.toLowerCase();

    let numRequested = (query.match(/\b([1-9]|1[0-5])\b/) || [])[1];
    numRequested = numRequested ? parseInt(numRequested) : null;
    const isBroad = /(dashboard|describe|all|summary|overview|build|create)/i.test(query);
    if (!numRequested && isBroad) numRequested = 4;
    if (!numRequested) numRequested = 1;

    const explicitMeasure = /(measure|calculate|ratio|metric|conversion|%|percent)/i.test(query);
    const fallbackDim = dimensions[0];
    const fallbackMeas = measures[0];

    const systemPromptText = `${model_description ? `Model: ${model_description}\n` : ''}You are an expert BI Dashboard Builder. Output JSON chart configurations.

AVAILABLE DIMENSIONS: ${JSON.stringify(dimensions)}
AVAILABLE MEASURES (with aggType + time intelligence): ${JSON.stringify(measures)}

TASK:
- Map user intent to chart types and EXACT field IDs.
- PIVOT: type='pivot', use pivotRows/pivotCols/pivotMeasures.
- TABLE: type='table', use tableDimensions/tableMeasures.
- STANDARD: type in [bar,pie,line], use dimension+measure.
- SCATTER: type='scatter', use dimension+xMeasure+yMeasure.
- ${isBroad ? `Generate EXACTLY ${numRequested} diverse charts.` : 'Generate exactly what the user asked for.'}

RULES:
- NEVER invent field IDs.
- NEVER return empty charts array.
- ONLY add new_measures if explicitly asked.

Return JSON: { "charts": [...], "new_measures": [] }`;

    try {
      const text = await callAI({
        query: `${systemPromptText}\n\nUser request: "${chatInput}"`,
        phase: 'fast_answer',
        model_description: '',
        dimensions: [],
        measures: [],
        data_table: [],
      });

      const aiResponse = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());

      if (aiResponse.new_measures?.length > 0 && !explicitMeasure) aiResponse.new_measures = [];
      if (aiResponse.new_measures?.length > 0) {
        setPendingAIAction({ query: chatInput, measures: aiResponse.new_measures, charts: aiResponse.charts || [] });
        return;
      }

      if (!aiResponse.charts?.length && isBroad && fallbackDim && fallbackMeas) {
        aiResponse.charts = [
          { type: 'bar', dimension: fallbackDim.id, measure: fallbackMeas.id, size: 'half', title: `${fallbackMeas.label} by ${fallbackDim.label} ✨` },
          { type: 'pie', dimension: fallbackDim.id, measure: fallbackMeas.id, size: 'half', title: `${fallbackMeas.label} Breakdown ✨` },
          { type: 'line', dimension: fallbackDim.id, measure: fallbackMeas.id, size: 'full', title: `${fallbackMeas.label} Trend ✨` },
          { type: 'bar', dimension: fallbackDim.id, measure: fallbackMeas.id, size: 'half', title: `Overview of ${fallbackMeas.label} ✨` },
        ].slice(0, numRequested);
      }

      if (aiResponse.charts?.length > 0) {
        const fuzzy = (val) => {
          if (!val) return null;
          if (val.includes('::')) return val;
          const exact = globalSemanticFields.find(f => f.rawLabel.toLowerCase() === val.toLowerCase() || f.value === val);
          return exact ? exact.value : val;
        };
        const resolveDs = (origins) => {
          const req = origins.filter(o => o?.includes('::'));
          if (!req.length) return activeDatasetId;
          for (const dsId of datasets.map(d => d.id)) {
            const model = semanticModels[dsId] || [];
            if (req.every(o => { const [od, of_] = o.split('::'); return model.some(f => (f.originDatasetId || dsId) === od && (f.originFieldId || f.id) === of_); })) return dsId;
          }
          return activeDatasetId;
        };
        const newCharts = aiResponse.charts.map((chart, idx) => {
          const mD = fuzzy(chart.dimension), mM = fuzzy(chart.measure);
          const mX = fuzzy(chart.xMeasure), mY = fuzzy(chart.yMeasure);
          const mPR = (chart.pivotRows || []).map(fuzzy).filter(Boolean);
          const mPC = (chart.pivotCols || []).map(fuzzy).filter(Boolean);
          const mPM = (chart.pivotMeasures || []).map(fuzzy).filter(Boolean);
          const mTD = (chart.tableDimensions || []).map(fuzzy).filter(Boolean);
          const mTM = (chart.tableMeasures || []).map(fuzzy).filter(Boolean);
          const bestDs = resolveDs([mD, mM, mX, mY, ...mPR, ...mPC, ...mPM, ...mTD, ...mTM]);
          const local = (s) => {
            if (!s) return '';
            if (!s.includes('::')) { const f = semanticModels[bestDs]?.find(x => x.id === s || x.label?.toLowerCase() === s.toLowerCase()); return f ? f.id : s; }
            const [od, of_] = s.split('::');
            const f = semanticModels[bestDs]?.find(x => (x.originDatasetId || bestDs) === od && (x.originFieldId || x.id) === of_);
            return f ? f.id : s;
          };
          return {
            ...chart,
            dimension: local(mD), measure: local(mM), xMeasure: local(mX), yMeasure: local(mY),
            showDataLabels: true,
            pivotRows: mPR.map(local).filter(Boolean), pivotCols: mPC.map(local).filter(Boolean),
            pivotMeasures: mPM.map(local).filter(Boolean),
            tableDimensions: mTD.map(local).filter(Boolean), tableMeasures: mTM.map(local).filter(Boolean),
            id: Date.now() + '_ai_' + idx, datasetId: bestDs, verticalSize: chart.verticalSize || 'normal',
          };
        });
        const valid = newCharts.filter(c => {
          if (c.type === 'pivot') return c.pivotRows?.length > 0 && c.pivotMeasures?.length > 0;
          if (c.type === 'table') return c.tableDimensions?.length > 0 || c.tableMeasures?.length > 0;
          if (c.type === 'scatter') return c.dimension && c.xMeasure && c.yMeasure;
          return c.dimension && c.measure;
        });
        if (valid.length > 0) {
          setExploreHistory(prev => [...prev, { role: 'ai', text: `✨ Generated ${valid.length} chart(s)!`, charts: valid }]);
          setChatInput('');
          showToast('✨ AI generated your dashboard!');
        } else {
          setAiError("Couldn't map those fields to build the visual.\n\nMake sure your tables are joined and try again!");
        }
      } else {
        throw new Error('AI returned an empty response.');
      }
    } catch (e) {
      console.error('Build AI Error:', e);
      setAiError(`Request Failed: ${e.message}\n\nPlease check your fields and try again!`);
    } finally {
      setIsThinking(false);
      setAiThinkingLabel('Analyzing...');
    }
  };

  const handleClearChat = () => {
    setExploreHistory([]);
    setLastSummaryPayload(null);
  };

  const handleGenerateSummary = async () => {
    if (isThinking || exploreHistory.length === 0) return;
    setIsThinking(true);
    setAiThinkingLabel('Synthesizing boardroom summary...');
    try {
      // Filter out errors and previous summaries to prevent recursion/token bloat
      const history = exploreHistory
        .filter(m => !m.isError && m.path !== 'summary')
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text || ''
        }));

      const res = await apiClient.aiGenerateSummary({ chat_history: history });
      setLastSummaryPayload(res);
      
      setExploreHistory(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          path: 'summary', 
          summary: res 
        }
      ]);
    } catch (e) {
      console.error('Summary Error:', e);
      setAiError(`Summary Synthesis Failed: ${e.message}`);
    } finally {
      setIsThinking(false);
      setAiThinkingLabel('Analyzing...');
    }
  };

  return {
    handleAutoFillDescriptions,
    handleConfirmPendingAI,
    handleGenerateInfographic,
    handleAskAI,
    executeExploreDataLogic,
    handleHierarchyAnswer,
    handleDeepDiveExecute,
    handleTrendExecute,
    handleGenerateSummary,
    handleClearChat,
  };
};
