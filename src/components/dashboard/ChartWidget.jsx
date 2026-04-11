import React from 'react';
import { useAppState } from '../../contexts/AppStateContext';
import { useChartData } from '../../hooks/useChartData';
import { THEMES } from '../../utils/themeEngine';
import { ArrowUpDown, Maximize2, X, Pencil, Pin, LayoutTemplate, ChevronRight, ChevronDown, Plus, Trash2 } from 'lucide-react';
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

// =============================== SUNBURST CHART COMPONENT ===============================
const SunburstArc = ({ segment, fill, onMouseEnter, onMouseLeave, opacity, isAnimated }) => {
  const { startAngle, endAngle, innerRadius, outerRadius } = segment;
  
  const getArcPath = (start, end, ir, or) => {
    const s1 = (start * Math.PI) / 180;
    const e1 = (end * Math.PI) / 180;
    const x1 = Math.cos(s1) * or;
    const y1 = Math.sin(s1) * or;
    const x2 = Math.cos(e1) * or;
    const y2 = Math.sin(e1) * or;
    const x3 = Math.cos(e1) * ir;
    const y3 = Math.sin(e1) * ir;
    const x4 = Math.cos(s1) * ir;
    const y4 = Math.sin(s1) * ir;
    const largeArc = end - start > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${or} ${or} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${ir} ${ir} 0 ${largeArc} 0 ${x4} ${y4} Z`;
  };

  const path = getArcPath(startAngle, endAngle, innerRadius, outerRadius);

  return (
    <path
      d={path}
      fill={fill || 'var(--theme-accent)'}
      fillOpacity={opacity}
      className="transition-all duration-300 ease-out cursor-pointer hover:brightness-110"
      onMouseEnter={(e) => onMouseEnter(segment, e)}
      onMouseLeave={onMouseLeave}
      stroke="var(--theme-panel-bg)"
      strokeWidth={0.5}
    />
  );
};

const SunburstChart = ({ data, colors, formatMeasVal, measureId }) => {
  const [hovered, setHovered] = React.useState(null);
  const [tooltipPos, setTooltipPos] = React.useState({ x: 0, y: 0 });

  const totalValue = React.useMemo(() => (data || []).reduce((sum, d) => sum + (d.value || 0), 0), [data]);
  
  const V_SIZE = 500;
  const V_CENTER = V_SIZE / 2;

  const processedData = React.useMemo(() => {
    if (!data || data.length === 0 || totalValue === 0) return [];
    const segments = [];
    const levelWidth = V_SIZE / (2 * 5.5); 
    const processLevel = (nodes, currentStart, currentEnd, level, path = []) => {
      let start = currentStart;
      nodes.forEach((node, i) => {
        const nodeAngle = (node.value / totalValue) * 360;
        const end = start + nodeAngle;
        segments.push({ ...node, startAngle: start, endAngle: end, innerRadius: level === 0 ? levelWidth * 1.5 : levelWidth * (level + 1.5), outerRadius: levelWidth * (level + 2.5), level, path: [...path, node.name], colorIdx: i });
        if (node.children?.length > 0) processLevel(node.children, start, end, level + 1, [...path, node.name]);
        start = end;
      });
    };
    processLevel(data, 0, 360, 0);
    return segments;
  }, [data, totalValue]);

  if (!data || data.length === 0) return <div className="w-full h-full flex items-center justify-center text-[11px] t-text-muted italic opacity-40">Building hierarchy...</div>;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative">
      <svg 
        width="100%" 
        height="100%" 
        viewBox={`0 0 ${V_SIZE} ${V_SIZE}`} 
        className="overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <g transform={`translate(${V_CENTER}, ${V_CENTER})`}>
          {/* Subtle Center Glass Effect */}
          <circle r={V_SIZE/6} fill="var(--theme-accent)" opacity={0.03} />
          <circle r={V_SIZE/6} fill="none" stroke="var(--theme-accent)" opacity={0.1} strokeWidth={1} strokeDasharray="4 4" />
          
          <text textAnchor="middle" dy="-5" className="fill-[var(--theme-text-muted)] text-[10px] font-bold uppercase tracking-widest opacity-40">Total</text>
          <text textAnchor="middle" dy="25" className="fill-[var(--theme-text-main)] text-[28px] font-black tracking-tighter" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>
            {formatMeasVal(totalValue, measureId)}
          </text>
          
          {processedData.map((seg, idx) => {
            const fill = colors[(seg.colorIdx + seg.level) % (colors.length || 1)] || 'var(--theme-accent)';
            const isDimmed = hovered && !seg.path.join('|').startsWith(hovered.path.join('|')) && !hovered.path.join('|').startsWith(seg.path.join('|'));
            
            return (
              <SunburstArc 
                key={`${seg.name}-${idx}`} 
                segment={seg} 
                fill={fill} 
                opacity={isDimmed ? 0.15 : 0.85}
                onMouseEnter={(s, e) => {
                  setHovered(s);
                  setTooltipPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
        </g>
      </svg>

      {hovered && (
        <div 
          className="fixed pointer-events-none z-[100] p-4 bg-white/95 backdrop-blur-md shadow-2xl border border-black/5 flex flex-col gap-1.5 min-w-[160px]"
          style={{ 
            left: tooltipPos.x + 20, 
            top: tooltipPos.y + 20,
            borderRadius: '16px'
          }}
        >
          <div className="flex items-center gap-1.5 opacity-40 text-[9px] font-black uppercase tracking-widest">
            {hovered.path.map((p, i) => (
              <React.Fragment key={i}>
                <span>{p}</span>
                {i < hovered.path.length - 1 && <span>›</span>}
              </React.Fragment>
            ))}
          </div>
          <p className="text-[14px] font-black tracking-tight text-gray-900">{hovered.name}</p>
          <div className="h-px bg-black/5 w-full my-0.5" />
          <div className="flex items-center justify-between gap-4">
             <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Share</span>
             <span className="text-[11px] font-black t-accent">{((hovered.value / totalValue) * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between gap-4">
             <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Value</span>
             <span className="text-[13px] font-black text-gray-900">{formatMeasVal(hovered.value, measureId)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const DecompositionTree = ({ data, colors, formatMeasVal, measureId }) => {
  const [expandedPaths, setExpandedPaths] = React.useState(['root']);
  const containerRef = React.useRef(null);
  const [coords, setCoords] = React.useState({}); // { path: { x, y } }

  const totalValue = React.useMemo(() => (data || []).reduce((sum, d) => sum + (d.value || 0), 0), [data]);

  const toggleNode = (path) => {
    setExpandedPaths(prev => {
      if (prev.includes(path)) {
        // Collapsing: remove this path and all its descendants
        return prev.filter(p => !p.startsWith(path));
      } else {
        // Expanding: keep root, keep parents, but clear siblings at this level
        const parts = path.split('|');
        const level = parts.length;
        const parentPath = parts.slice(0, -1).join('|');
        
        // Filter out siblings (paths with same parent and same level)
        const filtered = prev.filter(p => {
          const pParts = p.split('|');
          if (pParts.length >= level && p.startsWith(parentPath) && p !== parentPath) return false;
          return true;
        });
        
        return [...filtered, path];
      }
    });
  };

  const nodeRefs = React.useRef({}); // { path: HTMLElement }

  const updateCoords = React.useCallback(() => {
    const newCoords = {};
    const parentRect = containerRef.current?.getBoundingClientRect();
    if (!parentRect) return;

    Object.entries(nodeRefs.current).forEach(([path, el]) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      newCoords[path] = {
        x: rect.left - parentRect.left + containerRef.current.scrollLeft,
        y: rect.top - parentRect.top + containerRef.current.scrollTop,
        w: rect.width,
        h: rect.height
      };
    });
    setCoords(newCoords);
  }, []);

  React.useEffect(() => {
    updateCoords();
    const interval = setInterval(updateCoords, 300);
    window.addEventListener('resize', updateCoords);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', updateCoords);
    };
  }, [updateCoords, expandedPaths, data]);

  const renderLevel = (nodes, level = 0, parentPath = 'root') => {
    if (!nodes || nodes.length === 0) return null;
    const sorted = [...nodes].sort((a,b) => (b.value||0) - (a.value||0));
    
    return (
      <div className="flex flex-col gap-4 min-w-[220px] py-4 relative z-10">
        {sorted.map((node, i) => {
          const path = `${parentPath}|${node.name}`;
          const isExpanded = expandedPaths.includes(path);
          const hasChildren = node.children && node.children.length > 0;
          const share = (node.value / totalValue) * 100;

          return (
            <React.Fragment key={path}>
              <div 
                ref={el => nodeRefs.current[path] = el}
                className={`p-3 rounded-xl border t-border transition-all duration-300 flex flex-col gap-2 relative group overflow-hidden min-h-[70px] ${isExpanded ? 'bg-[var(--theme-accent)]/5 border-[var(--theme-accent)] shadow-lg' : 'bg-white hover:shadow-md'}`}
              >
                <div className="absolute left-0 bottom-0 h-1 bg-[var(--theme-accent)] opacity-20" style={{ width: `${share}%` }} />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-black t-text-muted uppercase tracking-wider break-words line-clamp-2" title={node.name}>{node.name}</span>
                  {hasChildren && (
                    <button 
                      onClick={() => toggleNode(path)}
                      className={`w-5 h-5 rounded-full flex items-center justify-center border t-border transition-all ${isExpanded ? 't-accent-bg text-white border-transparent' : 'bg-black/5 t-text-muted hover:t-accent'}`}
                    >
                      {isExpanded ? <Trash2 size={10} className="rotate-45"/> : <Plus size={10}/>}
                    </button>
                  )}
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-black t-text-main">{formatMeasVal(node.value, measureId)}</span>
                  <span className="text-[9px] font-bold t-text-muted opacity-60">{share.toFixed(1)}%</span>
                </div>
              </div>
              {isExpanded && hasChildren && (
                <div className="flex absolute left-full top-0 h-full pl-24">
                   {renderLevel(node.children, level + 1, path)}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div 
        className="w-full h-full relative p-4 overflow-auto flex items-start bg-[var(--theme-panel-bg)] [transform:rotateX(180deg)]" 
        ref={containerRef}
        style={{ scrollbarWidth: 'thin' }}
    >
      <div className="[transform:rotateX(180deg)] w-full h-full min-h-full">
        {/* SVG Layer for connectors */}
        <svg className="absolute inset-0 pointer-events-none z-0 w-full h-full min-w-[4000px] min-h-[3000px]">
          {Object.entries(coords).map(([path, start]) => {
            const children = Object.entries(coords).filter(([p]) => {
              const pParts = p.split('|');
              const targetParts = path.split('|');
              return p.startsWith(path + '|') && pParts.length === targetParts.length + 1;
            });
            
            return children.map(([childPath, end]) => {
              const x1 = start.x + start.w;
              const y1 = start.y + (start.h / 2);
              const x2 = end.x;
              const y2 = end.y + (end.h / 2);
              const cp1x = x1 + (x2 - x1) * 0.5;
              const cp2x = x2 - (x2 - x1) * 0.5;
              
              return (
                <path 
                  key={`${path}->${childPath}`}
                  d={`M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--theme-accent)"
                  strokeWidth="2"
                  opacity="0.25"
                  className="transition-all duration-300"
                />
              );
            });
          })}
        </svg>

        <div className="flex gap-24 relative z-10 transition-all duration-500 min-h-full items-start pt-16 pb-32 pr-32">
          {/* Root Node */}
          <div 
            ref={el => nodeRefs.current['root'] = el}
            className="p-5 rounded-2xl bg-white border t-border shadow-xl flex flex-col gap-3 min-w-[180px] relative z-20 overflow-hidden mt-4"
          >
          <div className="absolute inset-0 bg-[var(--theme-accent)] opacity-[0.03] pointer-events-none" />
          <div className="flex items-center gap-2 mb-1">
             <LayoutTemplate size={14} className="t-accent opacity-60" />
             <span className="text-[10px] font-black t-text-muted uppercase tracking-widest">Grand Total</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-black t-text-main tracking-tighter">{formatMeasVal(totalValue, measureId)}</span>
            <div className="h-1 bg-[var(--theme-accent)] w-full rounded-full mt-2 opacity-20" />
          </div>
          <div className="flex items-center gap-2 mt-1">
             <div className="w-2 h-2 rounded-full t-accent-bg animate-pulse" />
             <span className="text-[9px] font-black t-accent uppercase tracking-wider">Root Engine</span>
          </div>
        </div>

        {/* Dynamic Branches */}
        {renderLevel(data)}
      </div>
    </div>
  </div>
);
};


