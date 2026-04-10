import React from 'react';
import { useAppState } from '../../contexts/AppStateContext';
import { useChartData } from '../../hooks/useChartData';
import { THEMES } from '../../utils/themeEngine';
import { ArrowUpDown, Maximize2, X, Pencil, Pin, LayoutTemplate, ChevronRight, ChevronDown } from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, Legend, LabelList, LineChart, Line, 
  ScatterChart, Scatter, ZAxis, PieChart as RechartsPieChart, Pie, Cell, Text, Treemap
} from 'recharts';

/**
 * Dynamic Contrast Resolver
 * Determines whether black or white text is more readable for a given background
 */
const getContrastYIQ = (hex) => {
  if (!hex || hex.startsWith('var')) return '#fff';
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? 'rgba(0,0,0,0.85)' : '#fff';
};

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
  const { x, y, width, height, value, textWrap, fontSize, fill, fontWeight, disableHalo, topLabel } = props;
  const haloStyle = disableHalo ? {} : { stroke: 'var(--theme-panel-bg)', strokeWidth: 3, paintOrder: 'stroke' };

  // For Bar Charts: Calculate boundaries based on label position
  const isBBox = width !== undefined && height !== undefined;
  const lx = isBBox ? x + width / 2 : x;
  const ly = isBBox ? (topLabel ? y : y + height / 2) : y;
  const baseline = (isBBox && !topLabel) ? 'middle' : 'auto';
  // Increase dy for line charts to move them further 'away' from the lines/markers
  const dy = topLabel ? (isBBox ? -14 : -22) : (isBBox ? 0 : 22);

  if (!textWrap || typeof value !== 'string' || value.length < 12) {
    return <text x={lx} y={ly} dy={dy} fill={fill} fontSize={fontSize} fontWeight={fontWeight} textAnchor="middle" dominantBaseline={baseline} style={haloStyle}>{value}</text>;
  }
  const words = value.split(' ');
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(' ');
  const line2 = words.slice(mid).join(' ');
  return (
    <text x={lx} y={ly} dy={dy} fill={fill} fontSize={fontSize} fontWeight={fontWeight} textAnchor="middle" dominantBaseline={baseline} style={haloStyle}>
      <tspan x={lx} dy="0">{line1}</tspan>
      <tspan x={lx} dy="1.1em">{line2}</tspan>
    </text>
  );
};

/**
 * Intelligent Sparse Rendering for Dense Series
 * Only render for First, Last, Local Max, and Local Min if points > 6
 */
