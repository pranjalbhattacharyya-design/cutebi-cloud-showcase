import React from 'react';
import { Type, WrapText, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useAppState } from '../../contexts/AppStateContext';

export default function TypographySettings() {
  const { fontScale, setFontScale, textWrap, setTextWrap } = useAppState();

  const handleReset = () => {
    setFontScale(1.0);
    setTextWrap(false);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
          <Type size={12} className="text-indigo-400" />
          Typography Engine
        </div>
        <button 
          onClick={handleReset}
          className="p-1 t-text-muted hover:t-accent transition-all"
          title="Reset to Factory Defaults"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* Font Scale Slider */}
      <div className="space-y-3">
        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
          <span className="flex items-center gap-1.5"><ZoomOut size={10} /> Base Scale</span>
          <span className="t-accent font-black bg-indigo-500/10 px-1.5 py-0.5 rounded leading-none">{fontScale.toFixed(2)}x</span>
        </div>
        <div className="relative flex items-center group">
          <input 
            type="range" 
            min="0.8" 
            max="1.3" 
            step="0.05" 
            value={fontScale}
            onChange={(e) => setFontScale(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
          />
        </div>
        <div className="flex justify-between text-[8px] font-black text-slate-600 uppercase tracking-tighter">
          <span>Enterprise (0.8x)</span>
          <span>Max (1.3x)</span>
        </div>
      </div>

      {/* Text Wrap Toggle */}
      <div className="flex items-center justify-between py-2 border-t border-white/5">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-slate-300 flex items-center gap-1.5">
            <WrapText size={12} className="text-emerald-400" />
            Chart Native Wrapping
          </span>
          <span className="text-[8px] text-slate-500 mt-0.5 leading-tight">Force SVG/Canvas multi-line headers</span>
        </div>
        <button 
          onClick={() => setTextWrap(!textWrap)}
          className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${textWrap ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-slate-700'}`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${textWrap ? 'translate-x-[22px]' : 'translate-x-[4px]'}`}
          />
        </button>
      </div>

      <div className="p-2 bg-indigo-500/5 rounded-lg border border-indigo-500/10">
        <p className="text-[9px] text-indigo-300/70 italic leading-snug">
          <b>Note:</b> KPI values are capped at 1.1x to prevent card breakage.
        </p>
      </div>
    </div>
  );
}
