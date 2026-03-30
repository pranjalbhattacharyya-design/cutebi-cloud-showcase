import { useAppState } from '../contexts/AppStateContext';
import { useDataEngine } from './useDataEngine';
import { syncSemanticModels } from '../utils/semanticSync';

export const useAI = () => {
  const {
      activeDataset, isThinking, setIsThinking, showToast,
      setDatasets, setSemanticModels, activeDatasetId, relationships,
      semanticModels, datasets, chatInput, setChatInput,
      aiMode, exploreHistory, setExploreHistory,
      setPendingAIAction, setDashboards, activePageId,
      setAiError, setIsExploreOpen, setAiMode, setPages, pendingAIAction
  } = useAppState();

  const { globalSemanticFields, executeExploreQuery } = useDataEngine();

  const handleAutoFillDescriptions = async () => {
    if (!activeDataset || isThinking) return;
    setIsThinking(true);
    showToast("✨ AI is analyzing your data to write descriptions...");
   
    const apiKey = "";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
   
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
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
             responseMimeType: "application/json",
             responseSchema: {
                type: "OBJECT",
                properties: {
                  tableDescription: { type: "STRING" },
                  columns: {
                    type: "ARRAY",
                    items: { type: "OBJECT", properties: { id: { type: "STRING" }, description: { type: "STRING" } }, required: ["id", "description"] }
                  }
                },
                required: ["tableDescription", "columns"]
             }
          }
        })
      });
     
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
     
      if (text) {
         const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
         const aiData = JSON.parse(cleanText);
         
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
         showToast("✨ Descriptions auto-filled successfully!");
      }
    } catch (e) {
      console.error("Auto-fill failed:", e);
      showToast("Oops! AI couldn't generate descriptions right now.");
    } finally {
      setIsThinking(false);
    }
  };

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
             while (updatedModel.some(m => m.id === newCalcId)) {
               newCalcId = `${baseId}_${count}`;
               count++;
             }
             return {
               id: newCalcId, label: calc.label, type: 'measure', isHidden: false,
               isCalculated: true, format: calc.format || 'auto', description: 'AI Generated Measure',
               expression: `[${mapIdToLocalActiveDs(calc.op1) || calc.op1}] ${calc.operator || '+'} [${mapIdToLocalActiveDs(calc.op2) || calc.op2}]`,
               filters: [],
               filterLogic: 'AND',
               timeConfig: { enabled: false, dateDimensionId: '', period: 'MTD' },
               originDatasetId: activeDatasetId, originFieldId: newCalcId,
               category: 'Uncategorized'
             };
         });
         
         updatedModel = [...updatedModel, ...newFields];
         setSemanticModels(prev => syncSemanticModels({ ...prev, [activeDatasetId]: updatedModel }, relationships));
     }

     if (charts && charts.length > 0) {
         const resolveChartDataset = (chartOrigins) => {
             const requiredOrigins = chartOrigins.filter(o => o && o.includes('::'));
             if (requiredOrigins.length === 0) return activeDatasetId;
             
             let bestDsId = null;
             for (const dsId of datasets.map(d=>d.id)) {
                 const model = semanticModels[dsId] || [];
                 const hasAll = requiredOrigins.every(origStr => {
                     const [oDsId, oFId] = origStr.split('::');
                     return model.some(f => (f.originDatasetId || dsId) === oDsId && (f.originFieldId || f.id) === oFId);
                 });
                 if (hasAll) { bestDsId = dsId; break; }
             }
             return bestDsId;
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

            const originsToCheck = [
               mappedDim, mappedMeas, mappedLegend, mappedXMeas, mappedYMeas, mappedColor, mappedSize,
               ...mappedPRows, ...mappedPCols, ...mappedPMeas
            ];

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
               dimension: mapIdToLocal(mappedDim),
               measure: mapIdToLocal(mappedMeas),
               xMeasure: mapIdToLocal(mappedXMeas),
               yMeasure: mapIdToLocal(mappedYMeas),
               colorMeasure: mapIdToLocal(mappedColor),
               sizeMeasure: mapIdToLocal(mappedSize),
               showDataLabels: true,
               legend: mapIdToLocal(mappedLegend),
               pivotRows: mappedPRows.map(mapIdToLocal).filter(Boolean),
               pivotCols: mappedPCols.map(mapIdToLocal).filter(Boolean),
               pivotMeasures: mappedPMeas.map(mapIdToLocal).filter(Boolean),
               id: Date.now().toString() + "_ai_" + idx,
               datasetId: bestDsId,
               verticalSize: chart.verticalSize || 'normal'
            };
         });
         
         const validCharts = newCharts.filter(c => {
             if (c.type === 'pivot') return c.pivotRows.length > 0 && c.pivotMeasures.length > 0;
             if (c.type === 'scatter') return c.dimension && c.xMeasure && c.yMeasure;
             return c.dimension && c.measure;
         });

         if (validCharts.length > 0) {
             setDashboards(prev => ({ ...prev, [activePageId]: [...(prev[activePageId] || []), ...validCharts] }));
         }
     }
     
     setPendingAIAction(null);
     showToast("✨ Action completed!");
  };

  const handleGenerateInfographic = async (text, userQuery) => {
    setIsThinking(true);
    showToast("Designing your infographic...");
    try {
        const apiKey = "";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
       
        const cleanText = String(text).replace(/[\r\n]+/g, ' ').replace(/[^a-zA-Z0-9 .,!?'"-]/g, '').substring(0, 300);
        const promptText = `Infographic presentation slide showing data insights: ${cleanText}. Modern, sleek, clean data visualization design.`;
       
        let response;
        let result;
        let lastError = "";
        const delays = [1000, 2000, 4000, 8000, 16000];

        for (let i = 0; i <= delays.length; i++) {
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instances: [{ prompt: promptText }],
                        parameters: { sampleCount: 1 }
                    })
                });

                if (response.status === 400) {
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            instances: { prompt: promptText },
                            parameters: { sampleCount: 1 }
                        })
                    });
                }

                if (response.ok) {
                    result = await response.json();
                    break;
                }

                const errText = await response.text();
                lastError = `Status ${response.status}: ${errText}`;
               
                if (response.status === 401 || response.status === 403) break;
            } catch (err) {
                lastError = err.message;
            }
            if (i < delays.length) await new Promise(r => setTimeout(r, delays[i]));
        }

        if (!response || !response.ok) {
            throw new Error(`API Error: ${lastError}`);
        }
       
        const base64Encoded = result?.predictions?.[0]?.bytesBase64Encoded || result?.predictions?.[0]?.b64;
       
        if (base64Encoded) {
            const imageUrl = `data:image/png;base64,${base64Encoded}`;
            const shortTitle = userQuery ? String(userQuery).split(' ').slice(0, 4).join(' ') : 'Infographic';
            const newPageId = `page_info_${Date.now()}`;
           
            setPages(prev => [...prev, { id: newPageId, name: `${shortTitle}...` }]);
           
            const newChart = {
                id: `info_${Date.now()}`,
                datasetId: activeDatasetId,
                type: 'infographic',
                imageUrl: imageUrl,
                title: `Presentation: ${userQuery || 'Insights'}`,
                size: 'full',
                verticalSize: 'tall'
            };
           
            setDashboards(prev => ({ ...prev, [newPageId]: [newChart] }));
            setActivePageId(newPageId);
            setIsExploreOpen(false);
            setAiMode('build');
           
            showToast("✨ Infographic added to new presentation page!");
        } else {
            throw new Error("No image data returned. Result snippet: " + JSON.stringify(result).substring(0, 150));
        }

    } catch (e) {
        console.error("Error generating image:", e);
        setAiError(`Failed to generate the infographic.\n\nError Details: ${e.message}`);
    } finally {
        setIsThinking(false);
    }
  };

  const handleAskAI = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim() || !activeDataset || isThinking) return;

    setIsThinking(true);
    const query = chatInput.toLowerCase();
    const apiKey = "";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
   
    const dimensionsForAI = globalSemanticFields.filter(f => f.type === 'dimension').map(d => ({id: d.value, label: d.rawLabel, description: d.description}));
    const measuresForAI = globalSemanticFields.filter(f => f.type === 'measure').map(m => ({id: m.value, label: m.rawLabel, description: m.description}));

    if (aiMode === 'explore') {
        const newHistory = [...exploreHistory, { role: 'user', text: chatInput }];
        setExploreHistory(newHistory);
        setChatInput('');

        const explicitTextOnly = /(text based|text answer|no chart|no visual|descriptive answer|text only|describe|just text)/i.test(query);

        const explorePrompt1 = `You are a Data Analyst querying a database for the dataset: ${activeDataset.name}.
        Dimensions: ${JSON.stringify(dimensionsForAI)}
        Measures: ${JSON.stringify(measuresForAI)}
       
        The user asked: "${query}"
       
        CRITICAL RULES:
        1. If you need to fetch data to answer this (e.g. counts, sums, aggregations, specific numbers), set "action" to "query" and populate the "sql_query" object using EXACT IDs from the lists above.
        2. If you can answer without querying raw data (e.g. "what dimensions are available?"), set "action" to "answer" and provide the text.
        3. Do NOT create new measures. Use only the ones provided.
        4. ALWAYS use EXACT IDs (e.g., "1774024096340::Month Name").

        Return JSON matching this schema:
        {
           "action": "query" | "answer",
           "text": "Your answer (if action is 'answer')",
           "sql_query": {
              "dimensions": ["Exact ID"],
              "measures": ["Exact ID"],
              "filters": [
                 { "field": "Exact ID", "operator": "=", "!=", "contains", ">", "<", "value": "search string" }
              ]
           }
        }`;

        const payload1 = {
          contents: [{ parts: [{ text: explorePrompt1 }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                action: { type: "STRING" },
                text: { type: "STRING" },
                sql_query: {
                  type: "OBJECT",
                  nullable: true,
                  properties: {
                    dimensions: { type: "ARRAY", items: { type: "STRING" } },
                    measures: { type: "ARRAY", items: { type: "STRING" } },
                    filters: {
                        type: "ARRAY",
                        items: { type: "OBJECT", properties: { field: { type: "STRING" }, operator: { type: "STRING" }, value: { type: "STRING" } } }
                    }
                  }
                }
              },
              required: ["action"]
            }
          }
        };

        try {
            const response1 = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload1) });
            if (response1.ok) {
                const result1 = await response1.json();
                const text1 = result1.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text1) {
                   const parsed1 = JSON.parse(text1.replace(/```json/gi, '').replace(/```/g, '').trim());
                   
                   if (parsed1.action === 'query' && parsed1.sql_query) {
                       const { dimensions, measures, filters } = parsed1.sql_query;
                       const dataResult = executeExploreQuery(activeDatasetId, dimensions, measures, filters);
                       
                       const explorePrompt2 = `The user asked: "${query}".
                       I ran a database query and got these results: ${JSON.stringify(dataResult)}
                       
                       Provide a clear, descriptive natural language answer based ONLY on these numbers. Do not mention "JSON" or "the database". Just answer the user's question nicely.`;

                       const payload2 = {
                           contents: [{ parts: [{ text: explorePrompt2 }] }]
                       };

                       const response2 = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload2) });
                       if (response2.ok) {
                           const result2 = await response2.json();
                           const finalAnswer = result2.candidates?.[0]?.content?.parts?.[0]?.text;
                           if (finalAnswer) {
                               setExploreHistory([...newHistory, { role: 'ai', text: finalAnswer, data: dataResult, userQuery: query }]);
                           }
                       }
                   } else {
                       setExploreHistory([...newHistory, { role: 'ai', text: parsed1.text || "I couldn't generate a query for that.", userQuery: query }]);
                   }
                }
            }
        } catch (e) {
            console.error("Explore AI Error", e);
            setAiError("Oops, AI exploration failed. " + e.message);
        } finally {
            setIsThinking(false);
        }
        return;
    }

    // --- BUILD MODE Logic ---
    let requestedQuantityMatch = query.match(/\b([1-9]|1[0-5])\b/);
    let numRequested = requestedQuantityMatch ? parseInt(requestedQuantityMatch[0]) : null;
    const isBroadRequest = query.includes('dashboard') || query.includes('describe') || query.includes('all') || query.includes('summary') || query.includes('overview') || query.includes('build') || query.includes('create');
   
    if (!numRequested && isBroadRequest) numRequested = 4;
    if (!numRequested) numRequested = 1;

    const explicitlyRequestedMeasure = /(measure|calculate|ratio|metric|conversion|%|percent)/i.test(query);
   
    const fallbackDimId = dimensionsForAI[0]?.id || "";
    const fallbackMeasId = measuresForAI[0]?.id || "";

    const systemPrompt = `You are an expert BI Dashboard Builder. Your job is to output a JSON array of chart configurations based on the user's prompt.

    AVAILABLE SEMANTIC DICTIONARY:
    Dimensions: ${JSON.stringify(dimensionsForAI)}
    Measures: ${JSON.stringify(measuresForAI)}

    YOUR TASK:
    1. Understand Context: Analyze the user's prompt to understand the desired charts, dimensions (X-axis/Categories), measures (Y-axis/Values), and legends.
    2. Map Semantics: Find EXACT 'id's from the Available Dictionary. Be smart about business synonyms.
    3. Structure Visuals:
       - PIVOT TABLES: Set 'type' to 'pivot'. Populate 'pivotRows', 'pivotCols', and 'pivotMeasures'.
       - TABLE CHARTS: Set 'type' to 'table'. Populate 'tableDimensions' and 'tableMeasures'.
       - STANDARD CHARTS: 'type' in ['bar', 'pie', 'line']. Populate 'dimension' (X-axis) and 'measure' (Y-axis).
       - SCATTER CHARTS: 'type'='scatter'. 'dimension', 'xMeasure', 'yMeasure'.
    4. General Dashboards: ${isBroadRequest ? `The user requested a general dashboard. You MUST proactively generate EXACTLY ${numRequested} diverse charts by picking logical dimensions and measures from the dictionary. NEVER return an empty charts array.` : 'Generate exactly what the user asked for.'}

    CRITICAL RULES:
    - NEVER return an empty "charts" array. If the user asks for a dashboard, YOU MUST manually select ${numRequested} combinations of Dimensions and Measures from the dictionary and plot them.
    - NEVER invent IDs. Use only the exact IDs provided.
    - STRICT MEASURE RULE: NEVER populate "new_measures" when building a chart. ALWAYS use existing measures. ONLY populate "new_measures" if explicitly asked to "create a measure".

    Return valid JSON matching this exact format:
    {
      "charts": [
        {
          "type": "bar|pie|line|scatter|pivot|table",
          "dimension": "Exact ID or Raw String",
          "measure": "Exact ID or Raw String",
          "legend": "Exact ID",
          "pivotRows": ["Exact ID"],
          "pivotCols": ["Exact ID"],
          "pivotMeasures": ["Exact ID"],
          "tableDimensions": ["Exact ID"],
          "tableMeasures": ["Exact ID"],
          "xMeasure": "Exact ID",
          "yMeasure": "Exact ID",
          "size": "half|full",
          "title": "Descriptive Title ✨"
        }
      ]
    }`;

    const payload = {
      contents: [{ parts: [{ text: query }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    let delays = [1000, 2000];
    let lastError = "Failed to communicate with AI.";
   
    for (let i = 0; i < 3; i++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
     
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
           const errText = await response.text();
           throw new Error(`HTTP Error ${response.status}: ${errText}`);
        }

        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
       
        if (text) {
           const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
           const aiResponse = JSON.parse(cleanText);
           
           if (aiResponse.new_measures && aiResponse.new_measures.length > 0) {
               if (!explicitlyRequestedMeasure) {
                   aiResponse.new_measures = [];
               } else {
                   setPendingAIAction({
                       query: chatInput,
                       measures: aiResponse.new_measures,
                       charts: aiResponse.charts || []
                   });
                   setIsThinking(false);
                   return;
               }
           }
           
           if ((!aiResponse.charts || aiResponse.charts.length === 0) && isBroadRequest) {
               if (fallbackDimId && fallbackMeasId) {
                   const dimLabel = dimensionsForAI[0].label;
                   const measLabel = measuresForAI[0].label;
                   aiResponse.charts = [
                       { type: 'bar', dimension: fallbackDimId, measure: fallbackMeasId, size: 'half', title: `${measLabel} by ${dimLabel} ✨` },
                       { type: 'pie', dimension: fallbackDimId, measure: fallbackMeasId, size: 'half', title: `${measLabel} Breakdown ✨` },
                       { type: 'line', dimension: fallbackDimId, measure: fallbackMeasId, size: 'full', title: `${measLabel} Trend ✨` },
                       { type: 'bar', dimension: fallbackDimId, measure: fallbackMeasId, size: 'half', title: `Overview of ${measLabel} ✨` }
                   ].slice(0, numRequested);
               }
           }

           if (aiResponse.charts && aiResponse.charts.length > 0) {
             const resolveChartDataset = (chartOrigins) => {
                 const requiredOrigins = chartOrigins.filter(o => o && o.includes('::'));
                 if (requiredOrigins.length === 0) return activeDatasetId;
                 
                 let bestDsId = null;
                 for (const dsId of datasets.map(d=>d.id)) {
                     const model = semanticModels[dsId] || [];
                     const hasAll = requiredOrigins.every(origStr => {
                         const [oDsId, oFId] = origStr.split('::');
                         return model.some(f => (f.originDatasetId || dsId) === oDsId && (f.originFieldId || f.id) === oFId);
                     });
                     if (hasAll) { bestDsId = dsId; break; }
                 }
                 return bestDsId || activeDatasetId;
             };

             const fuzzyMapAIField = (val) => {
                if (!val) return null;
                if (val.includes('::')) return val;
                const exact = globalSemanticFields.find(f => f.rawLabel.toLowerCase() === val.toLowerCase() || f.value === val);
                return exact ? exact.value : val;
             };

             const newCharts = aiResponse.charts.map((chart, idx) => {
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
                const mappedTableDims = (chart.tableDimensions || []).map(fuzzyMapAIField).filter(Boolean);
                const mappedTableMeas = (chart.tableMeasures || []).map(fuzzyMapAIField).filter(Boolean);

                const originsToCheck = [
                   mappedDim, mappedMeas, mappedLegend, mappedXMeas, mappedYMeas, mappedColor, mappedSize,
                   ...mappedPRows, ...mappedPCols, ...mappedPMeas, ...mappedTableDims, ...mappedTableMeas
                ];

                const bestDsId = resolveChartDataset(originsToCheck);

                const mapIdToLocal = (origStr) => {
                   if (!origStr) return '';
                   if (!origStr.includes('::')) {
                       const f = semanticModels[bestDsId]?.find(x => x.id === origStr || x.label.toLowerCase() === origStr.toLowerCase());
                       return f ? f.id : origStr;
                   }
                   const [oDsId, oFId] = origStr.split('::');
                   const f = semanticModels[bestDsId]?.find(x => (x.originDatasetId || bestDsId) === oDsId && (x.originFieldId || x.id) === oFId);
                   return f ? f.id : origStr;
                };

                return {
                   ...chart,
                   dimension: mapIdToLocal(mappedDim),
                   measure: mapIdToLocal(mappedMeas),
                   xMeasure: mapIdToLocal(mappedXMeas),
                   yMeasure: mapIdToLocal(mappedYMeas),
                   colorMeasure: mapIdToLocal(mappedColor),
                   sizeMeasure: mapIdToLocal(mappedSize),
                   showDataLabels: true,
                   legend: mapIdToLocal(mappedLegend),
                   pivotRows: mappedPRows.map(mapIdToLocal).filter(Boolean),
                   pivotCols: mappedPCols.map(mapIdToLocal).filter(Boolean),
                   pivotMeasures: mappedPMeas.map(mapIdToLocal).filter(Boolean),
                   tableDimensions: mappedTableDims.map(mapIdToLocal).filter(Boolean),
                   tableMeasures: mappedTableMeas.map(mapIdToLocal).filter(Boolean),
                   id: Date.now().toString() + "_ai_" + idx,
                   datasetId: bestDsId,
                   verticalSize: chart.verticalSize || 'normal',
                   _resolvedDatasetFailed: !bestDsId && originsToCheck.filter(o => o && o.includes('::')).length > 1
                };
             });
             
             let missingIds = [];
             let anyJoinFailed = false;

             const validCharts = newCharts.map((c, i) => {
                 const originalChart = aiResponse.charts[i];
                 const model = semanticModels[c.datasetId] || [];
                 const fieldExists = (id) => model.some(f => f.id === id);
                 
                 let isValid = true;
                 const checkAndLog = (mappedLocalId, originalAiValue) => {
                     if (!originalAiValue) return;
                     if (!mappedLocalId || !fieldExists(mappedLocalId)) {
                         missingIds.push(originalAiValue);
                         isValid = false;
                     }
                 };
                 
                 if (c._resolvedDatasetFailed) {
                     anyJoinFailed = true;
                 }

                 if (c.type === 'pivot') {
                     originalChart.pivotRows?.forEach((raw, i) => checkAndLog(c.pivotRows[i], raw));
                     originalChart.pivotCols?.forEach((raw, i) => checkAndLog(c.pivotCols[i], raw));
                     originalChart.pivotMeasures?.forEach((raw, i) => checkAndLog(c.pivotMeasures[i], raw));
                 } else if (c.type === 'table') {
                     originalChart.tableDimensions?.forEach((raw, i) => checkAndLog(c.tableDimensions[i], raw));
                     originalChart.tableMeasures?.forEach((raw, i) => checkAndLog(c.tableMeasures[i], raw));
                 } else if (c.type === 'scatter') {
                     checkAndLog(c.dimension, originalChart.dimension);
                     checkAndLog(c.xMeasure, originalChart.xMeasure);
                     checkAndLog(c.yMeasure, originalChart.yMeasure);
                 } else {
                     checkAndLog(c.dimension, originalChart.dimension);
                     checkAndLog(c.measure, originalChart.measure);
                     checkAndLog(c.legend, originalChart.legend);
                 }
                 return isValid ? c : null;
             }).filter(Boolean);

             if (validCharts.length > 0) {
                 setDashboards(prev => ({ ...prev, [activePageId]: [...(prev[activePageId] || []), ...validCharts] }));
                 setChatInput('');
                 showToast("✨ AI generated your dashboard!");
                 setIsThinking(false);
                 return;
             } else {
                 const missingLabels = [...new Set(missingIds)].map(id => {
                     const f = globalSemanticFields.find(gf => gf.value === id || gf.value.endsWith('::'+id) || id.endsWith('::'+gf.value));
                     return f ? f.rawLabel : id;
                 });
                 
                 if (anyJoinFailed && missingLabels.length > 0) {
                     setAiError(`I tried to build the chart, but these fields aren't linked together:\n\n• ${missingLabels.join('\n• ')}\n\nThis usually happens when you ask for fields from different tables. Go to the "Relationships" tab to join them first!`);
                 } else if (missingLabels.length > 0) {
                     setAiError(`Oops! I couldn't map the following fields from your prompt to your Semantic Dictionary:\n\n• ${missingLabels.join('\n• ')}\n\nPlease check your spelling, or ensure these exact fields exist and are joined!`);
                 } else {
                     setAiError(`Oops! I couldn't map those fields to build the visual.\n\nMake sure your tables are joined!`);
                 }
                 setIsThinking(false);
                 return;
             }
           } else {
               throw new Error("The AI returned an empty response. Try asking for specific metrics, like 'Show me Sales by Region'.");
           }
        }
      } catch (e) {
        clearTimeout(timeoutId);
        console.error("AI Fetch error:", e);
        lastError = e.message;
        if (i === 2 || e.name === 'AbortError') break;
        await new Promise(r => setTimeout(r, delays[i]));
      }
    }
   
    setAiError(`Request Failed: ${lastError}\n\nPlease check your spelling and available fields in your Semantic Dictionary!`);
    setIsThinking(false);
  };

  return {
    handleAutoFillDescriptions,
    handleConfirmPendingAI,
    handleGenerateInfographic,
    handleAskAI
  };
};
