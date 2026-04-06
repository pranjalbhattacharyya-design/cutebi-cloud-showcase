import React from 'react';
import { useAppState } from '../../contexts/AppStateContext';
import { useChartData } from '../../hooks/useChartData';
import { THEMES } from '../../utils/themeEngine';
import { ArrowUpDown, Maximize2, X, Pencil, Pin, LayoutTemplate } from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, Legend, LabelList, LineChart, Line, 
  ScatterChart, Scatter, ZAxis, PieChart as RechartsPieChart, Pie, Cell, Text 
} from 'recharts';

/**
 * Enterprise-Grade SVG Multi-line Wrapping
 * Uses Recharts <Text /> but ensures it drops logic into <tspan> based on context
 */
const WrappedTick = (props) => {
  const { x, y, payload, textWrap, fontSize, fill, textAnchor = 'middle' } = props;
  const val = payload.value;
  
  if (!textWrap || typeof val !== 'string' || val.length < 12) {
    return (
      <text x={x} y={y} dy={16} fill={fill} fontSize={fontSize} textAnchor={textAnchor} className="recharts-text recharts-cartesian-axis-tick-value">
        {val}
      </text>
    );
  }

  // Split logic: split by spaces, ensuring each tspan line is roughly balanced
  const words = val.split(' ');
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(' ');
  const line2 = words.slice(mid).join(' ');

  return (
    <text x={x} y={y} dy={12} fill={fill} fontSize={fontSize} textAnchor={textAnchor}>
      <tspan x={x} dy="0.3em">{line1}</tspan>
      <tspan x={x} dy="1.1em">{line2}</tspan>
    </text>
  );
};

/**
 * Enterprise-Grade SVG Multi-line Labeling
 * Custom content renderer for Recharts <LabelList />
 */
const WrappedLabel = (props) => {
  const { x, y, value, textWrap, fontSize, fill, fontWeight } = props;
  const haloStyle = { stroke: 'var(--theme-panel-bg)', strokeWidth: 3, paintOrder: 'stroke' };

  if (!textWrap || typeof value !== 'string' || value.length < 12) {
    return <text x={x} y={y} dy={-6} fill={fill} fontSize={fontSize} fontWeight={fontWeight} textAnchor="middle" style={haloStyle}>{value}</text>;
  }
  const words = value.split(' ');
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(' ');
  const line2 = words.slice(mid).join(' ');
  return (
    <text x={x} y={y} dy={-10} fill={fill} fontSize={fontSize} fontWeight={fontWeight} textAnchor="middle" style={haloStyle}>
      <tspan x={x} dy="0">{line1}</tspan>
      <tspan x={x} dy="1.1em">{line2}</tspan>
    </text>
  );
};

/**
 * Enterprise-Grade Data Label Thinning (Automatic Step-Rendering)
 */
const shouldRenderLabel = (index, totalLength) => {
  if (totalLength <= 12) return true;
  const step = Math.ceil(totalLength / 10); // Aim for ~10 labels max
  return index % step === 0;
};

