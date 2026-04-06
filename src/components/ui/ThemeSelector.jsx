import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check, ChevronDown } from 'lucide-react';
import { useAppState } from '../../contexts/AppStateContext';
import { THEMES } from '../../utils/themeEngine';
import TypographySettings from './TypographySettings';

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
        className="flex items-center gap-2 px-4 py-2 rounded-full t-panel border t-border transition-all font-black text-[10px] uppercase tracking-wider t-text-main shadow-xl hover:scale-105 active:scale-95"
      >
        <Palette size={14} className="t-accent" />
        <span>{THEMES[theme]?.name || 'Theme'}</span>
        <ChevronDown size={12} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl z-[100] py-2 overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="px-4 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-white/5 mb-1">
            Visual Workspace Theme
          <div className="border-t border-white/5 p-2"><TypographySettings /></div></div>
          <div className="max-h-64 overflow-y-auto">
            {Object.entries(THEMES).map(([id, t]) => (
              <button
                key={id}
                onClick={() => {
                  setTheme(id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-all flex items-center justify-between group ${
                  theme === id ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full border border-white/20" style={{ backgroundColor: t['--theme-accent'] || t.colors[0] }} />
                  {t.name}
                <div className="border-t border-white/5 p-2"><TypographySettings /></div></div>
                {theme === id && <Check size={14} />}
              </button>
            ))}
          <div className="border-t border-white/5 p-2"><TypographySettings /></div></div>
        <div className="border-t border-white/5 p-2"><TypographySettings /></div></div>
      )}
    </div>
  );
}