const getIntelligentLabelVisibility = (index, data, dataKey) => {
  if (!data || data.length === 0) return true;
  const val = data[index][dataKey];
  if (typeof val !== 'number') return false;

  const allMetricKeys = Object.keys(data[index]).filter(k => k !== 'name' && typeof data[index][k] === 'number');
  if (allMetricKeys.length > 1) {
      let globalMax = -Infinity;
      let globalMin = Infinity;
      for (let d of data) {
          for (let k of allMetricKeys) {
              if (d[k] > globalMax) globalMax = d[k];
              if (d[k] < globalMin) globalMin = d[k];
          }
      }
      const range = globalMax - globalMin || 1;
      const collisionThreshold = range * 0.16; // Even more aggressive to ensure no overlays

      for (let k of allMetricKeys) {
          if (k !== dataKey) {
              const otherVal = data[index][k];
              if (Math.abs(val - otherVal) < collisionThreshold) {
                  if (val < otherVal || (val === otherVal && dataKey < k)) return false;
              }
          }
      }
  }

  if (data.length <= 12) return true;
  if (index === 0 || index === data.length - 1) return true;
  
  const allVals = data.map(d => d[dataKey]).filter(v => typeof v === 'number');
  if (allVals.length === 0) return true;
  
  const max = Math.max(...allVals);
  const min = Math.min(...allVals);
  if (val === max || val === min) return true;
  
  const step = Math.ceil(data.length / 8);
  if (index % step === 0) return true;
  
  return false;
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
  
  const { getAggregatedData, getPivotData, getTableData, getScatterData, getMatrixData, getHierarchicalData, datesReady } = useChartData();

  const [chartData, setChartData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  // --- KPI Matrix state ---
  const [matrixRawRow, setMatrixRawRow] = React.useState(null);
  const [matrixLoading, setMatrixLoading] = React.useState(false);
  const [matrixColLabels, setMatrixColLabels] = React.useState({}); // {colId: editedLabel}
  const [matrixRowHeader, setMatrixRowHeader] = React.useState('Measure'); // editable first-column label
  const [expandedCategories, setExpandedCategories] = React.useState({}); // {category: true/false}

  const toggleHeight = (e) => {
    e.stopPropagation();
    setDashboards(p => ({
      ...p,
      [activePageId]: (p[activePageId] || []).map(c => {
        if (c.id === chart.id) {
          const nextSize = c.verticalSize === 'tall' ? 'xl' : (c.verticalSize === 'xl' ? 'normal' : 'tall');
          return { ...c, verticalSize: nextSize };
        }
        return c;
      })
    }));
  };

  const getWidgetHeight = () => {
    if (isExploreMode) return '200px';
    if (chart.verticalSize === 'xl') return '600px';
    if (chart.verticalSize === 'tall') return '400px';
    return '200px'; // normal
  };

  const getDisplayLabel = React.useCallback((fieldRef) => {
      if (!fieldRef) return '';
      const bareId = String(fieldRef).includes('::') ? String(fieldRef).split('::')[1] : String(fieldRef);
      for (const model of Object.values(semanticModels)) {
          const match = model.find(f => f.id.toLowerCase() === bareId.toLowerCase());
          if (match && match.label) return match.label;
      }
      return bareId;
  }, [semanticModels]);

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
        window.dispatchEvent(new CustomEvent('mvantage-debug', { 
            detail: { 
                type: 'info', 
                category: 'Chart', 
                message: `[${Date.now()}] Executing query for "${chart.title}" [${chart.type}]`,
                details: { 
                    id: chart.id,
                    datasetId: chart.datasetId,
                    dimensions: chart.dimension || chart.tableDimensions || chart.treeDimensions || chart.pivotRows || [],
                    measures: chart.measure || chart.tableMeasures || chart.pivotMeasures || []
                }
            } 
        }));
        if (chart.type === 'table') {
          res = await getTableData(chart.datasetId, chart.tableDimensions || [], chart.tableMeasures || [], chart.totalMode, chart.filters || []);
        } else if (chart.type === 'pivot') {
          res = await getPivotData(chart.datasetId, chart.pivotRows || [], chart.pivotCols || [], chart.pivotMeasures || [], chart.totalMode, chart.filters || []);
        } else if (chart.type === 'scatter') {
          res = await getScatterData(chart.datasetId, chart.dimension, chart.xMeasure, chart.yMeasure, chart.colorMeasure, chart.sizeMeasure, chart.filters || []);
        } else if (chart.type === 'matrix') {
          // matrix type is handled by its own useEffect below
          setLoading(false);
          return;
        } else if (chart.type === 'treemap') {
          res = await getHierarchicalData(chart.datasetId, chart.treeDimensions || [], chart.measure, chart.filters || []);
        } else {
          res = await getAggregatedData(chart.datasetId, chart.dimension, chart.measure, chart.legend, chart.filters || []);
        }
        
        const count = Array.isArray(res) ? res.length : (res?.data?.length || res?.rows?.length || (res?.matrix ? Object.keys(res.matrix).length : 0));
        window.dispatchEvent(new CustomEvent('mvantage-debug', { detail: { type: 'success', category: 'Chart', message: `[${Date.now()}] Query finished for ${chart.title}: items=${count}` } }));
        
        // Sanitize chart metric values to guarantee Recharts receives pure numbers for plotting
        const sanitizeArr = (arr) => {
           return arr.map(row => {
             const cleanRow = { ...row };
             Object.keys(cleanRow).forEach(k => {
                if (k !== 'name' && k !== 'children' && cleanRow[k] !== null && typeof cleanRow[k] !== 'number') {
                   const str = String(cleanRow[k]).replace(/^["']|["']$/g, '').replace(/\\"/g, '"').replace(/"/g, '');
                   const num = Number(str.replace(/[^0-9.-]/g, ''));
                   if (!isNaN(num) && str.trim() !== '') cleanRow[k] = num;
                }
             });
             if (Array.isArray(cleanRow.children)) {
                 cleanRow.children = sanitizeArr(cleanRow.children);
             }
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
        window.dispatchEvent(new CustomEvent('mvantage-debug', { detail: { type: 'error', category: 'Chart', message: `SQL Exception: ${e.message}` } }));
        console.error("Fetch Data Error:", e);
        setError(e.message);
        setLoading(false);
      }
    };

    fetchData();
    // React 18 strict mode rapid fires effects, so we don't block the state update
  }, [chart, globalFilters, chartDependencyReady, getAggregatedData, getPivotData, getTableData, getScatterData]);

  // --- Dedicated KPI Matrix data fetch effect ---
  React.useEffect(() => {
    if (chart.type !== 'matrix' || !datesReady) return;
    let active = true;
    setMatrixLoading(true);
    getMatrixData(chart).then(row => {
      if (active) {
        setMatrixRawRow(row);
        setMatrixLoading(false);
        // Seed expanded state: all categories open by default
        const cats = new Set((chart.matrixMeasures || []).map(mId => {
          for (const model of Object.values(semanticModels)) {
            const f = model.find(x => x.id === mId);
            if (f) return f.category || 'Uncategorized';
          }
          return 'Uncategorized';
        }));
        const init = {};
        cats.forEach(c => { init[c] = true; });
        setExpandedCategories(init);
      }
    }).catch(e => { console.error('[Matrix] fetch failed', e); if (active) setMatrixLoading(false); });
    return () => { active = false; };
  }, [chart, globalFilters, datesReady, getMatrixData]);

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

  const formatMeasVal = React.useCallback((val, measureId, compact = false) => {
      if (val === undefined || val === null) return '';
      
      let meas = null;
      for (const model of Object.values(semanticModels)) {
        meas = model.find(m => m.id === measureId);
        if (meas) break;
      }
      const fmt = meas?.format || 'auto';
      
      let cleanVal = (val && typeof val === 'object' && val.length !== undefined) ? String(val[0]) : String(val);
      cleanVal = cleanVal.replace(/^["']|["']$/g, '').replace(/\\"/g, '"').replace(/"/g, '');
      
      const numVal = Number(cleanVal.replace(/[^0-9.-]/g, ''));
      
      const formatCompactIndian = (num) => {
          if (isNaN(num)) return 0;
          const abs = Math.abs(num);
          const sign = num < 0 ? '-' : '';
          if (abs < 1000) return new Intl.NumberFormat('en-IN').format(num);
          if (abs < 100000) return sign + (abs / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
          if (abs < 10000000) return sign + (abs / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
          if (abs < 1000000000) return sign + (abs / 10000000).toFixed(1).replace(/\.0$/, '') + 'Cr';
          return sign + (abs / 1000000000).toFixed(1).replace(/\.0$/, '') + 'Ar';
      };

      const indianFmt = new Intl.NumberFormat('en-IN');
      const baseNum = isNaN(numVal) ? 0 : numVal;
      
      let finalStr = '';
      if (fmt === 'percentage') {
         finalStr = `${(baseNum * 100).toFixed(1)}%`;
      } else if (fmt === 'currency') {
         finalStr = compact ? '₹' + formatCompactIndian(baseNum) : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(baseNum).replace('INR', '₹');
      } else {
         finalStr = compact ? formatCompactIndian(baseNum) : indianFmt.format(baseNum);
      }
      
      if (!isNaN(numVal) && cleanVal.trim() !== '') return finalStr;
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
        const { headers, headerIds, rows, totals } = chartData;
        if (!headers || headers.length === 0) return <div className="t-text-muted text-center pt-10 font-medium text-sm">Add columns to see the Table.</div>;
       
        const renderTableTotals = () => {
            const hasTotals = totals && Object.keys(totals).length > 0;
            const isSumMode = chart.totalMode === 'sum';
            
            return (
                <tr className="bg-black/10 transition-colors font-bold t-text-main shadow-inner">
                    {headerIds.map((id, j) => {
                        const isMeasure = (chart.tableMeasures || []).includes(id);
                        if (j === 0 && !isMeasure) {
                            return <th key={j} className="px-3 py-2 text-left uppercase text-[10px]" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>{isSumMode ? "Sum Total" : "Grand Total"}</th>;
                        }
                        
                        let val = 0;
                        if (isMeasure) {
                            if (isSumMode) {
                                // If the engine provided a Sum total, use it. Otherwise, sum the visible rows for fallback.
                                val = totals?.[id] !== undefined ? totals[id] : rows.reduce((s, r) => s + (Number(r[id]) || 0), 0);
                            } else {
                                // Calculated mode uses the 'totals' object from DB aggregate
                                val = totals?.[id] || 0;
                            }
                        }

                        return (
                            <td key={j} className={`px-3 py-2 ${isMeasure ? 'text-right text-[12px]' : 'text-center uppercase text-[10px]'}`} style={{ border: '1px solid rgba(0,0,0,0.05)' }}>
                                {isMeasure ? formatMeasVal(val, id) : (j === 0 ? (isSumMode ? "Sum Total" : "Grand Total") : "")}
                            </td>
                        );
                    })}
                </tr>
            );
        };

        return (
          <div className="overflow-auto h-full w-full t-border border bg-black/5" style={{ borderRadius: 'calc(var(--theme-radius-panel) / 2)' }}>
             <table className="w-full text-left text-xs border-collapse" style={{ fontFamily: 'inherit' }}>
                <thead className="t-text-main text-[12px] sticky top-0 z-10 shadow-sm font-bold" style={{ background: 'var(--theme-header-bg)' }}>
                   <tr>
                      {headers.map((h, i) => (
                          <th key={i} className="px-3 py-3" style={{ whiteSpace: tWrap ? "normal" : "nowrap", border: '1px solid rgba(0,0,0,0.05)' }}>{h}</th>
                      ))}
                   </tr>
                   {chart.showColTotals && chart.colTotalPosition === 'top' && renderTableTotals()}
                </thead>
                <tbody className="bg-[var(--theme-panel-bg)]">
                   {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-black/5 transition-colors">
                          {headerIds.map((id, j) => {
                              const isMeasure = (chart.tableMeasures || []).includes(id);
                              const val = r[id];
                              return (
                                  <td key={j} className={`px-3 py-2 align-top ${isMeasure ? 'font-medium t-text-main text-right' : 't-text-muted'}`} style={{ border: '1px solid rgba(0,0,0,0.05)' }}>
                                      {isMeasure ? formatMeasVal(val, id) : formatDimVal(val, id)}
                                  </td>
                              );
                          })}
                      </tr>
                   ))}
                </tbody>
                {chart.showColTotals && chart.colTotalPosition === 'bottom' && (
                    <tfoot className="sticky bottom-0 z-10 shadow-[0_-2px_4px_rgba(0,0,0,0.05)] bg-[var(--theme-header-bg)]">
                        {renderTableTotals()}
                    </tfoot>
                )}
             </table>
          </div>
        );
     }

     if (chart.type === 'pivot') {
        const { rowKeys, colKeys, matrix, rowTotals: backendRowTotals, colTotals: backendColTotals, grandTotal: backendGrandTotal } = chartData;
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
           <tr key={`hrow-${levelIndex}`} style={{ background: 'var(--theme-header-bg)' }}>
              {levelIndex === 0 && (chart.pivotRows || []).map((r, i) => (
                 <th key={`rh-${i}`} rowSpan={headerDepth} className="px-3 py-2.5 font-bold t-text-main align-bottom text-[12px]" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>
                    {getDisplayLabel(r)}
                 </th>
              ))}
              {levelIndex === 0 && chart.showRowTotals && chart.rowTotalPosition === 'start' && (chart.pivotMeasures || []).map((mId, idx) => (
                 <th key={`rhts-${idx}`} rowSpan={headerDepth} className="px-3 py-2.5 font-bold t-text-main align-bottom text-[12px] bg-black/10" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>
                     Total {chart.pivotMeasures.length > 1 ? getDisplayLabel(mId) : ''}
                 </th>
              ))}
              {colKeys.map((ck, i) => {
                  const span = colSpans[levelIndex][i];
                  if (!span) return null;
                  const parts = ck.split(' | ');
                  const val = parts[levelIndex] || '';
                  return (
                      <th key={`${ck}-${levelIndex}`} colSpan={span} className="px-3 py-2.5 font-bold t-text-main text-center text-[12px]" style={{ whiteSpace: tWrap ? 'normal' : 'nowrap', border: '1px solid rgba(0,0,0,0.05)' }}>
                          {levelIndex < (chart.pivotCols || []).length ? formatDimVal(val, chart.pivotCols[levelIndex]) : getDisplayLabel(val)}
                      </th>
                  );
              })}
              {levelIndex === 0 && chart.showRowTotals && chart.rowTotalPosition === 'end' && (chart.pivotMeasures || []).map((mId, idx) => (
                 <th key={`rhte-${idx}`} rowSpan={headerDepth} className="px-3 py-2.5 font-bold t-text-main align-bottom text-[12px] bg-black/10" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>
                     Total {chart.pivotMeasures.length > 1 ? getDisplayLabel(mId) : ''}
                 </th>
              ))}
           </tr>
        ));

        const isCalculated = chart.totalMode === 'calculated';
       
        // Row Total aggregator function
        const getRowTotal = (rk, mId) => {
            if (isCalculated && backendRowTotals?.[rk]?.[mId] !== undefined) {
                return backendRowTotals[rk][mId];
            }
            let sum = 0;
            colKeys.forEach(ck => {
                const parts = ck.split(' | ');
                const cMeas = chart.pivotMeasures.length > 1 ? parts[parts.length - 1] : chart.pivotMeasures[0];
                if (cMeas === mId) sum += Number(matrix[rk]?.[ck]) || 0;
            });
            return sum;
        };

        // Column Totals Aggregation
        const colTotals = {};
        colKeys.forEach(ck => {
            if (isCalculated && backendColTotals?.[ck] !== undefined) {
                colTotals[ck] = backendColTotals[ck];
            } else {
                colTotals[ck] = rowKeys.reduce((sum, rk) => sum + (Number(matrix[rk]?.[ck]) || 0), 0);
            }
        });

        const renderPivotColTotals = () => {
            if (!chart.showColTotals) return null;
            return (
                <tr className="font-bold bg-black/10 t-text-main shadow-inner text-xs">
                   {chart.pivotRows.map((r, i) => (
                       <td key={`pct-${i}`} className="px-3 py-2 uppercase text-[10px]" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>
                           {i === 0 ? (isCalculated ? "Grand Total" : "Sum Total") : ""}
                       </td>
                   ))}
                   {chart.showRowTotals && chart.rowTotalPosition === 'start' && chart.pivotMeasures.map(mId => {
                       let total = 0;
                       if (isCalculated && backendGrandTotal?.[mId] !== undefined) {
                           total = backendGrandTotal[mId];
                       } else {
                           total = rowKeys.reduce((sum, rk) => sum + getRowTotal(rk, mId), 0);
                       }
                       return <td key={`pcts-${mId}`} className="px-3 py-2 text-right text-[12px]" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>{formatMeasVal(total, mId)}</td>
                   })}
                   {colKeys.map(ck => {
                       const parts = ck.split(' | ');
                       const mId = chart.pivotMeasures.length > 1 ? parts[parts.length - 1] : chart.pivotMeasures[0];
                       return <td key={`pct-${ck}`} className="px-3 py-2 text-right" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>{formatMeasVal(colTotals[ck] || 0, mId)}</td>
                   })}
                   {chart.showRowTotals && chart.rowTotalPosition === 'end' && chart.pivotMeasures.map(mId => {
                       let total = 0;
                       if (isCalculated && backendGrandTotal?.[mId] !== undefined) {
                           total = backendGrandTotal[mId];
                       } else {
                           total = rowKeys.reduce((sum, rk) => sum + getRowTotal(rk, mId), 0);
                       }
                       return <td key={`pcte-${mId}`} className="px-3 py-2 text-right text-[12px]" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>{formatMeasVal(total, mId)}</td>
                   })}
                </tr>
            );
        };

        return (
          <div className="overflow-auto h-full w-full t-border border bg-black/5" style={{ borderRadius: 'calc(var(--theme-radius-panel) / 2)' }}>
             <table className="w-full text-xs text-left">
                <thead className="t-panel sticky top-0 z-10">
                   {headerRows}
                   {chart.showColTotals && chart.colTotalPosition === 'top' && renderPivotColTotals()}
                </thead>
                 <tbody className="bg-[var(--theme-panel-bg)]">
                   {rowKeys.map(rk => {
                      const rkVals = rk.split(' | ');
                      return (
                         <tr key={rk} className="hover:bg-black/5 transition-colors text-xs">
                            {rkVals.map((rv, idx) => (
                                <td key={idx} className="px-3 py-1.5 font-bold t-text-main whitespace-nowrap" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>{formatDimVal(rv, chart.pivotRows[idx])}</td>
                            ))}
                            {chart.showRowTotals && chart.rowTotalPosition === 'start' && chart.pivotMeasures.map(mId => (
                                <td key={`rts-${mId}`} className="px-3 py-1.5 font-bold t-text-main text-right bg-black/10 shadow-inner" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>
                                    {formatMeasVal(getRowTotal(rk, mId), mId)}
                                </td>
                            ))}
                            {colKeys.map(ck => {
                                const val = matrix[rk]?.[ck];
                                const parts = ck.split(' | ');
                                const mId = chart.pivotMeasures.length > 1 ? parts[parts.length - 1] : chart.pivotMeasures[0];
                                return (
                                    <td key={ck} className="px-3 py-1.5 t-text-muted text-right" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>
                                        {val !== undefined && val !== null ? formatMeasVal(val, mId) : '-'}
                                    </td>
                                );
                            })}
                            {chart.showRowTotals && chart.rowTotalPosition === 'end' && chart.pivotMeasures.map(mId => (
                                <td key={`rte-${mId}`} className="px-3 py-1.5 font-bold t-text-main text-right bg-black/10 shadow-inner" style={{ border: '1px solid rgba(0,0,0,0.05)' }}>
                                    {formatMeasVal(getRowTotal(rk, mId), mId)}
                                </td>
                            ))}
                         </tr>
                      )
                   })}
                </tbody>
                {chart.showColTotals && chart.colTotalPosition === 'bottom' && (
                    <tfoot className="sticky bottom-0 z-10 shadow-[0_-2px_4px_rgba(0,0,0,0.05)] bg-[var(--theme-header-bg)]">
                        {renderPivotColTotals()}
                    </tfoot>
                )}
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
               <ScatterChart margin={{ top: 45, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--theme-border)" />
                  <XAxis type="number" dataKey="x" name={semanticModel.find(m => m.id === chart.xMeasure)?.label || 'X'} tick={chart.showXAxisLabels === false ? false : <WrappedTick textWrap={tWrap} fontSize={10} fill="var(--theme-text-muted)" />} axisLine={false} tickLine={false} tickFormatter={(v) => formatMeasVal(v, chart.xMeasure, true)} />
                  <YAxis type="number" dataKey="y" name={semanticModel.find(m => m.id === chart.yMeasure)?.label || 'Y'} tick={chart.showYAxisLabels === false ? false : {fill: 'var(--theme-text-muted)', fontSize: 10}} width={chart.showYAxisLabels === false ? 10 : 65} axisLine={false} tickLine={false} tickFormatter={(v) => formatMeasVal(v, chart.yMeasure, true)} domain={[0, (max) => max * 1.25]} />
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
                     {chart.showDataLabels && <LabelList dataKey="name" position="top" fill="var(--theme-text-muted)" fontSize={10} fontWeight="normal" content={(props) => getIntelligentLabelVisibility(props.index, scatterData, 'name') ? <WrappedLabel {...props} value={props.value} fill="var(--theme-text-muted)" fontWeight="normal" textWrap={textWrap} disableHalo={false} topLabel={true} /> : null} />}
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
            <BarChart data={data} margin={{ top: 45, right: 20, left: 10, bottom: 20 }}>
              <XAxis dataKey="name" tick={chart.showXAxisLabels === false ? false : <WrappedTick textWrap={tWrap} fontSize={10} fill="var(--theme-text-muted)" />} axisLine={false} tickLine={false} tickFormatter={(v) => formatDimVal(v, chart.dimension)} />
              <YAxis domain={[0, (max) => max * 1.25]} tick={chart.showYAxisLabels === false ? false : {fill: 'var(--theme-text-muted)', fontSize: 10}} width={chart.showYAxisLabels === false ? 10 : 65} axisLine={false} tickLine={false} tickFormatter={(v) => formatMeasVal(v, chart.measure, true)} />
              <RechartsTooltip cursor={{fill: 'var(--theme-border)', opacity: 0.5}} contentStyle={{ borderRadius: 'var(--theme-radius-panel)', border: 'none', boxShadow: 'var(--theme-shadow)', background: 'var(--theme-panel-bg)', color: 'var(--theme-text-main)' }} labelFormatter={(v) => formatDimVal(v, chart.dimension)} formatter={(val, name) => [formatMeasVal(val, chart.measure), chart.legend ? name : (getDisplayLabel(chart.measure) || 'Value')]} />
              {chart.legend && <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: 'var(--theme-text-main)' }} />}
              {legendKeys.map((k, i) => (
                 <Bar key={k} dataKey={k} name={k === 'value' ? (getDisplayLabel(chart.measure) || 'Value') : k} fill={tColors[i % tColors.length]} onClick={(d) => {if(dimOriginKey && !isExploreMode && toggleGlobalFilter) toggleGlobalFilter(dimOriginKey, d.name);}} className={isExploreMode ? "" : "cursor-pointer transition-all duration-300"}>
                   {data.map((e, idx) => <Cell key={idx} opacity={!isExploreMode && activeFilterVal.length > 0 && !activeFilterVal.includes(String(e.name)) ? 0.3 : 1} />)}
                   {chart.showDataLabels && <LabelList dataKey={k} position="top" fill="var(--theme-text-muted)" fontSize={10} fontWeight="normal" formatter={(v) => formatMeasVal(v, chart.measure, true)} content={(props) => <WrappedLabel {...props} value={formatMeasVal(props.value, chart.measure, true)} fill="var(--theme-text-muted)" fontWeight="normal" textWrap={textWrap} disableHalo={false} topLabel={true} />} />}
                 </Bar>
              ))}
            </BarChart>
          ) : chart.type === 'pie' ? (
            <RechartsPieChart>
              <RechartsTooltip contentStyle={{ borderRadius: 'var(--theme-radius-panel)', border: 'none', boxShadow: 'var(--theme-shadow)', background: 'var(--theme-panel-bg)', color: 'var(--theme-text-main)' }} formatter={(v, n) => [formatMeasVal(v, chart.measure), formatDimVal(n, chart.dimension)]} />
              <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" onClick={(d) => {if(dimOriginKey && !isExploreMode && toggleGlobalFilter) toggleGlobalFilter(dimOriginKey, d.name);}} className={isExploreMode ? "" : "cursor-pointer"} label={chart.showDataLabels ? (props) => <text x={props.x} y={props.y} fill="var(--theme-text-muted)" fontSize={10} fontWeight="normal" textAnchor={props.textAnchor} dominantBaseline="central">{`${formatDimVal(props.name, chart.dimension)}: ${formatMeasVal(props.value, chart.measure, true)} (${(props.percent * 100).toFixed(0)}%)`}</text> : false} labelLine={false}>
                {data.map((e, i) => <Cell key={i} fill={tColors[i % tColors.length]} opacity={!isExploreMode && activeFilterVal.length > 0 && !activeFilterVal.includes(String(e.name)) ? 0.3 : 1} style={{ outline: 'none' }} />)}
              </Pie>
              <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: 'var(--theme-text-main)' }} />
            </RechartsPieChart>
          ) : chart.type === 'treemap' ? (
            <React.Fragment>
            {console.log('TREEMAP DATA:', Array.isArray(chartData) ? chartData : chartData?.data)}
            <Treemap
                data={Array.isArray(chartData) ? chartData : (chartData?.data || [])}
                dataKey="value"
                stroke="var(--theme-panel-bg)"
                content={(props) => {
                   const { depth, x, y, width, height, name, value, rootIndex, children } = props;
                   if (width < 10 || height < 10 || depth < 1) return null;
                   
                   const colorIdx = rootIndex !== undefined ? rootIndex : props.index;
                   const fill = tColors[Math.max(0, colorIdx) % tColors.length] || tColors[0];
                   
                   const isLeaf = !children || children.length === 0;
                   const labelColor = getContrastYIQ(fill);
                   
                   return (
                      <g>
                         <rect x={x} y={y} width={width} height={height} fill={fill} stroke="var(--theme-panel-bg)" strokeWidth={1} style={{ fillOpacity: depth === 1 ? 0.9 : 0.7 }} />
                         {isLeaf && width > 30 && height > 20 && (
                            <foreignObject x={x + 4} y={y + 4} width={width - 8} height={height - 8} style={{ pointerEvents: 'none' }}>
                               <div style={{ 
                                  color: labelColor, 
                                  fontFamily: 'var(--theme-font, inherit)',
                                  fontSize: '11px',
                                  lineHeight: '1.2',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '2px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'normal',
                                  WebkitFontSmoothing: 'antialiased',
                                  MozOsxFontSmoothing: 'grayscale'
                               }}>
                                  <div style={{ fontWeight: '600', opacity: 1, letterSpacing: '-0.01em' }}>{name}</div>
                                  <div style={{ fontWeight: '400', opacity: 0.85, fontSize: '10px' }}>{formatMeasVal(value, chart.measure, false)}</div>
                               </div>
                            </foreignObject>
                         )}
                      </g>
                   );
                }}
            >
               <RechartsTooltip contentStyle={{ borderRadius: 'var(--theme-radius-panel)', border: 'none', boxShadow: 'var(--theme-shadow)', background: 'var(--theme-panel-bg)', color: 'var(--theme-text-main)' }} formatter={(v, n) => [formatMeasVal(v, chart.measure), n]} />
            </Treemap>
            </React.Fragment>
          ) : (
            <LineChart data={data} margin={{ top: 45, right: 20, left: 10, bottom: 20 }}>
              <XAxis dataKey="name" tick={chart.showXAxisLabels === false ? false : <WrappedTick textWrap={tWrap} fontSize={10} fill="var(--theme-text-muted)" />} axisLine={false} tickLine={false} tickFormatter={(v) => formatDimVal(v, chart.dimension)} />
              <YAxis domain={[0, (max) => max * 1.25]} tick={chart.showYAxisLabels === false ? false : {fill: 'var(--theme-text-muted)', fontSize: 10}} width={chart.showYAxisLabels === false ? 10 : 65} axisLine={false} tickLine={false} tickFormatter={(v) => formatMeasVal(v, chart.measure, true)} />
              <RechartsTooltip contentStyle={{ borderRadius: 'var(--theme-radius-panel)', border: 'none', boxShadow: 'var(--theme-shadow)', background: 'var(--theme-panel-bg)', color: 'var(--theme-text-main)' }} labelFormatter={(v) => formatDimVal(v, chart.dimension)} formatter={(val, name) => [formatMeasVal(val, chart.measure), chart.legend ? name : (getDisplayLabel(chart.measure) || 'Value')]} />
              {chart.legend && <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: 'var(--theme-text-main)' }} />}
               {legendKeys.map((k, i) => (
                 <Line key={k} type="linear" name={k === 'value' ? (getDisplayLabel(chart.measure) || 'Value') : k} dataKey={k} stroke={tColors[i % tColors.length]} strokeWidth={1.5} dot={{ r: 3, fill: tColors[i % tColors.length], strokeWidth: 0 }} activeDot={{ r: 5, onClick: (e, p) => {if(dimOriginKey && !isExploreMode && toggleGlobalFilter) toggleGlobalFilter(dimOriginKey, p.payload.name); } }} className={isExploreMode ? "" : "cursor-pointer"}>
                {chart.showDataLabels && (
                  <LabelList 
                    dataKey={k} 
                    position="top" 
                    fill="var(--theme-text-muted)" 
                    fontSize={10} 
                    fontWeight="normal" 
                    formatter={(v) => formatMeasVal(v, chart.measure, true)} 
                    content={(props) => getIntelligentLabelVisibility(props.index, data, k) ? (
                      <WrappedLabel 
                        {...props} 
                        value={formatMeasVal(props.value, chart.measure, true)} 
                        fill="var(--theme-text-muted)" 
                        fontWeight="normal" 
                        textWrap={textWrap} 
                        disableHalo={false} 
                        topLabel={true} 
                      />
                    ) : null} 
                  />
                )}
                 </Line>
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
     );
  }, [chart, chartData, loading, globalFilters, semanticModel, tColors, getAggregatedData, getPivotData, getTableData, getScatterData, getOriginKey, formatMeasVal, formatDimVal, isExploreMode, toggleGlobalFilter]);

  // =============================== KPI MATRIX RENDERER ===============================
  if (chart.type === 'matrix') {
    const scopeCols = (chart.matrixColumns || []).filter(c => c.type === 'scope');
    const allCols = chart.matrixColumns || [];

    // Format date as dd-Mon-yy
    const fmtDate = (d) => {
      if (!d) return null;
      const dt = new Date(d);
      if (isNaN(dt)) return null;
      return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    };

    // Build column header with dynamic dates
    const buildHeader = (col) => {
      const baseLabel = matrixColLabels[col.id] ?? col.label;
      const safeId = col.id.replace(/[^a-zA-Z0-9_]/g, '_');
      const startRaw = matrixRawRow?.[`start_${safeId}`];
      const endRaw = matrixRawRow?.[`end_${safeId}`];
      const startStr = fmtDate(startRaw);
      const endStr = fmtDate(endRaw);
      const dateRange = (startStr && endStr) ? `(${startStr} to ${endStr})` : '';
      return { baseLabel, dateRange };
    };

    // Collect measure metadata (category grouping from semantic model)
    const allSemanticFields = Object.values(semanticModels).flat();
    const measureMeta = (chart.matrixMeasures || []).map(mId => {
      const f = allSemanticFields.find(x => x.id === mId);
      return { id: mId, label: f?.label || mId, category: f?.category || 'Uncategorized', format: f?.format || 'auto' };
    });

    // Get value from flat row
    const getValue = (measId, colId) => {
      const safeM = measId.replace(/[^a-zA-Z0-9_]/g, '_');
      const safeC = colId.replace(/[^a-zA-Z0-9_]/g, '_');
      const raw = matrixRawRow?.[`m_${safeM}_${safeC}`];
      return raw != null ? Number(raw) : null;
    };

    // Compute variance
    const computeVariance = (varCol, measId) => {
      const colA = scopeCols.find(c => c.id === varCol.colAId);
      const colB = scopeCols.find(c => c.id === varCol.colBId);
      if (!colA || !colB) return null;
      const a = getValue(measId, colA.id);
      const b = getValue(measId, colB.id);
      if (a == null || b == null) return null;
      if (varCol.varianceMode === '%') return b !== 0 ? ((a / b) - 1) * 100 : null;
      return a - b;
    };

    // Format number
    const fmtVal = (v, format, isPercent) => {
      if (v == null || isNaN(v)) return '—';
      if (isPercent) return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
      if (format === 'percentage') return (v * 100).toFixed(1) + '%';
      return v.toLocaleString('en-IN');
    };

    // Group measures by category
    const grouped = {};
    measureMeta.forEach(m => {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category].push(m);
    });

    // Save inline edited label
    const saveInlineLabel = (colId, newLabel) => {
      setMatrixColLabels(prev => ({ ...prev, [colId]: newLabel }));
      setDashboards(prev => ({
        ...prev,
        [activePageId]: (prev[activePageId] || []).map(c => c.id === chart.id
          ? { ...c, matrixColumns: c.matrixColumns.map(mc => mc.id === colId ? { ...mc, label: newLabel } : mc) }
          : c
        )
      }));
    };

    // Open builder for edit
    const handleEdit = () => {
      setBuilderForm({ ...initBuilderForm, ...chart });
      setShowBuilder(true);
    };
    return (
      <div key={chart.id} className={`${isExploreMode ? 'bg-black/5 w-full mt-2' : 't-panel'} shadow-sm border t-border flex flex-col hover:shadow-md transition-all duration-300 ${
        !isExploreMode ? (chart.size === 'full' ? 'md:col-span-6' : (chart.size === 'third' ? 'md:col-span-2' : 'md:col-span-3')) : ''
      } overflow-hidden`} style={{ borderRadius: 'var(--theme-radius-panel)' }}>

        {/* Header bar — matches legacy style */}
        <div className="flex justify-between items-center px-4 py-3 border-b t-border shrink-0">
          <h4 className="t-text-main font-bold text-sm">{chart.title}</h4>
          <div className="flex gap-1.5 t-text-muted items-center">
            {!isExploreMode && !isViewer && (
              <>
                <button onClick={handleEdit} className="hover:opacity-70" title="Edit Visual"><Pencil size={13}/></button>
                <button onClick={toggleHeight} className="hover:opacity-70" title="Toggle Height"><ArrowUpDown size={14}/></button>
                <button onClick={() => setDashboards(p => ({...p, [activePageId]: (p[activePageId]||[]).map(c => c.id===chart.id?{...c,size:(!c.size||c.size==='half')?'third':(c.size==='third'?'full':'half')}:c)}))} className="hover:opacity-70" title="Toggle Width"><Maximize2 size={14}/></button>
                <button onClick={() => setDashboards(p => ({...p, [activePageId]: (p[activePageId]||[]).filter(c => c.id!==chart.id)}))} className="hover:opacity-70" title="Remove"><X size={14}/></button>
              </>
            )}
          </div>
        </div>

        {/* Scrollable table body — explicit height enables toggle */}
        <div className="overflow-y-auto transition-all duration-300" style={{ height: getWidgetHeight() }}>
          {matrixLoading ? (
            <div className="flex items-center justify-center h-20 t-text-muted text-xs">Loading matrix data…</div>
          ) : (
            <table className="w-full text-xs border-collapse" style={{ fontFamily: 'inherit' }}>
              <thead className="sticky top-0 z-10 matrix-header-glass">
                <tr>
                  {/* First column — editable row header label */}
                  <th className="text-left px-3 py-2 font-black t-text-muted" style={{ fontSize: '12px', border: '1px solid rgba(0,0,0,0.05)' }}>
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={e => setMatrixRowHeader(e.currentTarget.textContent.trim() || 'Measure')}
                      className="outline-none cursor-text hover:underline decoration-dotted"
                    >{matrixRowHeader}</span>
                  </th>
                  {allCols.map(col => {
                    const h = col.type === 'scope' ? buildHeader(col) : null;
                    const baseLabel = col.type === 'variance' ? (matrixColLabels[col.id] ?? col.label) : h?.baseLabel;
                    const dateRange = h?.dateRange;
                    return (
                      <th key={col.id} className="text-right px-3 py-2 font-black t-text-muted" style={{ fontSize: '12px', border: '1px solid rgba(0,0,0,0.05)' }}>
                        <div className="flex flex-col items-end gap-px">
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={e => saveInlineLabel(col.id, e.currentTarget.textContent.trim())}
                            className="outline-none cursor-text hover:underline decoration-dotted"
                          >{baseLabel}</span>
                          {dateRange && <span className="font-normal normal-case opacity-60" style={{ fontSize: '9px' }}>{dateRange}</span>}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([cat, measures]) => {
                  const isExpanded = expandedCategories[cat] !== false;
                  // Category SUM rollup per scope column; avg % for variance
                  const catRollup = allCols.map(col => {
                    if (col.type === 'variance') {
                      const vals = measures.map(m => computeVariance(col, m.id)).filter(v => v != null);
                      return vals.length > 0 ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
                    }
                    return measures.reduce((sum, m) => sum + (getValue(m.id, col.id) || 0), 0);
                  });

                  return (
                    <React.Fragment key={cat}>
                      {/* Category header row — plain white background, faint cell borders */}
                      <tr
                        className="cursor-pointer select-none matrix-row-hover"
                        onClick={() => setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }))}
                      >
                        <td className="px-3 py-2 font-black t-text-main" style={{ fontSize: '11px', border: '1px solid rgba(0,0,0,0.05)' }}>
                          <span className="flex items-center gap-1.5">
                            {isExpanded
                              ? <ChevronDown size={11} style={{ color: 'var(--theme-accent)' }}/>
                              : <ChevronRight size={11} style={{ color: 'var(--theme-accent)' }}/>}
                            {cat} —
                          </span>
                        </td>
                        {catRollup.map((val, ci) => {
                          const col = allCols[ci];
                          const isVar = col?.type === 'variance';
                          const isNeg = val != null && val < 0;
                          return (
                            <td key={ci} className="text-right px-3 py-2 font-black tabular-nums" style={{
                              fontSize: '11px',
                              border: '1px solid rgba(0,0,0,0.05)',
                              color: isVar ? (isNeg ? '#e03131' : '#2f9e44') : 'var(--theme-text-main)'
                            }}>
                              {fmtVal(val, 'number', isVar && col?.varianceMode === '%')}
                            </td>
                          );
                        })}
                      </tr>
                      {isExpanded && measures.map((m, mi) => (
                        <tr key={m.id} className="matrix-row-hover">
                          <td className="px-3 py-1.5 t-text-main font-medium transition-colors" style={{ paddingLeft: '28px', fontSize: '11px', border: '1px solid rgba(0,0,0,0.05)' }}>
                            {m.label}
                          </td>
                          {allCols.map(col => {
                            const isVar = col.type === 'variance';
                            const val = isVar ? computeVariance(col, m.id) : getValue(m.id, col.id);
                            const isNeg = val != null && val < 0;
                            return (
                              <td key={col.id} className="text-right px-3 py-1.5 tabular-nums transition-all" style={{
                                fontSize: '11px',
                                border: '1px solid rgba(0,0,0,0.05)',
                                color: isVar ? (val == null ? 'var(--theme-text-muted)' : isNeg ? '#e03131' : '#2f9e44') : 'var(--theme-text-main)',
                                fontWeight: isVar ? 600 : 400
                              }}>
                                {fmtVal(val, m.format, isVar && col?.varianceMode === '%')}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }






  if (chart.type === 'infographic') {
      return (
         <div key={chart.id} className={`${isExploreMode ? 'bg-black/5 w-full mt-2' : 't-panel'} shadow-sm border t-border flex flex-col hover:shadow-md transition-all duration-300 ${!isExploreMode ? (chart.size === 'full' ? 'md:col-span-6' : (chart.size === 'third' ? 'md:col-span-2' : 'md:col-span-3')) : ''} overflow-hidden`} style={{ borderRadius: 'var(--theme-radius-panel)' }}>
            <div className="flex justify-between items-start p-4 mb-0 bg-black/5 border-b t-border shrink-0">
               <h4 className="t-text-main" style={{ fontSize: '1.1rem', fontWeight: 600, whiteSpace: tWrap ? "normal" : "nowrap", color: 'var(--theme-text-main)' }}>{chart.title}</h4>
               <div className="flex gap-2 t-text-muted">
                  {!isExploreMode && !isViewer && (
                     <>
                       <button onClick={() => setDashboards(p => ({...p, [activePageId]: (p[activePageId] || []).map(c => c.id === chart.id ? { ...c, verticalSize: c.verticalSize === 'tall' ? 'normal' : 'tall' } : c)}))} className="hover:opacity-70" title="Toggle Height"><ArrowUpDown size={14} /></button>
                       <button onClick={() => setDashboards(p => ({...p, [activePageId]: (p[activePageId] || []).map(c => c.id === chart.id ? { ...c, size: (!c.size || c.size === 'half') ? 'third' : (c.size === 'third' ? 'full' : 'half') } : c)}))} className="hover:opacity-70" title="Toggle Width"><Maximize2 size={14} /></button>
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
    <div key={chart.id} className={`${isExploreMode ? 'bg-black/5 w-full mt-2' : 't-panel'} p-3 shadow-sm border flex flex-col hover:shadow-md transition-all duration-300 ${!isExploreMode ? (chart.size === 'full' ? 'md:col-span-6' : (chart.size === 'third' ? 'md:col-span-2' : 'md:col-span-3')) : ''}`} style={{ borderRadius: 'var(--theme-radius-panel)' }}>
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
                {!isViewer && <button onClick={toggleHeight} className="hover:opacity-70" title="Toggle Height"><ArrowUpDown size={14} /></button>}
                {!isViewer && <button onClick={() => setDashboards(p => ({...p, [activePageId]: (p[activePageId] || []).map(c => c.id === chart.id ? { ...c, size: (!c.size || c.size === 'half') ? 'third' : (c.size === 'third' ? 'full' : 'half') } : c)}))} className="hover:opacity-70" title="Toggle Width"><Maximize2 size={14} /></button>}
                {!isViewer && <button onClick={() => setDashboards(p => ({...p, [activePageId]: (p[activePageId] || []).filter(c => c.id !== chart.id)}))} className="hover:opacity-70" title="Remove Visual"><X size={16} /></button>}
              </>
          )}
        </div>
      </div>
     
      <div className="w-full flex items-center justify-center transition-all duration-300 overflow-hidden" style={{ height: getWidgetHeight() }}>
         {content}
      </div>
    </div>
  );
});

export default ChartWidget;
