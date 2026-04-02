import { useRef } from 'react';
import { useAppState } from '../contexts/AppStateContext';
import { useDataEngine } from './useDataEngine';
import { syncSemanticModels } from '../utils/semanticSync';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;
const IMAGEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

// ---------------------------------------------------------------------------
// Shared AI fetch helper with timeout + retry
// ---------------------------------------------------------------------------
async function callGemini(body, retries = 2) {
  let lastErr = 'Unknown error';
  const delays = [1000, 2000];
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) { lastErr = `HTTP ${res.status}`; throw new Error(lastErr); }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty AI response');
      return text;
    } catch (e) {
      clearTimeout(tid);
      lastErr = e.message;
      if (e.name === 'AbortError') { lastErr = 'Request timed out.'; break; }
      if (i < retries) await new Promise(r => setTimeout(r, delays[i]));
    }
  }
  throw new Error(lastErr);
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
  // Auto-fill descriptions
  // ---------------------------------------------------------------------------
  const handleAutoFillDescriptions = async () => {
    if (!activeDataset || isThinking) return;
    setIsThinking(true);
    showToast('✨ AI is analyzing your data to write descriptions...');

    const prompt = `Analyze this dataset.
    Table Name: ${activeDataset.name}
    Columns: ${activeDataset.headers.join(', ')}
   
    Write a short, professional business description for the table itself, and a short business description for each column explaining what it likely represents.
    Return JSON format EXACTLY matching this schema:
    {
      "tableDescription": "string",
      "columns": [
        { "id": "string (the exact column name)", "description": "string" }
      ]
    }`;

    try {
      const text = await callGemini({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              tableDescription: { type: 'STRING' },
              columns: {
                type: 'ARRAY',
                items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, description: { type: 'STRING' } }, required: ['id', 'description'] },
              },
            },
            required: ['tableDescription', 'columns'],
          },
        },
      });
      const aiData = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
      setDatasets(prev => prev.map(d => d.id === activeDatasetId ? { ...d, description: aiData.tableDescription } : d));
      setSemanticModels(prev => {
        const next = { ...prev };
        const model = next[activeDatasetId] || [];
        next[activeDatasetId] = model.map(field => {
          const aiMatch = aiData.columns.find(c => c.id === field.id || c.id === field.originalId);
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

    if (measures && measures.length > 0) {
      const newFields = measures.map(calc => {
        let baseId = calc.label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        if (!baseId || baseId === '_') baseId = 'calc';
        let newCalcId = baseId;
        let count = 1;
        while (updatedModel.some(m => m.id === newCalcId)) { newCalcId = `${baseId}_${count}`; count++; }
        return {
          id: newCalcId, label: calc.label, type: 'measure', isHidden: false,
          isCalculated: true, format: calc.format || 'auto', description: 'AI Generated Measure',
          expression: `[${mapIdToLocalActiveDs(calc.op1) || calc.op1}] ${calc.operator || '+'} [${mapIdToLocalActiveDs(calc.op2) || calc.op2}]`,
          filters: [], filterLogic: 'AND',
          timeConfig: { enabled: false, dateDimensionId: '', period: 'MTD' },
          originDatasetId: activeDatasetId, originFieldId: newCalcId,
          category: 'Uncategorized',
        };
      });
      updatedModel = [...updatedModel, ...newFields];
      setSemanticModels(prev => syncSemanticModels({ ...prev, [activeDatasetId]: updatedModel }, relationships));
    }

    if (charts && charts.length > 0) {
      const resolveChartDataset = (chartOrigins) => {
        const requiredOrigins = chartOrigins.filter(o => o && o.includes('::'));
        if (requiredOrigins.length === 0) return activeDatasetId;
        for (const dsId of datasets.map(d => d.id)) {
          const model = semanticModels[dsId] || [];
          const hasAll = requiredOrigins.every(origStr => {
            const [oDsId, oFId] = origStr.split('::');
            return model.some(f => (f.originDatasetId || dsId) === oDsId && (f.originFieldId || f.id) === oFId);
          });
          if (hasAll) return dsId;
        }
        return null;
      };

      const fuzzyMapAIField = (val) => {
        if (!val) return null;
        if (val.includes('::')) return val;
        const exact = globalSemanticFields.find(f => f.rawLabel.toLowerCase() === val.toLowerCase() || f.value === val);
        return exact ? exact.value : val;
      };

      const newCharts = charts.map((chart, idx) => {
        const mappedDim = fuzzyMapAIField(chart.dimension);
        const mappedMeas = fuzzyMapAIField(chart.measure);
        const mappedXMeas = fuzzyMapAIField(chart.xMeasure);
        const mappedYMeas = fuzzyMapAIField(chart.yMeasure);
        const mappedColor = fuzzyMapAIField(chart.colorMeasure);
        const mappedSize = fuzzyMapAIField(chart.sizeMeasure);
        const mappedLegend = fuzzyMapAIField(chart.legend);
        const mappedPRows = (chart.pivotRows || []).map(fuzzyMapAIField).filter(Boolean);
        const mappedPCols = (chart.pivotCols || []).map(fuzzyMapAIField).filter(Boolean);
        const mappedPMeas = (chart.pivotMeasures || []).map(fuzzyMapAIField).filter(Boolean);
        const originsToCheck = [mappedDim, mappedMeas, mappedLegend, mappedXMeas, mappedYMeas, mappedColor, mappedSize, ...mappedPRows, ...mappedPCols, ...mappedPMeas];
        const bestDsId = resolveChartDataset(originsToCheck) || activeDatasetId;
        const mapIdToLocal = (origStr) => {
          if (!origStr) return '';
          if (!origStr.includes('::')) return origStr;
          const [oDsId, oFId] = origStr.split('::');
          const f = semanticModels[bestDsId]?.find(x => (x.originDatasetId || bestDsId) === oDsId && (x.originFieldId || x.id) === oFId);
          return f ? f.id : '';
        };
        return {
          ...chart,
          dimension: mapIdToLocal(mappedDim), measure: mapIdToLocal(mappedMeas),
          xMeasure: mapIdToLocal(mappedXMeas), yMeasure: mapIdToLocal(mappedYMeas),
          colorMeasure: mapIdToLocal(mappedColor), sizeMeasure: mapIdToLocal(mappedSize),
          showDataLabels: true, legend: mapIdToLocal(mappedLegend),
          pivotRows: mappedPRows.map(mapIdToLocal).filter(Boolean),
          pivotCols: mappedPCols.map(mapIdToLocal).filter(Boolean),
          pivotMeasures: mappedPMeas.map(mapIdToLocal).filter(Boolean),
          id: Date.now().toString() + '_ai_' + idx, datasetId: bestDsId,
          verticalSize: chart.verticalSize || 'normal',
        };
      });

      const validCharts = newCharts.filter(c => {
        if (c.type === 'pivot') return c.pivotRows.length > 0 && c.pivotMeasures.length > 0;
        if (c.type === 'scatter') return c.dimension && c.xMeasure && c.yMeasure;
        return c.dimension && c.measure;
      });

      if (validCharts.length > 0) {
        // Build mode: add to existing page
        setPendingAIAction(prev => ({ ...prev, charts: validCharts }));
      }
    }

    setPendingAIAction(null);
    showToast('✨ Action completed!');
  };

  // ---------------------------------------------------------------------------
  // handleGenerateInfographic — Unified for ALL roles
  // Returns the image as Base64 inline in chat. No new dashboard page.
  // ---------------------------------------------------------------------------
  const handleGenerateInfographic = async (text, userQuery) => {
    setIsThinking(true);
    setAiThinkingLabel('Designing your infographic...');
    showToast('Designing your infographic...');

    try {
      const cleanText = String(text).replace(/[\r\n]+/g, ' ').replace(/[^a-zA-Z0-9 .,!?'"\-]/g, '').substring(0, 400);
      const promptText = `Professional business infographic slide. Key insights: ${cleanText}. Clean, modern, data-driven design with clear hierarchy, minimal text, strong visual contrast.`;

      let result;
      let lastError = '';
      const delays = [1000, 2000, 4000, 8000, 16000];

      for (let i = 0; i <= delays.length; i++) {
        try {
          const res = await fetch(IMAGEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instances: [{ prompt: promptText }], parameters: { sampleCount: 1 } }),
          });
          if (res.ok) { result = await res.json(); break; }
          lastError = `Status ${res.status}: ${await res.text()}`;
          if (res.status === 401 || res.status === 403) break;
        } catch (err) { lastError = err.message; }
        if (i < delays.length) await new Promise(r => setTimeout(r, delays[i]));
      }

      const base64 = result?.predictions?.[0]?.bytesBase64Encoded || result?.predictions?.[0]?.b64;
      if (!base64) throw new Error(`No image returned. ${lastError}`);

      const imageUrl = `data:image/png;base64,${base64}`;

      // Inject image directly into chat history — no new page created
      setExploreHistory(prev => [
        ...prev,
        {
          role: 'ai',
          text: '📊 Infographic generated! You can download it below.',
          imageUrl,
          userQuery,
          isInfographic: true,
        },
      ]);

      showToast('✨ Infographic ready!');
    } catch (e) {
      console.error('Infographic error:', e);
      setExploreHistory(prev => [
        ...prev,
        {
          role: 'ai',
          text: `Visual generation failed. ${e.message}`,
          isError: true,
          isInfographic: true,
        },
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

    const dimensionsForAI = globalSemanticFields.filter(f => f.type === 'dimension').map(d => ({ id: d.value, label: d.rawLabel, description: d.description }));
    const measuresForAI = globalSemanticFields.filter(f => f.type === 'measure').map(m => ({ id: m.value, label: m.rawLabel, description: m.description }));

    const newHistory = [...exploreHistory, { role: 'user', text: query, analysisPath: path }];
    setExploreHistory(newHistory);
    setChatInput('');

    try {
      // ── Step 1: Generate SQL and fetch data ─────────────────────────────────
      // Check if the user's follow-up can use cached session data
      const hasCachedData = !!sessionCache.current.dataTable;
      let dataResult = null;

      if (hasCachedData && (sessionCache.current.microInsight || sessionCache.current.macroInsight)) {
        // Follow-up question: reuse session cache, skip BigQuery
        dataResult = sessionCache.current.dataTable;
      } else {
        setAiThinkingLabel('Fetching your answer...');

        const sqlGenPrompt = `You are a Data Analyst querying the dataset: ${activeDataset.name}.
Dimensions: ${JSON.stringify(dimensionsForAI)}
Measures: ${JSON.stringify(measuresForAI)}

User question: "${query}"

RULES:
1. If data fetch is needed, set action="query" and populate sql_query with EXACT field IDs.
2. If answerable without data, set action="answer".
3. NEVER invent IDs. Use only the IDs from the lists above.

Return JSON:
{ "action": "query"|"answer", "text": "...", "sql_query": { "dimensions": [], "measures": [], "filters": [] } }`;

        const sqlText = await callGemini({
          contents: [{ parts: [{ text: sqlGenPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                action: { type: 'STRING' },
                text: { type: 'STRING' },
                sql_query: {
                  type: 'OBJECT', nullable: true,
                  properties: {
                    dimensions: { type: 'ARRAY', items: { type: 'STRING' } },
                    measures: { type: 'ARRAY', items: { type: 'STRING' } },
                    filters: { type: 'ARRAY', items: { type: 'OBJECT', properties: { field: { type: 'STRING' }, operator: { type: 'STRING' }, value: { type: 'STRING' } } } },
                  },
                },
              },
              required: ['action'],
            },
          },
        });

        const parsed = JSON.parse(sqlText.replace(/```json/gi, '').replace(/```/g, '').trim());

        if (parsed.action === 'answer') {
          setExploreHistory([...newHistory, { role: 'ai', text: parsed.text, path: 'fast' }]);
          setIsThinking(false);
          setAiThinkingLabel('Analyzing...');
          return;
        }

        if (parsed.action === 'query' && parsed.sql_query) {
          const { dimensions, measures, filters } = parsed.sql_query;
          dataResult = await executeExploreQuery(activeDatasetId, dimensions, measures, filters);
          sessionCache.current.dataTable = dataResult;
          sessionCache.current.microInsight = null;
          sessionCache.current.mesoInsight = null;
          sessionCache.current.macroInsight = null;
        }
      }

      // ── Empty data guard ─────────────────────────────────────────────────────
      const isEmpty = !dataResult || (Array.isArray(dataResult) && dataResult.length === 0);
      if (isEmpty) {
        setExploreHistory([...newHistory, {
          role: 'ai',
          text: "No data was found for this query. Try adjusting your filters or date range.",
          path: 'fast',
          isEmpty: true,
        }]);
        setIsThinking(false);
        setAiThinkingLabel('Analyzing...');
        return;
      }

      // ── FAST PATH ────────────────────────────────────────────────────────────
      if (path === 'fast') {
        setAiThinkingLabel('Fetching your answer...');
        const fastPrompt = `The user asked: "${query}".
Data returned: ${JSON.stringify(dataResult).substring(0, 3000)}

Provide a concise 1-2 sentence natural language answer based strictly on this data. Do not mention "JSON" or "the database".`;

        const fastAnswer = await callGemini({ contents: [{ parts: [{ text: fastPrompt }] }] });
        setExploreHistory([...newHistory, {
          role: 'ai',
          text: fastAnswer,
          path: 'fast',
          data: dataResult,
          userQuery: query,
        }]);

      // ── DEEP DIVE PATH ───────────────────────────────────────────────────────
      } else {
        // Phase 1: Micro
        setAiThinkingLabel('Phase 1 of 3 — Running Micro Analysis...');
        let microInsight = sessionCache.current.microInsight;
        if (!microInsight) {
          const microPrompt = `You are a data analyst. Analyze the following dataset at the LOWEST dimensional grain.
Data: ${JSON.stringify(dataResult).substring(0, 4000)}

Identify: local anomalies, outliers, top/bottom performers, unusual patterns at individual row level.
Write a structured insight paragraph. Be specific with numbers from the data.`;
          try {
            microInsight = await callGemini({ contents: [{ parts: [{ text: microPrompt }] }] });
            sessionCache.current.microInsight = microInsight;
          } catch (e) {
            microInsight = `[Micro analysis could not be completed: ${e.message}]`;
          }
        }

        // Phase 2: Meso (receives ONLY Phase 1 text)
        setAiThinkingLabel('Phase 2 of 3 — Collating Meso Patterns...');
        let mesoInsight = sessionCache.current.mesoInsight;
        if (!mesoInsight) {
          const mesoPrompt = `Based on these micro-level insights from a dataset analysis:
${microInsight}

Collate these findings to identify SYSTEMIC PATTERNS and sub-group trends. Look for recurring themes, correlated signals, and intermediate-level performance drivers.
Write a structured meso-level analysis paragraph.`;
          try {
            mesoInsight = await callGemini({ contents: [{ parts: [{ text: mesoPrompt }] }] });
            sessionCache.current.mesoInsight = mesoInsight;
          } catch (e) {
            mesoInsight = `[Meso analysis could not be completed: ${e.message}]`;
          }
        }

        // Phase 3: Macro (receives ONLY Phase 2 text)
        setAiThinkingLabel('Phase 3 of 3 — Forming Macro Strategy...');
        let macroInsight = sessionCache.current.macroInsight;
        if (!macroInsight) {
          const macroPrompt = `Based on these meso-level patterns from a business dataset analysis:
${mesoInsight}

Formulate 2-3 concise, actionable strategic recommendations. Frame them as executive-level verdicts. Be direct and specific.`;
          try {
            macroInsight = await callGemini({ contents: [{ parts: [{ text: macroPrompt }] }] });
            sessionCache.current.macroInsight = macroInsight;
          } catch (e) {
            macroInsight = `[Macro strategy could not be completed: ${e.message}]`;
          }
        }

        const isPartial = microInsight.startsWith('[') || mesoInsight.startsWith('[') || macroInsight.startsWith('[');

        setExploreHistory([...newHistory, {
          role: 'ai',
          path: 'deep_dive',
          isPartial,
          data: dataResult,
          userQuery: query,
          phases: {
            micro: microInsight,
            meso: mesoInsight,
            macro: macroInsight,
          },
        }]);
      }

    } catch (e) {
      console.error('Explore AI Error:', e);
      let errMsg = e.message;
      if (e.message.includes('timed out')) errMsg = 'The request timed out. Please try again.';
      setAiError(errMsg);
    } finally {
      setIsThinking(false);
      setAiThinkingLabel('Analyzing...');
    }
  };

  // ---------------------------------------------------------------------------
  // handleAskAI — Build mode (chart generation — largely unchanged)
  // ---------------------------------------------------------------------------
  const handleAskAI = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim() || !activeDataset || isThinking) return;

    if (aiMode === 'explore') {
      // Delegate to executeExploreDataLogic (path injected from AIInterface)
      return;
    }

    setIsThinking(true);
    setAiThinkingLabel('Building your dashboard...');
    const query = chatInput.toLowerCase();

    const dimensionsForAI = globalSemanticFields.filter(f => f.type === 'dimension').map(d => ({ id: d.value, label: d.rawLabel, description: d.description }));
    const measuresForAI = globalSemanticFields.filter(f => f.type === 'measure').map(m => ({ id: m.value, label: m.rawLabel, description: m.description }));

    let requestedQuantityMatch = query.match(/\b([1-9]|1[0-5])\b/);
    let numRequested = requestedQuantityMatch ? parseInt(requestedQuantityMatch[0]) : null;
    const isBroadRequest = query.includes('dashboard') || query.includes('describe') || query.includes('all') || query.includes('summary') || query.includes('overview') || query.includes('build') || query.includes('create');
    if (!numRequested && isBroadRequest) numRequested = 4;
    if (!numRequested) numRequested = 1;

    const explicitlyRequestedMeasure = /(measure|calculate|ratio|metric|conversion|%|percent)/i.test(query);
    const fallbackDimId = dimensionsForAI[0]?.id || '';
    const fallbackMeasId = measuresForAI[0]?.id || '';

    const systemPrompt = `You are an expert BI Dashboard Builder. Output a JSON array of chart configurations based on the user's prompt.

AVAILABLE SEMANTIC DICTIONARY:
Dimensions: ${JSON.stringify(dimensionsForAI)}
Measures: ${JSON.stringify(measuresForAI)}

YOUR TASK:
1. Map user intent to chart types and field IDs from the dictionary.
2. PIVOT TABLES: type='pivot', use pivotRows/pivotCols/pivotMeasures.
3. TABLE CHARTS: type='table', use tableDimensions/tableMeasures.
4. STANDARD CHARTS: type in [bar,pie,line], use dimension+measure.
5. SCATTER: type='scatter', use dimension+xMeasure+yMeasure.
6. ${isBroadRequest ? `Generate EXACTLY ${numRequested} diverse charts.` : 'Generate exactly what was asked.'}

RULES:
- NEVER return empty charts array.
- NEVER invent IDs. Use only provided IDs.
- ONLY add new_measures if explicitly asked.

Return JSON: { "charts": [...], "new_measures": [] }`;

    try {
      const text = await callGemini({
        contents: [{ parts: [{ text: chatInput }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { responseMimeType: 'application/json' },
      });

      const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const aiResponse = JSON.parse(cleanText);

      if (aiResponse.new_measures?.length > 0) {
        if (!explicitlyRequestedMeasure) {
          aiResponse.new_measures = [];
        } else {
          setPendingAIAction({ query: chatInput, measures: aiResponse.new_measures, charts: aiResponse.charts || [] });
          setIsThinking(false);
          setAiThinkingLabel('Analyzing...');
          return;
        }
      }

      if (!aiResponse.charts?.length && isBroadRequest && fallbackDimId && fallbackMeasId) {
        const dimLabel = dimensionsForAI[0].label;
        const measLabel = measuresForAI[0].label;
        aiResponse.charts = [
          { type: 'bar', dimension: fallbackDimId, measure: fallbackMeasId, size: 'half', title: `${measLabel} by ${dimLabel} ✨` },
          { type: 'pie', dimension: fallbackDimId, measure: fallbackMeasId, size: 'half', title: `${measLabel} Breakdown ✨` },
          { type: 'line', dimension: fallbackDimId, measure: fallbackMeasId, size: 'full', title: `${measLabel} Trend ✨` },
          { type: 'bar', dimension: fallbackDimId, measure: fallbackMeasId, size: 'half', title: `Overview of ${measLabel} ✨` },
        ].slice(0, numRequested);
      }

      if (aiResponse.charts?.length > 0) {
        const fuzzyMapAIField = (val) => {
          if (!val) return null;
          if (val.includes('::')) return val;
          const exact = globalSemanticFields.find(f => f.rawLabel.toLowerCase() === val.toLowerCase() || f.value === val);
          return exact ? exact.value : val;
        };

        const resolveChartDataset = (origins) => {
          const required = origins.filter(o => o && o.includes('::'));
          if (!required.length) return activeDatasetId;
          for (const dsId of datasets.map(d => d.id)) {
            const model = semanticModels[dsId] || [];
            if (required.every(o => { const [od, of_] = o.split('::'); return model.some(f => (f.originDatasetId || dsId) === od && (f.originFieldId || f.id) === of_); })) return dsId;
          }
          return activeDatasetId;
        };

        const newCharts = aiResponse.charts.map((chart, idx) => {
          const mD = fuzzyMapAIField(chart.dimension), mM = fuzzyMapAIField(chart.measure);
          const mX = fuzzyMapAIField(chart.xMeasure), mY = fuzzyMapAIField(chart.yMeasure);
          const mC = fuzzyMapAIField(chart.colorMeasure), mS = fuzzyMapAIField(chart.sizeMeasure);
          const mL = fuzzyMapAIField(chart.legend);
          const mPR = (chart.pivotRows || []).map(fuzzyMapAIField).filter(Boolean);
          const mPC = (chart.pivotCols || []).map(fuzzyMapAIField).filter(Boolean);
          const mPM = (chart.pivotMeasures || []).map(fuzzyMapAIField).filter(Boolean);
          const mTD = (chart.tableDimensions || []).map(fuzzyMapAIField).filter(Boolean);
          const mTM = (chart.tableMeasures || []).map(fuzzyMapAIField).filter(Boolean);
          const origins = [mD, mM, mL, mX, mY, mC, mS, ...mPR, ...mPC, ...mPM, ...mTD, ...mTM];
          const bestDs = resolveChartDataset(origins);
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
            colorMeasure: local(mC), sizeMeasure: local(mS), showDataLabels: true, legend: local(mL),
            pivotRows: mPR.map(local).filter(Boolean), pivotCols: mPC.map(local).filter(Boolean),
            pivotMeasures: mPM.map(local).filter(Boolean), tableDimensions: mTD.map(local).filter(Boolean),
            tableMeasures: mTM.map(local).filter(Boolean),
            id: Date.now() + '_ai_' + idx, datasetId: bestDs, verticalSize: chart.verticalSize || 'normal',
          };
        });

        const validCharts = newCharts.filter(c => {
          if (c.type === 'pivot') return c.pivotRows?.length > 0 && c.pivotMeasures?.length > 0;
          if (c.type === 'table') return c.tableDimensions?.length > 0 || c.tableMeasures?.length > 0;
          if (c.type === 'scatter') return c.dimension && c.xMeasure && c.yMeasure;
          return c.dimension && c.measure;
        });

        if (validCharts.length > 0) {
          setExploreHistory(prev => [...prev, { role: 'ai', text: `✨ Generated ${validCharts.length} chart(s)!`, charts: validCharts }]);
          setChatInput('');
          showToast('✨ AI generated your dashboard!');
        } else {
          setAiError("I couldn't map those fields to build the visual.\n\nMake sure your tables are joined and try again!");
        }
      } else {
        throw new Error('The AI returned an empty response. Try asking for specific metrics.');
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
