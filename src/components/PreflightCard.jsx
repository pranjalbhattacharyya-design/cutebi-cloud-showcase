import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';

const PreflightCard = ({ preflightData, onConfirm, datasetId, cteSql }) => {
  const [selectedFacts, setSelectedFacts]     = useState(preflightData.facts || []);
  const [selectedDims, setSelectedDims]       = useState({});
  const [selectedZones, setSelectedZones]     = useState([]);
  const [selectedAreas, setSelectedAreas]     = useState([]);
  const [availableAreas, setAvailableAreas]   = useState(preflightData.area_values || []);
  const [locationCount, setLocationCount]     = useState(preflightData.location_count || 0);
  const [recalcDirty, setRecalcDirty]         = useState(false);
  const [recalcLoading, setRecalcLoading]     = useState(false);

  // Initialize all dims fully selected
  useEffect(() => {
    if (preflightData.analytical_dims) {
      const init = {};
      preflightData.analytical_dims.forEach(dim => {
        init[dim.id] = [...(dim.values || [])];
      });
      setSelectedDims(init);
    }
  }, [preflightData]);

  const toggleFact = (f) =>
    setSelectedFacts(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);

  const toggleDimValue = (dimId, val) => {
    setSelectedDims(prev => {
      const cur = prev[dimId] || [];
      return { ...prev, [dimId]: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val] };
    });
    setRecalcDirty(true);
  };

  const toggleZone = (z) => {
    setSelectedZones(prev => prev.includes(z) ? prev.filter(x => x !== z) : [...prev, z]);
    setSelectedAreas([]); // reset areas when zones change
    setRecalcDirty(true);
  };

  const toggleArea = (a) => {
    setSelectedAreas(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
    setRecalcDirty(true);
  };

  // ── Recalculate: re-run preflight-filter with selected geo filters ──────────
  const handleRecalculate = useCallback(async () => {
    setRecalcLoading(true);
    setRecalcDirty(false);
    try {
      const res = await apiClient.aiDeepDivePreflightFilter({
        dataset_id:       datasetId,
        micro_dim:        preflightData.micro_dim,
        meso_dim:         preflightData.meso_dim,
        macro_dim:        preflightData.macro_dim,
        geo_filter_zones: selectedZones.length ? selectedZones : [],
        geo_filter_areas: selectedAreas.length ? selectedAreas : [],
        cte_sql:          cteSql || '',
      });
      if (res.location_count !== undefined) setLocationCount(res.location_count);
      if (res.area_values)                  setAvailableAreas(res.area_values);
    } catch (e) {
      console.error('Recalculate failed:', e);
    } finally {
      setRecalcLoading(false);
    }
  }, [datasetId, preflightData, selectedZones, selectedAreas, cteSql]);

  // ── Cost estimation ─────────────────────────────────────────────────────────
  const timePeriods = Array.isArray(preflightData.time_values) ? preflightData.time_values.length : 12;
  const nColsPerCall = timePeriods + 3;

  let combinations = 1;
  Object.keys(selectedDims).forEach(id => {
    const len = selectedDims[id].length;
    if (len > 0) combinations *= len;
  });
  if (Object.keys(selectedDims).length === 0) combinations = 1;

  const nFacts      = selectedFacts.length || 1;
  const totalRuns   = combinations * nFacts;
  const totalCells  = totalRuns * locationCount * nColsPerCall;
  const nWaves      = Math.ceil(totalRuns / 20);
  const estSecs     = (nWaves * 10) + 25;
  const costUsd     = (totalRuns * (((locationCount * nColsPerCall * 0.6 + 2000) * 0.075 + 500 * 0.30) / 1000000)) + 0.015;
  const costInr     = (costUsd * 87).toFixed(2);

  // ── Confirm ─────────────────────────────────────────────────────────────────
  const handleGoAhead = () => {
    const selected_analytical_dims = Object.keys(selectedDims)
      .map(id => ({ dim_id: id, selected_values: selectedDims[id] }));
    onConfirm({
      selected_facts:          selectedFacts,
      selected_analytical_dims,
      selected_months:         preflightData.time_values || [],
      geo_filter_zones:        selectedZones,
      geo_filter_areas:        selectedAreas,
    });
  };

  const zoneValues = preflightData.zone_values || [];
  const areaDisplay = selectedZones.length ? availableAreas : (preflightData.area_values || []);

  return (
    <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700 max-w-2xl text-slate-200 font-sans text-sm mt-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 border-b border-slate-700 pb-3">
        <span className="text-2xl">🔬</span>
        <h3 className="text-lg font-semibold text-white">Deep Dive Pre-Flight</h3>
      </div>

      {/* Scope + Scale */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-slate-900/50 p-4 rounded-lg">
          <h4 className="text-xs uppercase text-slate-400 font-semibold mb-2">Scope</h4>
          <div className="space-y-1">
            <div className="flex justify-between"><span>Locations:</span><span className="font-medium text-white">{locationCount}</span></div>
            <div className="flex justify-between"><span>Areas:</span><span className="font-medium text-white">{selectedAreas.length || preflightData.area_count}</span></div>
            <div className="flex justify-between"><span>Zones:</span><span className="font-medium text-white">{selectedZones.length || preflightData.zone_count}</span></div>
          </div>
        </div>
        <div className="bg-slate-900/50 p-4 rounded-lg">
          <h4 className="text-xs uppercase text-slate-400 font-semibold mb-2">Analysis Scale</h4>
          <div className="space-y-1">
            <div className="flex justify-between"><span>AI Runs:</span><span className="font-medium text-blue-400">{totalRuns} parallel</span></div>
            <div className="flex justify-between"><span>Data Cells:</span><span className="font-medium text-white">~{totalCells.toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Duration:</span><span className="font-medium text-amber-400">~{estSecs}s</span></div>
            <div className="flex justify-between"><span>Est. Cost:</span><span className="font-bold text-emerald-400">₹{costInr}</span></div>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* Zone Filter */}
        {zoneValues.length > 0 && (
          <div>
            <h4 className="text-xs uppercase text-slate-400 font-semibold mb-2">
              Filter by Zone <span className="text-[10px] text-slate-500 normal-case">({selectedZones.length || 'All'} selected — leave blank for all)</span>
            </h4>
            <div className="flex flex-wrap gap-2">
              {zoneValues.map(z => (
                <label key={z} className={"flex items-center gap-1.5 px-3 py-1 rounded-full text-xs cursor-pointer transition border " +
                  (selectedZones.includes(z)
                    ? "bg-violet-600/20 text-violet-200 border-violet-500/40"
                    : "bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500")}>
                  <input type="checkbox" checked={selectedZones.includes(z)} onChange={() => toggleZone(z)} className="sr-only" />
                  {z}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Area Filter */}
        {areaDisplay.length > 0 && (
          <div>
            <h4 className="text-xs uppercase text-slate-400 font-semibold mb-2">
              Filter by Area <span className="text-[10px] text-slate-500 normal-case">({selectedAreas.length || 'All'} selected)</span>
            </h4>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto pr-1">
              {areaDisplay.map(a => (
                <label key={a} className={"flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer transition border " +
                  (selectedAreas.includes(a)
                    ? "bg-indigo-600/20 text-indigo-200 border-indigo-500/40"
                    : "bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500")}>
                  <input type="checkbox" checked={selectedAreas.includes(a)} onChange={() => toggleArea(a)} className="sr-only" />
                  {a}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Facts */}
        <div>
          <h4 className="text-xs uppercase text-slate-400 font-semibold mb-2">
            Facts / Measures <span className="text-[10px] text-slate-500 normal-case">(toggle to include)</span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {(preflightData.facts || []).map(fact => (
              <label key={fact} className={"flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer hover:bg-slate-700 transition border " +
                (selectedFacts.includes(fact)
                  ? "bg-emerald-700/20 border-emerald-500/30 text-emerald-200"
                  : "bg-slate-900 border-slate-700 text-slate-500")}>
                <input type="checkbox" checked={selectedFacts.includes(fact)} onChange={() => toggleFact(fact)} className="rounded bg-slate-800 border-slate-600" />
                <span>{fact}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Analytical Dims */}
        {(preflightData.analytical_dims || []).map(dim => (
          <div key={dim.id}>
            <h4 className="text-xs uppercase text-slate-400 font-semibold mb-2">
              {dim.label || dim.id} <span className="text-[10px] text-slate-500 normal-case">({(selectedDims[dim.id] || []).length} / {dim.count} selected)</span>
            </h4>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto pr-1">
              {(dim.values || []).map(val => (
                <label key={val} className={"flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer transition border " +
                  ((selectedDims[dim.id] || []).includes(val)
                    ? "bg-blue-600/20 text-blue-200 border-blue-500/30"
                    : "bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600")}>
                  <input type="checkbox" checked={(selectedDims[dim.id] || []).includes(val)} onChange={() => toggleDimValue(dim.id, val)} className="sr-only" />
                  <span>{val}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="pt-4 mt-4 border-t border-slate-700 flex items-center justify-between gap-3">
        <button
          onClick={handleRecalculate}
          disabled={recalcLoading}
          className={"px-4 py-2 rounded font-medium text-sm flex items-center gap-2 transition border " +
            (recalcDirty
              ? "bg-amber-600/20 border-amber-500/40 text-amber-300 hover:bg-amber-600/30"
              : "bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600")}
        >
          {recalcLoading ? '⏳ Recalculating...' : '🔄 Recalculate Scope'}
        </button>

        <button
          onClick={handleGoAhead}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded font-medium flex items-center gap-2 transition"
        >
          🚀 Go Ahead
        </button>
      </div>
    </div>
  );
};

export default PreflightCard;
