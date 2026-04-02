import React from 'react';

const DeepDiveProgress = ({ totalCalls, completedCalls, currentPhase, statusMessage }) => {
  const percent = totalCalls > 0 ? Math.min(100, Math.round((completedCalls / totalCalls) * 100)) : 0;
  
  return (
    <div className="bg-slate-800 rounded-xl p-5 shadow-lg border border-slate-700 max-w-2xl text-slate-200 mt-4">
      <div className="flex items-center gap-3 mb-4">
        {currentPhase === 'done' ? (
          <span className="text-2xl">✅</span>
        ) : (
          <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
        )}
        <h3 className="text-lg font-semibold text-white">
          {currentPhase === 'done' ? 'Deep Dive Complete' : 'Executing Deep Dive...'}
        </h3>
      </div>
      
      <div className="mb-2 flex justify-between text-xs text-slate-400 font-medium">
        <span>Micro-Analysis ({completedCalls}/{totalCalls} slices)</span>
        <span>{percent}%</span>
      </div>
      
      <div className="w-full bg-slate-900 rounded-full h-2.5 mb-4 border border-slate-700 overflow-hidden">
        <div 
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
          style={{ width: `${percent}%` }}
        ></div>
      </div>

      <div className="space-y-2 mt-4 text-sm bg-slate-900/50 p-3 rounded border border-slate-700/50">
        <div className={`flex items-center gap-2 ${currentPhase === 'micro' ? 'text-white font-medium' : 'text-slate-500'}`}>
          <span className="w-5">{currentPhase === 'micro' ? '⚡' : '✓'}</span> 
          <span>Parallel Micro-Analysis Map Phase</span>
        </div>
        <div className={`flex items-center gap-2 ${currentPhase === 'stitch' ? 'text-white font-medium' : (currentPhase === 'meso' || currentPhase === 'macro' || currentPhase === 'done' ? 'text-slate-500' : 'text-slate-600')}`}>
          <span className="w-5">{currentPhase === 'stitch' ? '⚡' : (currentPhase === 'meso' || currentPhase === 'macro' || currentPhase === 'done' ? '✓' : '○')}</span> 
          <span>Stitching Results</span>
        </div>
        <div className={`flex items-center gap-2 ${currentPhase === 'meso' ? 'text-white font-medium' : (currentPhase === 'macro' || currentPhase === 'done' ? 'text-slate-500' : 'text-slate-600')}`}>
          <span className="w-5">{currentPhase === 'meso' ? '⚡' : (currentPhase === 'macro' || currentPhase === 'done' ? '✓' : '○')}</span> 
          <span>Meso-Level Synthesis Reduce Phase</span>
        </div>
        <div className={`flex items-center gap-2 ${currentPhase === 'macro' ? 'text-white font-medium' : (currentPhase === 'done' ? 'text-slate-500' : 'text-slate-600')}`}>
          <span className="w-5">{currentPhase === 'macro' ? '⚡' : (currentPhase === 'done' ? '✓' : '○')}</span> 
          <span>Macro-Level Strategic Action Plan</span>
        </div>
      </div>
      
      {statusMessage && (
        <div className="mt-4 text-xs font-mono text-slate-400 border-t border-slate-700 pt-3">
          &gt; {statusMessage}
        </div>
      )}
    </div>
  );
};

export default DeepDiveProgress;
