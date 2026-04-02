import React, { useState, useEffect } from 'react';

const DimensionTrendPicker = ({ dimensions, measures, onConfirm, onCancel }) => {
  // Find all analytical dimensions (excluding time, though we just give the user the full list if needed)
  const analyticalDims = dimensions.filter(d => !d.id.toLowerCase().includes("time") && !d.id.toLowerCase().includes("month") && !d.id.toLowerCase().includes("year"));
  const timeDims = dimensions.filter(d => d.id.toLowerCase().includes("time") || d.id.toLowerCase().includes("month") || d.id.toLowerCase().includes("year") || d.id.toLowerCase().includes("date"));
  
  // Also check measures for isTimeIntelligence
  const timeMeasures = measures.filter(m => m.isTimeIntelligence && m.timePeriod).map(m => ({ id: m.timePeriod, label: m.timePeriod }));
  const combinedTimeDims = [...timeDims];
  timeMeasures.forEach(tm => {
    if (!combinedTimeDims.find(td => td.id === tm.id)) {
      combinedTimeDims.push(tm);
    }
  });

  const [selectedDim, setSelectedDim] = useState(analyticalDims.length > 0 ? analyticalDims[0].id : (dimensions[0]?.id || ""));
  const [selectedTime, setSelectedTime] = useState(combinedTimeDims.length > 0 ? combinedTimeDims[0].id : "");

  return (
    <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700 max-w-sm text-slate-200 font-sans text-sm mt-4">
      <div className="flex items-center gap-3 mb-4 border-b border-slate-700 pb-3">
        <span className="text-2xl">⚡</span>
        <div>
          <h3 className="text-lg font-semibold text-white">Dimension Trend</h3>
          <p className="text-xs text-slate-400">Lightweight 15-second analysis.</p>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs uppercase text-slate-400 font-semibold mb-1">Dimension to Analyse</label>
          <select 
            value={selectedDim} 
            onChange={(e) => setSelectedDim(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            {analyticalDims.map(d => (
              <option key={d.id} value={d.id}>{d.label || d.id}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs uppercase text-slate-400 font-semibold mb-1">Time Grain</label>
          <select 
            value={selectedTime} 
            onChange={(e) => setSelectedTime(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            {combinedTimeDims.map(d => (
              <option key={d.id} value={d.id}>{d.label || d.id}</option>
            ))}
          </select>
        </div>
        
        <div className="bg-slate-900/50 p-3 rounded text-xs border border-slate-700">
          <div className="flex justify-between mb-1">
            <span className="text-slate-400">Fact metrics included:</span>
            <span className="text-white">All</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-slate-400">Estimated time:</span>
            <span className="text-amber-400">~15 seconds</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Estimated cost:</span>
            <span className="text-emerald-400">₹1.50</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {onCancel && (
          <button 
            onClick={onCancel}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded font-medium transition"
          >
            Cancel
          </button>
        )}
        <button 
          onClick={() => {
            if (selectedDim && selectedTime) {
              onConfirm({ dim: selectedDim, time: selectedTime });
            }
          }}
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-medium flex items-center justify-center gap-2 transition"
          disabled={!selectedDim || !selectedTime}
        >
          ⚡ Run Trend
        </button>
      </div>
    </div>
  );
};

export default DimensionTrendPicker;