const ChartWidget = React.memo(({ chart, isExploreMode = false, toggleGlobalFilter, handlePinChart, isViewer = false }) => {
  const {
      semanticModels, theme, activePageId, setDashboards, 
      setBuilderForm, initBuilderForm, setShowBuilder,
      globalFilters, joinGroupIds, fontScale, textWrap
  } = useAppState();
  
  const { getAggregatedData, getPivotData, getTableData, getScatterData, datesReady } = useChartData();

  const [chartData, setChartData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const needsTimeIntelligence = React.useMemo(() => {
    const allMeasureIds = [
      chart.measure,
      ...(chart.tableMeasures || []),
      ...(chart.pivotMeasures || []),
      chart.xMeasure,
      chart.yMeasure,
      chart.colorMeasure,
      chart.sizeMeasure,
    ].filter(Boolean);

    return allMeasureIds.some(mId => {
      for (const model of Object.values(semanticModels)) {
        const f = model.find(x => x.id === mId);
        if (f?.timeConfig?.enabled) return true;
      }
      return false;
    });
  }, [chart, semanticModels]);

  // Fix: The previous 'needsTimeIntelligence' calculation failed to catch calculated measures that 
  // reference time measures inside their formula (e.g. YTD_LYTD). This caused a massive double-fetch bug.
  // Instead, simply force ALL charts to wait for the lightweight Engine Warmup to complete.
  const chartDependencyReady = datesReady;

  React.useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!chartDependencyReady) return;
      
      setLoading(true);
      try {
        let res = null;
        window.dispatchEvent(new CustomEvent('cutebi-debug', { 
            detail: { 
                type: 'info', 
                category: 'Chart', 
                message: `[${Date.now()}] Executing query for "${chart.title}" [${chart.type}]`,
                details: { 
                    id: chart.id,
                    datasetId: chart.datasetId,
                    dimensions: chart.dimension || chart.tableDimensions || [],
                    measures: chart.measure || chart.tableMeasures || []
                }
            } 
        }));
        if (chart.type === 'table') {
          res = await getTableData(chart.datasetId, chart.tableDimensions || [], chart.tableMeasures || []);
        } else if (chart.type === 'pivot') {
          res = await getPivotData(chart.datasetId, chart.pivotRows || [], chart.pivotCols || [], chart.pivotMeasures || []);
        } else if (chart.type === 'scatter') {
          res = await getScatterData(chart.datasetId, chart.dimension, chart.xMeasure, chart.yMeasure, chart.colorMeasure, chart.sizeMeasure);
        } else {
          res = await getAggregatedData(chart.datasetId, chart.dimension, chart.measure, chart.legend);
        }
        
        const count = Array.isArray(res) ? res.length : (res?.data?.length || res?.rows?.length || (res?.matrix ? Object.keys(res.matrix).length : 0));
        window.dispatchEvent(new CustomEvent('cutebi-debug', { detail: { type: 'success', category: 'Chart', message: `[${Date.now()}] Query finished for ${chart.title}: items=${count}` } }));
        
        // Sanitize chart metric values to guarantee Recharts receives pure numbers for plotting
        const sanitizeArr = (arr) => {
           return arr.map(row => {
             const cleanRow = { ...row };
             Object.keys(cleanRow).forEach(k => {
                if (k !== 'name' && cleanRow[k] !== null && typeof cleanRow[k] !== 'number') {
                   const str = String(cleanRow[k]).replace(/^["']|["']$/g, '').replace(/\\"/g, '"').replace(/"/g, '');
                   const num = Number(str.replace(/[^0-9.-]/g, ''));
                   if (!isNaN(num)) cleanRow[k] = num;
                }
             });
             return cleanRow;
           });
        };

        if (Array.isArray(res)) {
           res = sanitizeArr(res);
        } else if (res?.data) {
           res.data = sanitizeArr(res.data);
        } else if (res?.matrix) {
           Object.keys(res.matrix).forEach(rk => {
              Object.keys(res.matrix[rk]).forEach(ck => {
                 let val = res.matrix[rk][ck];
                 if (val !== null && typeof val !== 'number') {
                    const str = String(val).replace(/^["']|["']$/g, '').replace(/\\"/g, '"').replace(/"/g, '');
                    const num = Number(str.replace(/[^0-9.-]/g, ''));
                    if (!isNaN(num)) res.matrix[rk][ck] = num;
                 }
              });
           });
        }
        
        setChartData(res);
        setError(null);
        setLoading(false);
      } catch (e) {
        window.dispatchEvent(new CustomEvent('cutebi-debug', { detail: { type: 'error', category: 'Chart', message: `SQL Exception: ${e.message}` } }));
        console.error("Fetch Data Error:", e);
        setError(e.message);
        setLoading(false);
      }
    };

    fetchData();
    // React 18 strict mode rapid fires effects, so we don't block the state update
  }, [chart, globalFilters, chartDependencyReady, getAggregatedData, getPivotData, getTableData, getScatterData]);

  const getOriginKey = React.useCallback((datasetId, fieldId) => {
    if (!fieldId) return '';
    const allFields = semanticModels[datasetId] || [];
    let f = allFields.find(x => x.id === fieldId);
    if (!f) {
      for (const model of Object.values(semanticModels)) {
        f = model.find(x => x.id === fieldId);
        if (f) break;
      }
    }
    return f ? `${f.originDatasetId || datasetId}::${f.originFieldId || fieldId}` : `${datasetId}::${fieldId}`;
  }, [semanticModels]);

  const semanticModel = semanticModels[chart.datasetId] || [];
  const tColors = THEMES[theme].colors;
  const fScale = fontScale || 1.0;
  const tWrap = textWrap || false;

  const formatMeasVal = React.useCallback((val, measureId) => {
      if (val === undefined || val === null) return '';
      
      let meas = null;
      for (const model of Object.values(semanticModels)) {
        meas = model.find(m => m.id === measureId);
        if (meas) break;
      }
      const fmt = meas?.format || 'auto';
      
      let cleanVal = (val && typeof val === 'object' && val.length !== undefined) ? String(val[0]) : String(val);
      // Remove wrapping quotes and escaped quotes from stringified objects/primitives
      cleanVal = cleanVal.replace(/^["']|["']$/g, '').replace(/\\"/g, '"').replace(/"/g, '');
      
      const numVal = Number(cleanVal.replace(/[^0-9.-]/g, ''));
      
      if (fmt === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(isNaN(numVal) ? 0 : numVal);
      if (fmt === 'percentage') return `${((isNaN(numVal) ? 0 : numVal) * 100).toFixed(1)}%`;
      if (fmt === 'number') return new Intl.NumberFormat('en-US').format(isNaN(numVal) ? 0 : numVal);
      
      if (!isNaN(numVal) && cleanVal.trim() !== '') return numVal.toLocaleString();
      return typeof val === 'object' && !val.toString ? JSON.stringify(val) : cleanVal;
  }, [semanticModels]);

  const formatDimVal = React.useCallback((val, dimensionId) => {
       if (val === undefined || val === null) return '';
       
       let dim = null;
       for (const model of Object.values(semanticModels)) {
         dim = model.find(m => m.id === dimensionId || m.label === dimensionId);
         if (dim) break;
       }

       let cleanVal = String(val).replace(/^["']|["']$/g, '').replace(/\\"/g, '"').replace(/"/g, '').trim();
       
       const isDateType = dim?.format === 'date';
       const looksLikeTimestamp = /^\d{10,14}$/.test(cleanVal);
       const nameImpliesTime = typeof dimensionId === 'string' && (dimensionId.toLowerCase().includes('week') || dimensionId.toLowerCase().includes('date') || dimensionId.toLowerCase().includes('month') || dimensionId.toLowerCase().includes('year'));

       // Force date formatting if explicitly typed OR if it looks like a timestamp in a time-related field
       if (isDateType || (looksLikeTimestamp && nameImpliesTime)) {
         let dateVal = looksLikeTimestamp ? Number(cleanVal) : cleanVal;
         const d = new Date(dateVal);
         return isNaN(d.getTime()) ? cleanVal : d.toLocaleDateString();
       }
       return cleanVal;
  }, [semanticModels]);

  const content = React.useMemo(() => {
     if (loading) {
        return (
           <div className="flex flex-col items-center justify-center p-6 space-y-3 h-full">
              <div className="w-8 h-8 border-2 border-[var(--theme-accent)]/20 border-t-[var(--theme-accent)] rounded-full animate-spin"></div>
              <p className="text-[10px] font-black t-text-muted uppercase tracking-widest opacity-60">Querying SQL Engine...</p>
           </div>
        );
     }
     
     if (error) {
        return (
           <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center h-full">
              <div className="p-4 bg-red-500/10 rounded-full border border-red-500/20">
                 <X size={32} className="text-red-500/60" strokeWidth={1.5} />
              </div>
              <div className="space-y-1">
                 <p className="t-text-main font-bold text-sm tracking-tight">Query Failed</p>
                 <p className="t-text-muted text-[10px] font-medium opacity-80 max-w-[200px] break-words">
                    {error}
                 </p>
              </div>
           </div>
        );
     }
     
     if (!chartData || (chartData.data && chartData.data.length === 0) || (chartData.rows && chartData.rows.length === 0)) {
        return (
           <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center h-full">
              <div className="p-4 bg-orange-500/10 rounded-full border border-orange-500/20">
                 <LayoutTemplate size={32} className="text-orange-500/60" strokeWidth={1.5} />
              </div>
              <div className="space-y-1">
                 <p className="t-text-main font-bold text-sm tracking-tight text-balance">Visual has no data.</p>
                 <p className="t-text-muted text-[10px] uppercase tracking-widest font-black opacity-60">
                    {chart.type === 'table' ? 'Add columns to see the Table' : 'Check fields and relationships'}
                 </p>
              </div>
           </div>
        );
     }

     if (chart.type === 'table') {
        const { headers, headerIds, rows } = chartData;
        if (!headers || headers.length === 0) return <div className="t-text-muted text-center pt-10 font-medium text-sm">Add columns to see the Table.</div>;
       
        return (
          <div className="overflow-auto h-full w-full t-border border bg-black/5" style={{ borderRadius: 'calc(var(--theme-radius-panel) / 2)' }}>
             <table className="w-full text-left text-xs border-collapse">
                <thead className="t-text-muted text-[10px] uppercase tracking-wider border-b t-border sticky top-0 bg-[var(--theme-panel-bg)] z-10 shadow-sm">
                   <tr>
                      {headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 font-bold" style={{ whiteSpace: tWrap ? "normal" : "nowrap" }}>{h}</th>
                      ))}
                   </tr>
                </thead>
                <tbody className="divide-y t-border bg-[var(--theme-panel-bg)]">
                   {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-black/5 transition-colors">
                          {headerIds.map((id, j) => {
                              const isMeasure = (chart.tableMeasures || []).includes(id);
                              const val = r[id];
                              return (
                                  <td key={j} className={`px-3 py-2 align-top ${isMeasure ? 'font-medium t-text-main text-right' : 't-text-muted'}`}>
                                      {isMeasure ? formatMeasVal(val, id) : formatDimVal(val, id)}
                                  </td>
                              );
                          })}
                      </tr>
                   ))}
                </tbody>
             </table>
          </div>
        );
     }

     if (chart.type === 'pivot') {
        const { rowKeys, colKeys, matrix } = chartData;
        if (!rowKeys || rowKeys.length === 0) return <div className="t-text-muted text-center pt-10 font-medium text-sm">Add dimensions and measures to see the Pivot Table.</div>;
       
        const headerDepth = Math.max(1, (chart.pivotCols || []).length + (((chart.pivotMeasures || []).length > 1) ? 1 : 0));
       
        const colSpans = {};
        for (let level = 0; level < headerDepth; level++) {
            colSpans[level] = {};
            let currentSpan = 1;
            let startIndex = 0;
            for (let i = 1; i <= colKeys.length; i++) {
                const parts = colKeys[i] ? colKeys[i].split(' | ') : [];
                const prevParts = colKeys[i-1] ? colKeys[i-1].split(' | ') : [];
               
                let sameAsPrev = false;
                if (i < colKeys.length && i > 0) {
                    sameAsPrev = true;
                    for (let j = 0; j <= level; j++) {
                        if (parts[j] !== prevParts[j]) sameAsPrev = false;
                    }
                }
                if (sameAsPrev) {
                    currentSpan++;
                } else {
                    colSpans[level][startIndex] = currentSpan;
                    startIndex = i;
                    currentSpan = 1;
                }
            }
        }

        const headerRows = Array.from({ length: headerDepth }).map((_, levelIndex) => (
           <tr key={`hrow-${levelIndex}`}>
              {levelIndex === 0 && (chart.pivotRows || []).map((r, i) => (
                 <th key={`rh-${i}`} rowSpan={headerDepth} className="px-3 py-1.5 font-black t-text-main t-border border-b border-r align-bottom bg-black/5 text-xs">
                    {semanticModel.find(m => m.id === r)?.label || r}
                 </th>
              ))}
              {colKeys.map((ck, i) => {
                  const span = colSpans[levelIndex][i];
                  if (!span) return null;
                  const parts = ck.split(' | ');
                  const val = parts[levelIndex] || '';
                  return (
                      <th key={`${ck}-${levelIndex}`} colSpan={span} className="px-3 py-1.5 font-bold t-text-main t-border border-b border-r text-center bg-black/5 text-[10px]" style={{ whiteSpace: tWrap ? 'normal' : 'nowrap' }}>
                          {levelIndex < (chart.pivotCols || []).length ? formatDimVal(val, chart.pivotCols[levelIndex]) : val}
                      </th>
                  );
              })}
           </tr>
        ));

         return (
           <div className="overflow-auto h-full w-full t-border border bg-black/5" style={{ borderRadius: 'calc(var(--theme-radius-panel) / 2)' }}>
              <table className="w-full text-xs text-left">
                 <thead className="t-panel sticky top-0 z-10">
                    {headerRows}
                 </thead>
                 <tbody>
                    {rowKeys.map(rk => {
                       const rkVals = rk.split(' | ');
                       return (
                          <tr key={rk} className="t-border border-b hover:bg-black/5 transition-colors text-xs">
                             {rkVals.map((rv, idx) => (
                                 <td key={idx} className="px-3 py-1.5 font-bold t-text-main t-border border-r whitespace-nowrap">{formatDimVal(rv, chart.pivotRows[idx])}</td>
                             ))}
                             {colKeys.map(ck => {
                                 const val = matrix[rk]?.[ck];
                                 // Extract measure ID from column key if it was appended (pivotMeasures.length > 1)
                                 const parts = ck.split(' | ');
                                 const mId = chart.pivotMeasures.length > 1 ? parts[parts.length - 1] : chart.pivotMeasures[0];
                                 return (
                                     <td key={ck} className="px-3 py-1.5 t-text-muted text-right t-border border-r">
                                         {val !== undefined && val !== null ? formatMeasVal(val, mId) : '-'}
                                     </td>
                                 );
                             })}
                          </tr>
                       )
                    })}
                 </tbody>
              </table>
           </div>
         );
      }

     if (chart.type === 'scatter') {
         const scatterData = Array.isArray(chartData) ? chartData : (chartData?.data || []);
         const dimOriginKey = getOriginKey(chart.datasetId, chart.dimension);
         const activeFilterVal = globalFilters[dimOriginKey] || [];
         
         const CustomScatterTooltip = ({ active, payload }) => {
            if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                    <div className="t-panel p-3 rounded-xl shadow-lg t-border border text-xs">
                        <p className="font-bold t-text-main mb-1">{data.name}</p>
                        <p><span className="font-semibold t-text-muted">{semanticModel.find(m => m.id === chart.xMeasure)?.label}:</span> {formatMeasVal(data.x, chart.xMeasure)}</p>
                        <p><span className="font-semibold t-text-muted">{semanticModel.find(m => m.id === chart.yMeasure)?.label}:</span> {formatMeasVal(data.y, chart.yMeasure)}</p>
                        {chart.colorMeasure && data.color !== null && <p><span className="font-semibold t-text-muted">{semanticModel.find(m => m.id === chart.colorMeasure)?.label}:</span> {formatMeasVal(data.color, chart.colorMeasure)}</p>}
                        {chart.sizeMeasure && data.size !== null && <p><span className="font-semibold t-text-muted">{semanticModel.find(m => m.id === chart.sizeMeasure)?.label}:</span> {formatMeasVal(data.size, chart.sizeMeasure)}</p>}
                    </div>
                );
            }
            return null;
         };

         const colorMin = chart.colorMeasure ? Math.min(...scatterData.map(d => d.color || 0)) : 0;
         const colorMax = chart.colorMeasure ? Math.max(...scatterData.map(d => d.color || 0)) : 0;

         return (
            <ResponsiveContainer width="100%" height="100%">
               <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--theme-border)" />
                  <XAxis type="number" dataKey="x" name={semanticModel.find(m => m.id === chart.xMeasure)?.label || 'X'} tick={<WrappedTick textWrap={tWrap} fontSize={10} fill="var(--theme-text-muted)" />} axisLine={false} tickLine={false} tickFormatter={(v) => formatMeasVal(v, chart.xMeasure)} />
                  <YAxis type="number" dataKey="y" name={semanticModel.find(m => m.id === chart.yMeasure)?.label || 'Y'} tick={{fill: 'var(--theme-text-muted)', fontSize: 10}} axisLine={false} tickLine={false} tickFormatter={(v) => formatMeasVal(v, chart.yMeasure)} />
                  {chart.sizeMeasure && <ZAxis type="number" dataKey="size" range={[60, 400]} name={semanticModel.find(m => m.id === chart.sizeMeasure)?.label || 'Size'} />}
                  <RechartsTooltip cursor={{strokeDasharray: '3 3'}} content={CustomScatterTooltip} />
                  <Scatter name="Bubbles" data={scatterData} onClick={(d) => {if(dimOriginKey && !isExploreMode && toggleGlobalFilter) toggleGlobalFilter(dimOriginKey, d.name);}} className={isExploreMode ? "" : "cursor-pointer transition-all duration-300"}>
                     {scatterData.map((e, idx) => {
                        let fill = tColors[idx % tColors.length];
                        if (chart.colorMeasure && e.color !== null) {
                           const ratio = colorMax === colorMin ? 1 : (e.color - colorMin) / (colorMax - colorMin);
                           const cIndex = Math.min(tColors.length - 1, Math.floor(ratio * tColors.length));
                           fill = tColors[cIndex];
                        }
                        return <Cell key={idx} fill={fill} opacity={!isExploreMode && activeFilterVal.length > 0 && !activeFilterVal.includes(String(e.name)) ? 0.3 : 0.8} />;
                     })}
                     {chart.showDataLabels && <LabelList dataKey="name" position="top" fill="var(--theme-text-main)" fontSize={11} fontWeight="bold" content={(props) => shouldRenderLabel(props.index, scatterData.length) ? <WrappedLabel {...props} textWrap={textWrap} /> : null} />}
                  </Scatter>
               </ScatterChart>
            </ResponsiveContainer>
         );
     }

     // Standard Aggregation (Bar, Pie, Line)
     const { data, legendKeys } = chartData;
     const dimOriginKey = getOriginKey(chart.datasetId, chart.dimension);
     const activeFilterVal = globalFilters[dimOriginKey] || [];

     return (
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--theme-border)" />
              <XAxis dataKey="name" tick={<WrappedTick textWrap={tWrap} fontSize={10} fill="var(--theme-text-muted)" />} axisLine={false} tickLine={false} tickFormatter={(v) => formatDimVal(v, chart.dimension)} />
              <YAxis tick={{fill: 'var(--theme-text-muted)', fontSize: 10}} axisLine={false} tickLine={false} tickFormatter={(v) => formatMeasVal(v, chart.measure)} />
              <RechartsTooltip cursor={{fill: 'var(--theme-border)', opacity: 0.5}} contentStyle={{ borderRadius: 'var(--theme-radius-panel)', border: 'none', boxShadow: 'var(--theme-shadow)', background: 'var(--theme-panel-bg)', color: 'var(--theme-text-main)' }} labelFormatter={(v) => formatDimVal(v, chart.dimension)} formatter={(val, name) => [formatMeasVal(val, chart.measure), chart.legend ? name : (semanticModel.find(m => m.id === chart.measure)?.label || chart.measure || 'Value')]} />
              {chart.legend && <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: 'var(--theme-text-main)' }} />}
              {legendKeys.map((k, i) => (
                 <Bar key={k} dataKey={k} stackId="a" name={k === 'value' ? (semanticModel.find(m => m.id === chart.measure)?.label || chart.measure || 'Value') : k} fill={tColors[i % tColors.length]} onClick={(d) => {if(dimOriginKey && !isExploreMode && toggleGlobalFilter) toggleGlobalFilter(dimOriginKey, d.name);}} className={isExploreMode ? "" : "cursor-pointer transition-all duration-300"}>
                   {data.map((e, idx) => <Cell key={idx} opacity={!isExploreMode && activeFilterVal.length > 0 && !activeFilterVal.includes(String(e.name)) ? 0.3 : 1} />)}
                   {chart.showDataLabels && <LabelList dataKey={k} position="insideTop" fill="#fff" fontSize={10} fontWeight="bold" formatter={(v) => formatMeasVal(v, chart.measure)} content={(props) => shouldRenderLabel(props.index, data.length) ? <WrappedLabel {...props} textWrap={textWrap} /> : null} />}
                 </Bar>
              ))}
            </BarChart>
          ) : chart.type === 'pie' ? (
            <RechartsPieChart>
              <RechartsTooltip contentStyle={{ borderRadius: 'var(--theme-radius-panel)', border: 'none', boxShadow: 'var(--theme-shadow)', background: 'var(--theme-panel-bg)', color: 'var(--theme-text-main)' }} formatter={(v, n) => [formatMeasVal(v, chart.measure), formatDimVal(n, chart.dimension)]} />
              <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" onClick={(d) => {if(dimOriginKey && !isExploreMode && toggleGlobalFilter) toggleGlobalFilter(dimOriginKey, d.name);}} className={isExploreMode ? "" : "cursor-pointer"} label={chart.showDataLabels ? ({ name, percent }) => `${formatDimVal(name, chart.dimension)} ${(percent * 100).toFixed(0)}%` : false} labelLine={false}>
                {data.map((e, i) => <Cell key={i} fill={tColors[i % tColors.length]} opacity={!isExploreMode && activeFilterVal.length > 0 && !activeFilterVal.includes(String(e.name)) ? 0.3 : 1} style={{ outline: 'none' }} />)}
              </Pie>
              <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: 'var(--theme-text-main)' }} />
            </RechartsPieChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--theme-border)" />
              <XAxis dataKey="name" tick={<WrappedTick textWrap={tWrap} fontSize={10} fill="var(--theme-text-muted)" />} axisLine={false} tickLine={false} tickFormatter={(v) => formatDimVal(v, chart.dimension)} />
              <YAxis tick={{fill: 'var(--theme-text-muted)', fontSize: 10}} axisLine={false} tickLine={false} tickFormatter={(v) => formatMeasVal(v, chart.measure)} />
              <RechartsTooltip contentStyle={{ borderRadius: 'var(--theme-radius-panel)', border: 'none', boxShadow: 'var(--theme-shadow)', background: 'var(--theme-panel-bg)', color: 'var(--theme-text-main)' }} labelFormatter={(v) => formatDimVal(v, chart.dimension)} formatter={(val, name) => [formatMeasVal(val, chart.measure), chart.legend ? name : (semanticModel.find(m => m.id === chart.measure)?.label || chart.measure || 'Value')]} />
              {chart.legend && <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: 'var(--theme-text-main)' }} />}
               {legendKeys.map((k, i) => (
                 <Line key={k} type="monotone" name={k === 'value' ? (semanticModel.find(m => m.id === chart.measure)?.label || chart.measure || 'Value') : k} dataKey={k} stroke={tColors[i % tColors.length]} strokeWidth={3} dot={{ r: 4, fill: tColors[i % tColors.length], strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, onClick: (e, p) => {if(dimOriginKey && !isExploreMode && toggleGlobalFilter) toggleGlobalFilter(dimOriginKey, p.payload.name); } }} className={isExploreMode ? "" : "cursor-pointer"}>
                   {chart.showDataLabels && <LabelList dataKey={k} position="top" fill={tColors[i % tColors.length]} fontSize={11} fontWeight="bold" formatter={(v) => formatMeasVal(v, chart.measure)} content={(props) => shouldRenderLabel(props.index, data.length) ? <WrappedLabel {...props} textWrap={textWrap} /> : null} />}
                 </Line>
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
     );
  }, [chart, chartData, loading, globalFilters, semanticModel, tColors, getAggregatedData, getPivotData, getTableData, getScatterData, getOriginKey, formatMeasVal, formatDimVal, isExploreMode, toggleGlobalFilter]);

  if (chart.type === 'infographic') {
      return (
         <div key={chart.id} className={`${isExploreMode ? 'bg-black/5 w-full mt-2' : 't-panel'} shadow-sm border t-border flex flex-col hover:shadow-md transition-all duration-300 ${!isExploreMode && chart.size === 'full' ? 'md:col-span-2' : 'md:col-span-1'} overflow-hidden`} style={{ borderRadius: 'var(--theme-radius-panel)' }}>
            <div className="flex justify-between items-start p-4 mb-0 bg-black/5 border-b t-border shrink-0">
               <h4 className="t-text-main" style={{ fontSize: '1.1rem', fontWeight: 600, whiteSpace: tWrap ? "normal" : "nowrap", color: 'var(--theme-text-main)' }}>{chart.title}</h4>
               <div className="flex gap-2 t-text-muted">
                  {!isExploreMode && !isViewer && (
                     <>
                       <button onClick={() => setDashboards(p => ({...p, [activePageId]: (p[activePageId] || []).map(c => c.id === chart.id ? { ...c, verticalSize: c.verticalSize === 'tall' ? 'normal' : 'tall' } : c)}))} className="hover:opacity-70" title="Toggle Height"><ArrowUpDown size={14} /></button>
                       <button onClick={() => setDashboards(p => ({...p, [activePageId]: (p[activePageId] || []).map(c => c.id === chart.id ? { ...c, size: c.size === 'full' ? 'half' : 'full' } : c)}))} className="hover:opacity-70" title="Toggle Width"><Maximize2 size={14} /></button>
                       <button onClick={() => setDashboards(p => ({...p, [activePageId]: (p[activePageId] || []).filter(c => c.id !== chart.id)}))} className="hover:opacity-70" title="Remove Visual"><X size={16} /></button>
                     </>
                  )}
               </div>
            </div>
            <div className="flex-1 w-full flex items-center justify-center p-6 bg-black/5 overflow-auto transition-all duration-300" style={{ height: isExploreMode ? '300px' : (chart.verticalSize === 'tall' ? '600px' : '300px') }}>
                <img src={chart.imageUrl} alt={chart.title} className="w-full h-auto max-h-full object-contain shadow-sm" style={{ borderRadius: 'var(--theme-radius-button)' }}/>
            </div>
         </div>
      );
  }

  return (
    <div key={chart.id} className={`${isExploreMode ? 'bg-black/5 w-full mt-2' : 't-panel'} p-3 shadow-sm border flex flex-col hover:shadow-md transition-all duration-300 ${!isExploreMode && chart.size === 'full' ? 'md:col-span-2' : 'md:col-span-1'}`} style={{ borderRadius: 'var(--theme-radius-panel)' }}>
      <div className="flex justify-between items-start mb-2 shrink-0">
        <h4 className="t-text-main" style={{ fontSize: '1.1rem', fontWeight: 600, whiteSpace: tWrap ? "normal" : "nowrap", color: 'var(--theme-text-main)' }}>{chart.title}</h4>
        <div className="flex gap-1.5 t-text-muted">
          {isExploreMode ? (
              <button onClick={() => handlePinChart(chart)} className="hover:t-accent" title="Pin to Dashboard"><Pin size={16}/></button>
          ) : (
              <>
                {!isViewer && <button onClick={() => {
                    const reverseMap = (dsId, fieldId) => {
                        if (!fieldId) return '';
                        // Charts always store bare field IDs (mapIdToLocal strips '::' on save).
                        // For joined datasets, globalSemanticFields uses value = f.id (bare),
                        // so return fieldId as-is — it already matches the option value.
                        if (joinGroupIds.includes(dsId)) return fieldId;
                        // For orphan (non-joined) datasets, options use 'originDatasetId::fieldId'.
                        let f = null;
                        let foundDsId = dsId;
                        for (const [key, model] of Object.entries(semanticModels)) {
                            f = model.find(x => x.id === fieldId);
                            if (f) { foundDsId = key; break; }
                        }
                        return f
                            ? `${f.originDatasetId || foundDsId}::${f.originFieldId || fieldId}`
                            : `${dsId}::${fieldId}`;
                    };
                    setBuilderForm({
                        ...initBuilderForm,
                        ...chart,
                        dimension: reverseMap(chart.datasetId, chart.dimension),
                        measure: reverseMap(chart.datasetId, chart.measure),
                        legend: reverseMap(chart.datasetId, chart.legend),
                        xMeasure: reverseMap(chart.datasetId, chart.xMeasure),
                        yMeasure: reverseMap(chart.datasetId, chart.yMeasure),
                        colorMeasure: reverseMap(chart.datasetId, chart.colorMeasure),
                        sizeMeasure: reverseMap(chart.datasetId, chart.sizeMeasure),
                        pivotRows: (chart.pivotRows || []).map(r => reverseMap(chart.datasetId, r)).filter(Boolean),
                        pivotCols: (chart.pivotCols || []).map(r => reverseMap(chart.datasetId, r)).filter(Boolean),
                        pivotMeasures: (chart.pivotMeasures || []).map(r => reverseMap(chart.datasetId, r)).filter(Boolean),
                        tableDimensions: (chart.tableDimensions || []).map(r => reverseMap(chart.datasetId, r)).filter(Boolean),
                        tableMeasures: (chart.tableMeasures || []).map(r => reverseMap(chart.datasetId, r)).filter(Boolean)
                    });
                    setShowBuilder(true);
                }} className="hover:opacity-70" title="Edit Visual"><Pencil size={14}/></button>}
                {!isViewer && <button onClick={() => setDashboards(p => ({...p, [activePageId]: (p[activePageId] || []).map(c => c.id === chart.id ? { ...c, verticalSize: c.verticalSize === 'tall' ? 'normal' : 'tall' } : c)}))} className="hover:opacity-70" title="Toggle Height"><ArrowUpDown size={14} /></button>}
                {!isViewer && <button onClick={() => setDashboards(p => ({...p, [activePageId]: (p[activePageId] || []).map(c => c.id === chart.id ? { ...c, size: c.size === 'full' ? 'half' : 'full' } : c)}))} className="hover:opacity-70" title="Toggle Width"><Maximize2 size={14} /></button>}
                {!isViewer && <button onClick={() => setDashboards(p => ({...p, [activePageId]: (p[activePageId] || []).filter(c => c.id !== chart.id)}))} className="hover:opacity-70" title="Remove Visual"><X size={16} /></button>}
              </>
          )}
        </div>
      </div>
     
      <div className="w-full flex items-center justify-center transition-all duration-300 overflow-hidden" style={{ height: isExploreMode ? '200px' : (chart.verticalSize === 'tall' ? '400px' : '200px') }}>
         {content}
      </div>
    </div>
  );
});

export default ChartWidget;
