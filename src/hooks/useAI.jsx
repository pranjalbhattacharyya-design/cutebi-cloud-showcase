import { useRef } from 'react';
import { useAppState } from '../contexts/AppStateContext';
import { useDataEngine } from './useDataEngine';
import { syncSemanticModels } from '../utils/semanticSync';
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
  } = useAppState();

  const { globalSemanticFields, executeExploreQuery } = useDataEngine();

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
      .filter(f => f.type === 'dimension')
      .map(d => ({
        id: d.value,
        label: d.rawLabel,
        description: d.description || '',
      }));

    const measures = globalSemanticFields
      .filter(f => f.type === 'measure')
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
      const text = await callAI({ query: prompt, phase: 'fast_answer', model_description: '', dimensions: [], measures: [] });
      const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const aiData = JSON.parse(clean);
      setDatasets(prev => prev.map(d => d.id === activeDatasetId ? { ...d, description: aiData.tableDescription } : d));
      setSemanticModels(prev => {
        const next = { ...prev };
        const model = next[activeDatasetId] || [];
        next[activeDatasetId] = model.map(field => {
          const aiMatch = aiData.columns?.find(c => c.id === field.id || c.id === field.originalId);
          if (aiMatch) return { ...field, description: aiMatch.description };
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
        prior_output:   String(text).substring(0, 1200),
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
  // executeExploreDataLogic — Main Explore Chat handler
  // path: "fast" | "deep_dive"
  // ---------------------------------------------------------------------------
  const executeExploreDataLogic = async (query, mode, path = 'fast') => {
    if (!query.trim() || !activeDataset || isThinking) return;

    setIsThinking(true);
    setAiError(null);

    const { dimensions, measures, model_description } = buildSemanticContext();
    const newHistory = [...exploreHistory, { role: 'user', text: query, analysisPath: path }];
    setExploreHistory(newHistory);
    setChatInput('');

    const commonPayload = { model_description, dimensions, measures };

    try {
      // ── Step 1: Generate SQL or get a direct answer ─────────────────────────
      const hasFreshCache = sessionCache.current.dataTable && sessionCache.current.microInsight;
      let dataResult = null;

      if (!hasFreshCache) {
        setAiThinkingLabel('Fetching your answer...');

        const sqlRes = await callAI({ ...commonPayload, query, phase: 'sql_gen', data_table: [] });
        const parsed = JSON.parse(sqlRes.replace(/```json/gi, '').replace(/```/g, '').trim());

        if (parsed.action === 'answer') {
          setExploreHistory([...newHistory, { role: 'ai', text: parsed.text, path: 'fast' }]);
          return;
        }

        if (parsed.action === 'query' && parsed.sql_query) {
          const { dimensions: dims, measures: meas, filters } = parsed.sql_query;
          dataResult = await executeExploreQuery(activeDatasetId, dims, meas, filters);
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
      } else {
        // Phase 1 — Micro
        setAiThinkingLabel('Phase 1 of 3 — Running Micro Analysis...');
        let micro = sessionCache.current.microInsight;
        if (!micro) {
          try {
            micro = await callAI({ ...commonPayload, query, phase: 'micro', data_table: dataResult });
            sessionCache.current.microInsight = micro;
          } catch (e) { micro = `[Micro analysis could not be completed: ${e.message}]`; }
        }

        // Phase 2 — Meso (receives Phase 1 text only)
        setAiThinkingLabel('Phase 2 of 3 — Collating Meso Patterns...');
        let meso = sessionCache.current.mesoInsight;
        if (!meso) {
          try {
            meso = await callAI({ ...commonPayload, query, phase: 'meso', data_table: [], prior_output: micro });
            sessionCache.current.mesoInsight = meso;
          } catch (e) { meso = `[Meso analysis could not be completed: ${e.message}]`; }
        }

        // Phase 3 — Macro (receives Phase 2 text only)
        setAiThinkingLabel('Phase 3 of 3 — Forming Macro Strategy...');
        let macro = sessionCache.current.macroInsight;
        if (!macro) {
          try {
            macro = await callAI({ ...commonPayload, query, phase: 'macro', data_table: [], prior_output: meso });
            sessionCache.current.macroInsight = macro;
          } catch (e) { macro = `[Macro strategy could not be completed: ${e.message}]`; }
        }

        const isPartial = micro.startsWith('[') || meso.startsWith('[') || macro.startsWith('[');

        setExploreHistory([...newHistory, {
          role: 'ai', path: 'deep_dive', isPartial,
          data: dataResult, userQuery: query,
          phases: { micro, meso, macro },
        }]);
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

  return {
    handleAutoFillDescriptions,
    handleConfirmPendingAI,
    handleGenerateInfographic,
    handleAskAI,
    executeExploreDataLogic,
  };
};
