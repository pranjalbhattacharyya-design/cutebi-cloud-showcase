import React, { useState } from 'react';
import { LayoutGrid, Sparkles, User, ShieldCheck, ArrowRight, Database, BarChart3, MessageSquare } from 'lucide-react';
import { useAppState } from '../../contexts/AppStateContext';
import ThemeSelector from '../ui/ThemeSelector';

export default function LandingPage() {
  const { setUserRole, theme } = useAppState();
  const [selected, setSelected] = useState(null);

  const handleEnter = () => {
    if (selected) {
      setUserRole(selected);
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--theme-app-bg)] overflow-y-auto flex flex-col items-center justify-start pt-24 p-6 text-[var(--theme-text-main)] font-sans scrollbar-hide">
      
      {/* Theme Selection in Corner */}
      <div className="absolute top-8 right-8 z-[100]">
        <ThemeSelector />
      </div>

      {/* Decorative Background Elements */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-500/20 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="z-10 w-full max-w-4xl flex flex-col items-center">
        
        {/* Logo Section */}
        <div className="flex items-center gap-4 mb-20 animate-in fade-in slide-in-from-top-6 duration-1000">
          <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-4 rounded-3xl shadow-2xl shadow-indigo-500/30 ring-1 ring-white/20">
            <LayoutGrid size={40} className="text-white" />
          </div>
          <div>
            <h1 className="text-5xl font-black tracking-tighter t-text-main opacity-90">
              M-Vantage <span className="t-accent">Platinum</span>
            </h1>
            <div className="h-1 w-full t-accent-bg mt-2 rounded-full opacity-30" />
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-4 text-center t-text-main">Select your workspace experience</h2>
        <p className="t-text-muted mb-12 text-center max-w-md opacity-80">Choose how you want to interact with your data today. You can switch roles at any time.</p>

        {/* Role Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl mb-12">
          
          {/* Developer Card */}
          <button 
            onClick={() => setSelected('developer')}
            className={`relative group text-left p-8 rounded-3xl border-2 transition-all duration-300 ${
              selected === 'developer' 
                ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/[0.08] shadow-2xl scale-[1.02]' 
                : 't-border bg-[var(--theme-panel-bg)] hover:bg-black/[0.03] opacity-80'
            }`}
          >
            <div className={`p-4 rounded-2xl mb-6 inline-block transition-colors ${
              selected === 'developer' ? 't-accent-bg text-white shadow-lg' : 'bg-black/5 t-accent'
            }`}>
              <ShieldCheck size={28} />
            </div>
            <h3 className="text-xl font-bold mb-2 t-text-main">Developer</h3>
            <p className="text-sm t-text-muted leading-relaxed mb-6">Full administrative access. Build reports, manage datasets, and define semantic models.</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-black/5 rounded text-[10px] font-bold uppercase tracking-wider t-text-muted">Modeling</span>
              <span className="px-2 py-1 bg-black/5 rounded text-[10px] font-bold uppercase tracking-wider t-text-muted">Data Library</span>
              <span className="px-2 py-1 bg-black/5 rounded text-[10px] font-bold uppercase tracking-wider t-text-muted">AI Admin</span>
            </div>
            {selected === 'developer' && <div className="absolute top-6 right-6 t-accent animate-pulse"><Sparkles size={20} /></div>}
          </button>

          {/* Viewer Card */}
          <button 
            onClick={() => setSelected('viewer')}
            className={`relative group text-left p-8 rounded-3xl border-2 transition-all duration-300 ${
              selected === 'viewer' 
                ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/[0.08] shadow-2xl scale-[1.02]' 
                : 't-border bg-[var(--theme-panel-bg)] hover:bg-black/[0.03] opacity-80'
            }`}
          >
            <div className={`p-4 rounded-2xl mb-6 inline-block transition-colors ${
              selected === 'viewer' ? 't-accent-bg text-white shadow-lg' : 'bg-black/5 t-accent'
            }`}>
              <User size={28} />
            </div>
            <h3 className="text-xl font-bold mb-2">Viewer</h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">Read-only access. Browse folders, open dashboards, and interact with insights.</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-bold uppercase tracking-wider text-slate-300">Interactive Reports</span>
              <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-bold uppercase tracking-wider text-slate-300">Read-Only</span>
            </div>
            {selected === 'viewer' && <div className="absolute top-6 right-6 text-violet-400"><Sparkles size={20} /></div>}
          </button>

        </div>

        {/* Enter Button */}
        <button 
          onClick={handleEnter}
          disabled={!selected}
          className={`group flex items-center gap-3 px-12 py-5 rounded-full font-bold text-lg transition-all duration-300 ${
            selected 
              ? 't-accent-bg text-white shadow-xl hover:scale-105 active:scale-95' 
              : 'bg-black/5 t-text-muted cursor-not-allowed'
          }`}
        >
          Welcome to M-Vantage
          <ArrowRight size={20} className={`${selected ? 'group-hover:translate-x-1' : ''} transition-transform`} />
        </button>

        {/* Footer Info */}
        <div className="mt-12 text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] flex items-center gap-6">
          <div className="flex items-center gap-2"><Database size={12} /> Powered by DuckDB</div>
          <div className="flex items-center gap-2"><BarChart3 size={12} /> Enterprise Semantic Model</div>
          <div className="flex items-center gap-2"><MessageSquare size={12} /> AI Assisted Analytics</div>
        </div>

      </div>

    </div>
  );
}
