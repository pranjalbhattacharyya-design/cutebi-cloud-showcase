import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

export function MultiSelect({ placeholder, options, value = [], onChange, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (val) => {
    if (value.includes(val)) {
      onChange(value.filter(v => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  const isAllSelected = options.length > 0 && value.length === options.length;

  const toggleAll = () => {
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange(options.map(o => o.value));
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        className={`flex items-center justify-between w-full bg-black/5 border t-border px-3 py-1.5 min-h-[32px] text-xs font-medium focus:outline-none cursor-pointer t-text-main hover:bg-black/10 transition-all ${className}`}
        style={{ borderRadius: 'var(--theme-radius-button)' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="truncate pr-2">
            {value.length === 0 ? <span className="t-text-muted opacity-70">{placeholder || 'Select...'}</span> : 
             value.length === options.length ? 'All selected ✅' : `${value.length} selected`}
        </div>
        <div className="flex gap-1 items-center shrink-0">
            {value.length > 0 && (
                 <button 
                   onClick={(e) => { e.stopPropagation(); onChange([]); }} 
                   className="p-0.5 t-text-muted hover:text-red-500 rounded-full hover:bg-black/5 transition-all text-xs font-bold"
                 >
                    Clear
                 </button>
            )}
            <ChevronDown size={14} className={`t-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>
      
      {isOpen && (
        <div className="absolute top-full left-0 z-50 w-full mt-1 t-panel border t-border shadow-2xl max-h-60 overflow-y-auto" style={{ borderRadius: 'var(--theme-radius-panel)' }}>
          {options.length > 0 && (
             <div onClick={toggleAll} className="flex items-center gap-2 px-4 py-2.5 border-b t-border hover:bg-black/5 cursor-pointer group">
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isAllSelected ? 'bg-[var(--theme-accent)] border-[var(--theme-accent)]' : 'border-gray-300'}`}>
                   {isAllSelected && <Check size={10} className="text-white" />}
                </div>
                <span className="text-sm font-bold t-text-main opacity-80">(Select All)</span>
             </div>
          )}
          {options.map(opt => {
              const checked = value.includes(opt.value);
              return (
                <div key={opt.value} onClick={() => toggleOption(opt.value)} className="flex items-center gap-2 px-4 py-2.5 hover:bg-black/5 cursor-pointer group">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${checked ? 'bg-[var(--theme-accent)] border-[var(--theme-accent)]' : 'border-gray-300'}`}>
                       {checked && <Check size={10} className="text-white" />}
                    </div>
                    <span className="text-sm t-text-main truncate">{opt.label || opt.value}</span>
                </div>
              );
          })}
          {options.length === 0 && <div className="p-4 text-xs t-text-muted text-center italic">No options available</div>}
        </div>
      )}
    </div>
  );
}

export default MultiSelect;
