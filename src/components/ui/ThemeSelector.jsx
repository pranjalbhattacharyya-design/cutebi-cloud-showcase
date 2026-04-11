import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check, ChevronDown } from 'lucide-react';
import { useAppState } from '../../contexts/AppStateContext';
import { THEMES } from '../../utils/themeEngine';

export default function ThemeSelector({ className = '' }) {
  const { theme, setTheme } = useAppState();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl t-panel border t-border transition-all font-black text-[11px] uppercase tracking-wider t-text-main hover:bg-black/5"
      >
        <Palette size={14} className="t-accent" />
        <span>{THEMES[theme]?.name || 'Theme'}</span>
        <ChevronDown size={12} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border t-border rounded-xl shadow-2xl z-[100] py-1.5 overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="px-3 py-1.5 text-[9px] font-black t-text-muted uppercase tracking-widest border-b t-border mb-1">
            Visual Workspace Theme
          </div>
          <div className="max-h-64 overflow-y-auto">
            {Object.entries(THEMES).map(([id, t]) => (
              <button
                key={id}
                onClick={() => {
                  setTheme(id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-bold transition-all flex items-center justify-between group ${
                  theme === id ? 't-accent-bg text-white' : 't-text-main hover:bg-black/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-3 h-3 rounded-full border t-border" 
                    style={{ backgroundColor: t['--theme-accent'] || (t.colors && t.colors[0]) }} 
                  />
                  {t.name}
                </div>
                {theme === id && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