const ChartWidget = React.memo(({ chart, isExploreMode = false, toggleGlobalFilter, handlePinChart, isViewer = false }) => {
  const { 
    semanticModels, 
    theme, 
    activePageId, 
    setDashboards, 
    setBuilderForm, 
    initBuilderForm, 
    setShowBuilder,
    globalFilters, 
    drillThroughState,
    triggerDrillThrough,
    pages,
    joinGroupIds,
    fontScale, 
    textWrap
  } = useAppState();
  
  const { getAggregatedData, getPivotData, getTableData, getScatterData, getMatrixData, getHierarchicalData, datesReady } = useChartData();

  const [chartData, setChartData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const [matrixRawRow, setMatrixRawRow] = React.useState(null);
  const [matrixLoading, setMatrixLoading] = React.useState(false);
  const [matrixColLabels, setMatrixColLabels] = React.useState({}); 
  const [matrixRowHeader, setMatrixRowHeader] = React.useState('Measure'); 
  const [expandedCategories, setExpandedCategories] = React.useState({}); 

  const handleChartClick = React.useCallback((dimKey, dimValue, extraContext = {}) => {
      if (isExploreMode || !dimKey) return;
      
      const targetPageId = chart.drillThroughTargetPageId;
      const targetPage = pages.find(p => p.id === targetPageId);

      if (targetPage && targetPage.isDrillThrough) {
          const contextFilters = { ...globalFilters, ...extraContext };
          if (dimValue !== undefined && dimValue !== null) {
              contextFilters[dimKey] = [String(dimValue)];
          }
          
          // Collect all current authored filters from the source page/visual context
          const inheritedAuthoredFilters = [
              ...(authoredReportFilters || []),
              ...(pageFilters[activePageId] || []),
              ...(chart.filters || [])
          ];

          triggerDrillThrough(targetPageId, contextFilters, inheritedAuthoredFilters);
      } else {
          if (toggleGlobalFilter) toggleGlobalFilter(dimKey, dimValue);
      }
  }, [isExploreMode, chart.drillThroughTargetPageId, pages, globalFilters, triggerDrillThrough, toggleGlobalFilter]);

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
    return '200px'; 
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

  const chartDependencyReady = datesReady;

  React.useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      if (!chart.datasetId || !chartDependencyReady) return;
      
      setLoading(true);
      const overrideFilters = drillThroughState.active ? (drillThroughState.filters || {}) : null;
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
          res = await getTableData(chart, overrideFilters);
        } else if (chart.type === 'pivot') {
          res = await getPivotData(chart, overrideFilters);
        } else if (chart.type === 'scatter') {
          res = await getScatterData(chart, overrideFilters);
        } else if (chart.type === 'matrix') {
          setLoading(false);
          return;
        } else if (chart.type === 'treemap' || chart.type === 'sunburst' || chart.type === 'decomptree') {
          res = await getHierarchicalData(chart, overrideFilters);
        } else {
          res = await getAggregatedData(chart, overrideFilters);
        }
        
        const count = Array.isArray(res) ? res.length : (res?.data?.length || res?.rows?.length || (res?.matrix ? Object.keys(res.matrix).length : 0));
        window.dispatchEvent(new CustomEvent('mvantage-debug', { detail: { type: 'success', category: 'Chart', message: `[${Date.now()}] Query finished for ${chart.title}: items=${count}` } }));
        
        const sanitizeArr = (arr) => {
           return arr.map(row => {
             const cleanRow = { ...row };
             Object.keys(cleanRow).forEach(k => {
                if (k !== 'name' && k !== 'children' && cleanRow[k] !== null && typeof cleanRow[k] !== 'number') {
                   const str = String(cleanRow[k]).replace(/^["']|["']$/g, '').replace(/\\"/g, '"').replace(/"/g, '');
                   const stripped = str.replace(/[^0-9.-]/g, '');
                   // Only cast to number if stripping leaves a non-empty numeric string.
                   // This prevents text values like "January" (stripped → "") from becoming 0.
                   const num = Number(stripped);
                   if (stripped !== '' && !isNaN(num)) cleanRow[k] = num;
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
        } else if (res?.rows) {
           res.rows = sanitizeArr(res.rows);
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
  }, [chart, globalFilters, drillThroughState, chartDependencyReady, getAggregatedData, getPivotData, getTableData, getScatterData, getHierarchicalData]);

  React.useEffect(() => {
    if (chart.type !== 'matrix' || !datesReady) return;
    let active = true;
    setMatrixLoading(true);
    const overrideFilters = drillThroughState.active ? (drillThroughState.filters || {}) : null;
    getMatrixData(chart, overrideFilters).then(row => {
      if (active) {
        setMatrixRawRow(row);
        setMatrixLoading(false);
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
  }, [chart, globalFilters, drillThroughState, datesReady, getMatrixData]);

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
                                val = totals?.[id] !== undefined ? totals[id] : rows.reduce((s, r) => s + (Number(r[id]) || 0), 0);
                            } else {
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
                              const dimProps = !isMeasure ? {
                                  onClick: () => handleChartClick(getOriginKey(chart.datasetId, id), val),
                                  style: { border: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer' },
                                  className: `px-3 py-2 align-top t-text-muted hover:underline`
                              } : {
                                  style: { border: '1px solid rgba(0,0,0,0.05)' },
                                  className: `px-3 py-2 align-top font-medium t-text-main text-right`
                              };
                              return (
                                  <td key={j} {...dimProps}>
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
                                <td key={idx} className="px-3 py-1.5 font-bold t-text-main whitespace-nowrap cursor-pointer hover:underline" onClick={() => handleChartClick(getOriginKey(chart.datasetId, chart.pivotRows[idx]), rv)} style={{ border: '1px solid rgba(0,0,0,0.05)' }}>{formatDimVal(rv, chart.pivotRows[idx])}</td>
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
                                    <td 
                                        key={ck} 
                                        className="px-3 py-1.5 t-text-muted text-right cursor-pointer hover:bg-black/5" 
                                        onClick={() => {
                                            const context = {};
                                            const rParts = rk.split(' | ');
                                            (chart.pivotRows || []).forEach((dimId, ridx) => context[getOriginKey(chart.datasetId, dimId)] = [rParts[ridx]]);
                                            const cParts = ck.split(' | ');
                                            (chart.pivotCols || []).forEach((dimId, cidx) => context[getOriginKey(chart.datasetId, dimId)] = [cParts[cidx]]);
                                            handleChartClick(getOriginKey(chart.datasetId, chart.pivotRows[0]), rParts[0], context);
                                        }}
                                        style={{ border: '1px solid rgba(0,0,0,0.05)' }}
                                    >
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
                  {chart.legend && <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} formatter={(v) => <span style={{ color: 'var(--theme-text-main)' }}>{v}</span>} />}
                  <Scatter name="Bubbles" data={scatterData} onClick={(d) => handleChartClick(dimOriginKey, d.name)} className={isExploreMode ? "" : "cursor-pointer transition-all duration-300"}>
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

      const { data, legendKeys } = chartData;
      const dimOriginKey = getOriginKey(chart.datasetId, chart.dimension);
      const activeFilterVal = globalFilters[dimOriginKey] || [];
      
      if (chart.type === 'sunburst') {
          return (
              <SunburstChart 
                 data={Array.isArray(chartData) ? chartData : (chartData?.data || [])}
                 colors={tColors}
                 formatMeasVal={formatMeasVal}
                 measureId={chart.measure}
                 onSegmentClick={(seg) => {
                    const context = {};
                    (chart.treeDimensions || []).forEach((dimId, idx) => {
                        if (seg.path[idx]) context[getOriginKey(chart.datasetId, dimId)] = [String(seg.path[idx])];
                    });
                    handleChartClick(getOriginKey(chart.datasetId, chart.treeDimensions[seg.level]), seg.name, context);
                 }}
              />
          );
      }

      if (chart.type === 'decomptree') {
          return (
              <DecompositionTree 
                 data={Array.isArray(chartData) ? chartData : (chartData?.data || [])}
                 colors={tColors}
                 formatMeasVal={formatMeasVal}
                 measureId={chart.measure}
                 onNodeClick={(node) => {
                    const context = {};
                    node.path.forEach((p, idx) => {
                        if (chart.treeDimensions[idx]) context[getOriginKey(chart.datasetId, chart.treeDimensions[idx])] = [String(p)];
                    });
                    handleChartClick(getOriginKey(chart.datasetId, chart.treeDimensions[node.level]), node.name, context);
                 }}
              />
          );
      }

      return (
         <ResponsiveContainer width="100%" height="100%">
           {chart.type === 'bar' ? (
             <BarChart data={data} margin={{ top: 45, right: 20, left: 10, bottom: 20 }}>
               <XAxis dataKey="name" tick={chart.showXAxisLabels === false ? false : <WrappedTick textWrap={tWrap} fontSize={10} fill="var(--theme-text-muted)" />} axisLine={false} tickLine={false} tickFormatter={(v) => formatDimVal(v, chart.dimension)} />
               <YAxis domain={[0, (max) => max * 1.25]} tick={chart.showYAxisLabels === false ? false : {fill: 'var(--theme-text-muted)', fontSize: 10}} width={chart.showYAxisLabels === false ? 10 : 65} axisLine={false} tickLine={false} tickFormatter={(v) => formatMeasVal(v, chart.measure, true)} />
               <RechartsTooltip cursor={{fill: 'var(--theme-border)', opacity: 0.5}} contentStyle={{ borderRadius: 'var(--theme-radius-panel)', border: 'none', boxShadow: 'var(--theme-shadow)', background: 'var(--theme-panel-bg)', color: 'var(--theme-text-main)' }} labelFormatter={(v) => formatDimVal(v, chart.dimension)} formatter={(val, name) => [formatMeasVal(val, chart.measure), chart.legend ? name : (getDisplayLabel(chart.measure) || 'Value')]} />
               {chart.legend && <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} formatter={(v) => <span style={{ color: 'var(--theme-text-main)' }}>{v}</span>} />}
               {legendKeys.map((k, i) => (
                  <Bar key={k} dataKey={k} name={k === 'value' ? (getDisplayLabel(chart.measure) || 'Value') : k} fill={tColors[i % tColors.length]} onClick={(d) => handleChartClick(dimOriginKey, d.name)} className={isExploreMode ? "" : "cursor-pointer transition-all duration-300"}>
                    {data.map((e, idx) => <Cell key={idx} opacity={!isExploreMode && activeFilterVal.length > 0 && !activeFilterVal.includes(String(e.name)) ? 0.3 : 1} />)}
                    {chart.showDataLabels && <LabelList dataKey={k} position="top" fill="var(--theme-text-muted)" fontSize={10} fontWeight="normal" formatter={(v) => formatMeasVal(v, chart.measure, true)} content={(props) => <WrappedLabel {...props} value={formatMeasVal(props.value, chart.measure, true)} fill="var(--theme-text-muted)" fontWeight="normal" textWrap={textWrap} disableHalo={false} topLabel={true} />} />}
                  </Bar>
               ))}
             </BarChart>
           ) : chart.type === 'pie' ? (
             <RechartsPieChart>
               <RechartsTooltip contentStyle={{ borderRadius: 'var(--theme-radius-panel)', border: 'none', boxShadow: 'var(--theme-shadow)', background: 'var(--theme-panel-bg)', color: 'var(--theme-text-main)' }} formatter={(v, n) => [formatMeasVal(v, chart.measure), formatDimVal(n, chart.dimension)]} />
               <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" onClick={(d) => handleChartClick(dimOriginKey, d.name)} className={isExploreMode ? "" : "cursor-pointer"} label={chart.showDataLabels ? (props) => <text x={props.x} y={props.y} fill="var(--theme-text-muted)" fontSize={10} fontWeight="normal" textAnchor={props.textAnchor} dominantBaseline="central">{`${formatDimVal(props.name, chart.dimension)}: ${formatMeasVal(props.value, chart.measure, true)} (${(props.percent * 100).toFixed(0)}%)`}</text> : false} labelLine={false}>
                 {data.map((e, i) => <Cell key={i} fill={tColors[i % tColors.length]} opacity={!isExploreMode && activeFilterVal.length > 0 && !activeFilterVal.includes(String(e.name)) ? 0.3 : 1} style={{ outline: 'none' }} />)}
               </Pie>
               <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} formatter={(v) => <span style={{ color: 'var(--theme-text-main)' }}>{v}</span>} />
             </RechartsPieChart>
           ) : chart.type === 'treemap' ? (
            <Treemap
                data={Array.isArray(chartData) ? chartData : (chartData?.data || [])}
                dataKey="value"
                stroke="var(--theme-panel-bg)"
                paddingInner={2}
                aspectRatio={4/3}
                content={(props) => {
                   const { depth, x, y, width, height, name, value, rootIndex, children, index } = props;
                   if (width < 3 || height < 3) return null;
                   
                   const colorIdx = rootIndex !== undefined ? rootIndex : index;
                   const baseColor = tColors[Math.max(0, colorIdx) % tColors.length] || tColors[0];
                   
                   if (depth === 1) {
                     return (
                       <g>
                         <rect 
                           x={x} y={y} width={width} height={height} 
                           fill={baseColor} 
                           opacity={0.1}
                           stroke={baseColor} 
                           strokeWidth={2}
                         />
                         {width > 20 && height > 20 && (
                           <rect x={x} y={y} width={width} height={26} fill={baseColor} />
                         )}
                         {width > 20 && height > 20 && (
                           <text x={x + 10} y={y + 17} fill="#fff" fontSize={11} fontWeight="900" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                             {name}
                           </text>
                         )}
                       </g>
                     );
                   }

                   const isLeaf = !children || children.length === 0;
                   if (!isLeaf) return null;
                   
                   const fill = baseColor;
                   const labelColor = getContrastYIQ(fill);
                   
                   return (
                      <g className="transition-all duration-300 hover:brightness-110 cursor-pointer" onClick={() => {
                          const context = {};
                          (chart.treeDimensions || []).forEach((dimId, idx) => {
                             if (props.path && props.path[idx]) context[getOriginKey(chart.datasetId, dimId)] = [String(props.path[idx])];
                          });
                          handleChartClick(getOriginKey(chart.datasetId, chart.treeDimensions[depth - 1]), name, context);
                       }}>
                         <rect 
                           x={x} y={y} width={width} height={height} 
                           fill={fill} 
                           stroke="var(--theme-panel-bg)" 
                           strokeWidth={1.5}
                           style={{ fillOpacity: 1 }}
                         />
                         {width > 30 && height > 20 && (
                            <foreignObject x={x} y={y} width={width} height={height} style={{ pointerEvents: 'none' }}>
                               <div className="p-2 h-full w-full overflow-hidden flex flex-col justify-center">
                                  <div style={{ 
                                     color: labelColor, 
                                     fontFamily: 'var(--theme-font, inherit)',
                                     fontSize: '11px',
                                     lineHeight: '1.2',
                                     display: 'flex',
                                     flexDirection: 'column',
                                     gap: '2px'
                                  }}>
                                     <div style={{ fontWeight: '900', opacity: 0.9, textTransform: 'uppercase', fontSize: '10px' }}>{name}</div>
                                     <div style={{ fontWeight: '500', opacity: 1, fontSize: '12px' }}>{formatMeasVal(value, chart.measure, false)}</div>
                                  </div>
                               </div>
                            </foreignObject>
                         )}
                      </g>
                   );
                }}
            >
               <RechartsTooltip contentStyle={{ borderRadius: 'var(--theme-radius-panel)', border: 'none', boxShadow: 'var(--theme-shadow)', background: 'var(--theme-panel-bg)', color: 'var(--theme-text-main)' }} formatter={(v, n) => [formatMeasVal(v, chart.measure), n]} />
            </Treemap>
          ) : (
            <LineChart data={data} margin={{ top: 45, right: 20, left: 10, bottom: 20 }}>
              <XAxis dataKey="name" tick={chart.showXAxisLabels === false ? false : <WrappedTick textWrap={tWrap} fontSize={10} fill="var(--theme-text-muted)" />} axisLine={false} tickLine={false} tickFormatter={(v) => formatDimVal(v, chart.dimension)} />
              <YAxis domain={[0, (max) => max * 1.25]} tick={chart.showYAxisLabels === false ? false : {fill: 'var(--theme-text-muted)', fontSize: 10}} width={chart.showYAxisLabels === false ? 10 : 65} axisLine={false} tickLine={false} tickFormatter={(v) => formatMeasVal(v, chart.measure, true)} />
              <RechartsTooltip contentStyle={{ borderRadius: 'var(--theme-radius-panel)', border: 'none', boxShadow: 'var(--theme-shadow)', background: 'var(--theme-panel-bg)', color: 'var(--theme-text-main)' }} labelFormatter={(v) => formatDimVal(v, chart.dimension)} formatter={(val, name) => [formatMeasVal(val, chart.measure), chart.legend ? name : (getDisplayLabel(chart.measure) || 'Value')]} />
              {chart.legend && <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} formatter={(v) => <span style={{ color: 'var(--theme-text-main)' }}>{v}</span>} />}
               {legendKeys.map((k, i) => (
                 <Line key={k} type="linear" name={k === 'value' ? (getDisplayLabel(chart.measure) || 'Value') : k} dataKey={k} stroke={tColors[i % tColors.length]} strokeWidth={1.5} dot={{ r: 3, fill: tColors[i % tColors.length], strokeWidth: 0 }} activeDot={{ r: 5, onClick: (e, p) => handleChartClick(dimOriginKey, p.payload.name) }} className={isExploreMode ? "" : "cursor-pointer"}>
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
  }, [chart, chartData, loading, globalFilters, semanticModel, tColors, getAggregatedData, getPivotData, getTableData, getScatterData, getHierarchicalData, getOriginKey, formatMeasVal, formatDimVal, isExploreMode, handleChartClick, pages, drillThroughState]);

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
      <div key={chart.id + (matrixLoading ? '_l' : '_d')} className={`${isExploreMode ? 'bg-black/5 w-full mt-2' : 't-panel'} shadow-sm border t-border flex flex-col hover:shadow-md transition-all duration-300 ${
        !isExploreMode ? (chart.size === 'full' ? 'md:col-span-6' : (chart.size === 'third' ? 'md:col-span-2' : 'md:col-span-3')) : ''
      } overflow-hidden chart-enter`} style={{ borderRadius: 'var(--theme-radius-panel)' }}>

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
         <div key={chart.id} className={`${isExploreMode ? 'bg-black/5 w-full mt-2' : 't-panel'} shadow-sm border t-border flex flex-col hover:shadow-md transition-all duration-300 ${!isExploreMode ? (chart.size === 'full' ? 'md:col-span-6' : (chart.size === 'third' ? 'md:col-span-2' : 'md:col-span-3')) : ''} overflow-hidden chart-enter`} style={{ borderRadius: 'var(--theme-radius-panel)' }}>
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
         <div key={loading ? 'loading' : 'content'} className={!loading ? "w-full h-full chart-enter" : "w-full h-full flex items-center justify-center"}>
            {content}
         </div>
      </div>
    </div>
  );
});

export default ChartWidget;
