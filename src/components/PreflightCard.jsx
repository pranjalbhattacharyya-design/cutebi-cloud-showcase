import React, { useState, useEffect } from 'react';

const PreflightCard = ({ preflightData, onConfirm, datasetId }) => {
  const [selectedFacts, setSelectedFacts] = useState(preflightData.facts || []);
  const [selectedDims, setSelectedDims] = useState({});
  const [timeGrain, setTimeGrain] = useState(preflightData.time_dim || "All");
  const [locationCount, setLocationCount] = useState(preflightData.location_count || 1000);
  const [loadingLocation, setLoadingLocation] = useState(false);

  // Initialize selected dims
  useEffect(() => {
    if (preflightData.analytical_dims) {
      const initialDims = {};
      preflightData.analytical_dims.forEach(dim => {
        initialDims[dim.id] = [...(dim.values || [])];
      });
      setSelectedDims(initialDims);
    }
  }, [preflightData]);

  const toggleFact = (fact) => {
    setSelectedFacts(prev => 
      prev.includes(fact) ? prev.filter(f => f !== fact) : [...prev, fact]
    );
  };

  const toggleDimValue = (dimId, val) => {
    setSelectedDims(prev => {
      const current = prev[dimId] || [];
      const updated = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
      return { ...prev, [dimId]: updated };
    });
  };

  // Dynamic cost calculation
  const nTimeCols = 1; // Assuming 1 chosen time grain period or all periods combined. If "All", maybe count all periods? 
                       // Actually the stats say nTimeCols = time_values length if all. Let's use 12 for estimation or actual.
  const timePeriods = Array.isArray(preflightData.time_values) ? preflightData.time_values.length : 12;
  const nColsPerCall = timePeriods + 3; // + location, area, zone

  let combinationsCount = 1;
  Object.keys(selectedDims).forEach(dimId => {
    const len = selectedDims[dimId].length;
    if (len > 0) {
      combinationsCount *= len;
    }
  });
  
  if (Object.keys(selectedDims).length === 0) {
    combinationsCount = 1; // 1 fallback run
  }

  const nFacts = selectedFacts.length || 1;
  const totalRuns = combinationsCount * nFacts;
  const cellsPerRun = locationCount * nColsPerCall;
  const totalCells = totalRuns * cellsPerRun;

  const nWaves = Math.ceil(totalRuns / 20);
  const estTimeSecs = (nWaves * 10) + 5 + 20;

  const tokensPerCallIn = (cellsPerRun * 0.6) + 2000;
  const costUsd = (totalRuns * ((tokensPerCallIn * 0.075 + 500 * 0.30) / 1000000)) + 0.015;
  const costInr = (costUsd * 87).toFixed(2);

  const handleGoAhead = () => {
    const selected_analytical_dims = Object.keys(selectedDims).map(id => ({
      dim_id: id,
      selected_values: selectedDims[id]
    }));
    
    // We pass back the selected scope
    onConfirm({
      selected_facts: selectedFacts,
      selected_analytical_dims: selected_analytical_dims,
      selected_time_grain: timeGrain,
    });
  };

  return (
    <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700 max-w-2xl text-slate-200 font-sans text-sm mt-4">
      <div className="flex items-center gap-3 mb-4 border-b border-slate-700 pb-3">
        <span className="text-2xl">🔬</span>
        <h3 className="text-lg font-semibold text-white">Deep Dive Pre-Flight</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-900/50 p-4 rounded-lg">
          <h4 className="text-xs uppercase text-slate-400 font-semibold mb-2">Scope</h4>
          <div className="space-y-1">
            <div className="flex justify-between"><span>Locations:</span> <span className="font-medium text-white">{loadingLocation ? '...' : locationCount}</span></div>
            <div className="flex justify-between"><span>Areas:</span> <span className="font-medium text-white">{preflightData.area_count}</span></div>
            <div className="flex justify-between"><span>Zones:</span> <span className="font-medium text-white">{preflightData.zone_count}</span></div>
          </div>
        </div>

        <div className="bg-slate-900/50 p-4 rounded-lg">
          <h4 className="text-xs uppercase text-slate-400 font-semibold mb-2">Analysis Scale</h4>
          <div className="space-y-1">
            <div className="flex justify-between"><span>AI Runs:</span> <span className="font-medium text-blue-400">{totalRuns} parallel</span></div>
            <div className="flex justify-between"><span>Data Cells:</span> <span className="font-medium text-white">~{(totalCells).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Duration:</span> <span className="font-medium text-amber-400">~{estTimeSecs}s</span></div>
            <div className="flex justify-between"><span>Est. Cost:</span> <span className="font-bold text-emerald-400">₹{costInr}</span></div>
          </div>
        </div>
      </div>

      <div className="mb-6 space-y-4">
        <div>
          <h4 className="text-xs uppercase text-slate-400 font-semibold mb-2">Facts / Measures <span className="text-[10px] text-slate-500 normal-case">(Toggle to include)</span></h4>
          <div className="flex flex-wrap gap-2">
            {(preflightData.facts || []).map(fact => (
              <label key={fact} className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-md cursor-pointer hover:bg-slate-700 transition">
                <input 
                  type="checkbox" 
                  checked={selectedFacts.includes(fact)} 
                  onChange={() => toggleFact(fact)}
                  className="rounded bg-slate-800 border-slate-600 text-blue-500 focus:ring-blue-500/20"
                />
                <span className={selectedFacts.includes(fact) ? "text-slate-200" : "text-slate-500"}>{fact}</span>
              </label>
            ))}
          </div>
        </div>

        {(preflightData.analytical_dims || []).map(dim => (
          <div key={dim.id}>
            <h4 className="text-xs uppercase text-slate-400 font-semibold mb-2">{dim.label || dim.id} <span className="text-[10px] text-slate-500 normal-case">({(selectedDims[dim.id] || []).length} / {dim.count} total)</span></h4>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2 pb-1 custom-scrollbar">
              {(dim.values || []).map(val => (
                <label key={val} className={"flex items-center gap-1.5 px-2.5 py-1 rounded text-xs cursor-pointer transition " + ((selectedDims[dim.id] || []).includes(val) ? "bg-blue-600/20 text-blue-200 border border-blue-500/30" : "bg-slate-800 text-slate-500 border border-slate-700 hover:border-slate-600")}>
                  <input 
                    type="checkbox" 
                    checked={(selectedDims[dim.id] || []).includes(val)} 
                    onChange={() => toggleDimValue(dim.id, val)}
                    className="sr-only" // hidden but functional
                  />
                  <span>{val}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-slate-700 flex justify-end gap-3 mt-4">
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
