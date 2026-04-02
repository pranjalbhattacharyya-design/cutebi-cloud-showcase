import React, { useRef, useEffect, useState } from 'react';
import {
  Sparkles, X, Loader2, ArrowRight, MessageSquare, Trash2,
  LayoutTemplate, PenTool, Check, Image as ImageIcon,
  ChevronDown, ChevronRight, Zap, Search, Download, RotateCcw, Copy
} from 'lucide-react';
import { useAppState } from '../../contexts/AppStateContext';
import { useAI } from '../../hooks/useAI';
import { useDataEngine } from '../../hooks/useDataEngine';
import ChartWidget from '../dashboard/ChartWidget';
import InfographicCanvas from './InfographicCanvas';
import PreflightCard from '../PreflightCard';
import DimensionTrendPicker from '../DimensionTrendPicker';
import DeepDiveProgress from '../DeepDiveProgress';

// ---------------------------------------------------------------------------
// Accordion Section for Deep Dive phases
// ---------------------------------------------------------------------------
function PhaseAccordion({ label, icon, content, defaultOpen = false, onGenerateInfographic }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  };

  if (!content) return null;

  return (
    <div className="border t-border rounded-lg overflow-hidden mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold t-text-main bg-black/5 hover:bg-black/10 transition-colors"
      >
        <span className="flex items-center gap-1.5">{icon} {label}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="px-3 py-2 text-xs leading-relaxed t-text-main font-medium whitespace-pre-wrap bg-white/5">
          <div className="mb-3">{content}</div>
          <div className="flex justify-end gap-2 pt-2 border-t t-border">
            <button
               onClick={handleCopy}
               className="flex items-center gap-1 text-[10px] font-bold t-text-muted hover:t-text-main px-2 py-1 rounded transition-colors"
            >
               {copied ? <Check size={10}/> : <Copy size={10}/>} {copied ? 'Copied' : 'Copy'}
            </button>
            {onGenerateInfographic && (
              <button
                 onClick={() => onGenerateInfographic(content)}
                 className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-400 t-button py-1 px-2 rounded-md transition-colors"
              >
                 <ImageIcon size={10} /> Generate Infographic
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data Snippet Accordion — shows raw query result before analysis phases
// ---------------------------------------------------------------------------
function DataSnippetAccordion({ rows, headers, total }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border t-border rounded-lg overflow-hidden mb-2 bg-black/5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold t-text-muted hover:t-text-main transition-colors"
      >
        <span className="flex items-center gap-1.5">
          📋 Data Snapshot ({total} rows)
        </span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <div className="overflow-x-auto max-h-48 overflow-y-auto">
          <table className="w-full text-[10px] border-collapse">
            <thead className="sticky top-0">
              <tr>
                {headers.map(h => (
                  <th key={h} className="px-2 py-1 text-left font-black t-text-muted bg-black/10 border-b t-border whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-transparent' : 'bg-black/5'}>
                  {headers.map(h => (
                    <td key={h} className="px-2 py-1 t-text-main border-b t-border whitespace-nowrap font-medium">
                      {row[h] == null ? <span className="t-text-muted italic">—</span> : String(row[h])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Message Bubble
// ---------------------------------------------------------------------------
function AIMessage({ msg, handleGenerateInfographic, handleDeepDiveExecute, handleTrendExecute }) {
  const [copied, setCopied] = useState(false);
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  // Infographic result bubble (Canvas-rendered, zero Imagen cost)
  if (msg.isInfographic) {
    const canvasRef = React.useRef(null);
    return (
      <div className="flex flex-col items-start animate-in slide-in-from-bottom-2 w-full">
        <div className="t-panel border t-border rounded-t-2xl rounded-br-2xl px-3 py-3 w-full shadow-sm">
          {msg.isError ? (
            <p className="text-xs text-red-500 font-semibold">{msg.text}</p>
          ) : (
            <>
              <p className="text-xs font-bold t-text-muted mb-2">{msg.text}</p>
              {msg.infographicData && (
                <>
                  <InfographicCanvas ref={canvasRef} data={msg.infographicData} />
                  <button
                    onClick={() => canvasRef.current?.download()}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold t-accent-bg transition-all hover:opacity-90"
                  >
                    <Download size={12} /> Download PNG
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // Hierarchy counter-question bubble
  if (msg.path === 'hierarchy_question') {
    return (
      <div className="flex flex-col items-start animate-in slide-in-from-bottom-2 w-full">
        <div className="t-panel border t-border rounded-t-2xl rounded-br-2xl px-4 py-3 w-full shadow-sm bg-indigo-50/30">
          <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            🎯 Deep Dive Setup
          </p>
          <p className="text-xs leading-relaxed t-text-main font-medium">{msg.text}</p>
          <p className="text-[10px] t-text-muted mt-2">Type your three levels separated by commas and press Enter.</p>
        </div>
      </div>
    );
  }

  // Preflight Card bubble
  if (msg.path === 'preflight_card') {
     return (
        <div className="flex flex-col items-start animate-in slide-in-from-bottom-2 w-full">
           <PreflightCard 
             preflightData={msg.preflightData} 
             datasetId={msg.datasetId}
             cteSql={msg.cteSql || ''}
             onConfirm={(scope) => handleDeepDiveExecute(scope, msg.userQuery)} 
           />
        </div>
     );
  }

  // Trend Picker bubble
  if (msg.path === 'trend_picker') {
     return (
        <div className="flex flex-col items-start animate-in slide-in-from-bottom-2 w-full">
           <DimensionTrendPicker 
             dimensions={msg.dimensions}
             measures={msg.measures}
             onConfirm={(scope) => handleTrendExecute(scope, msg.userQuery)}
           />
        </div>
     );
  }

  // Deep Dive Progress bubble
  if (msg.path === 'deep_dive_progress') {
     return (
        <div className="flex flex-col items-start animate-in w-full">
           <DeepDiveProgress
             totalCalls={msg.totalWaves}
             completedCalls={msg.completedWaves}
             statusMessage={msg.statusMessage}
             currentPhase={msg.currentPhase}
           />
        </div>
     );
  }

  // Deep Dive bubble
  if (msg.path === 'deep_dive' && msg.phases) {
    const rows = msg.data || [];
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const preview = rows.slice(0, 10);

    return (
      <div className="flex flex-col items-start animate-in slide-in-from-bottom-2 w-full">
        {msg.isPartial && (
          <div className="text-[10px] font-bold text-amber-500 flex items-center gap-1 mb-1 px-1">
            ⚠️ Partial analysis — one or more phases could not complete.
          </div>
        )}
        <div className="t-panel border t-border rounded-t-2xl rounded-br-2xl px-3 py-3 w-full shadow-sm">
          <p className="text-[10px] font-black t-text-muted uppercase tracking-widest mb-2 flex items-center gap-1">
            <Search size={10} /> Deep Dive Analysis - Choose phase to visualize
          </p>

          {/* Data Snippet */}
          {headers.length > 0 && (
            <DataSnippetAccordion rows={preview} headers={headers} total={rows.length} />
          )}

          <PhaseAccordion 
            label="🔬 Micro — Grain-Level Insights" 
            icon={null} 
            content={msg.phases.micro} 
            defaultOpen={false} 
            onGenerateInfographic={(text) => handleGenerateInfographic(text, msg.userQuery)} 
          />
          <PhaseAccordion 
            label="📊 Meso — Systemic Patterns" 
            icon={null} 
            content={msg.phases.meso} 
            defaultOpen={false} 
            onGenerateInfographic={(text) => handleGenerateInfographic(text, msg.userQuery)} 
          />
          <PhaseAccordion 
            label="🎯 Macro — Strategic Verdict" 
            icon={null} 
            content={msg.phases.macro} 
            defaultOpen={true} 
            onGenerateInfographic={(text) => handleGenerateInfographic(text, msg.userQuery)} 
          />
        </div>
      </div>
    );
  }

  // Fast Path / plain AI bubble
  return (
    <div className="flex flex-col items-start animate-in slide-in-from-bottom-2">
      <div className="t-panel border t-border rounded-t-2xl rounded-br-2xl px-4 py-2.5 max-w-[90%] shadow-sm">
        {msg.isEmpty ? (
          <p className="text-xs t-text-muted italic">{msg.text}</p>
        ) : (
          <pre className="font-sans whitespace-pre-wrap leading-relaxed font-bold break-words text-sm">{msg.text}</pre>
        )}
        {!msg.isEmpty && (
          <div className="flex gap-2 mt-2 pt-2 border-t t-border">
            <button
              onClick={() => copyToClipboard(msg.text)}
              className="flex items-center gap-1 text-[10px] font-bold t-text-muted hover:t-text-main transition-colors"
            >
              {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => handleGenerateInfographic(msg.text, msg.userQuery)}
              className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-400 transition-colors"
            >
              <ImageIcon size={10} /> Generate Infographic
            </button>
          </div>
        )}
      </div>
      {msg.charts?.map(c => (
        <div key={c.id} className="mt-2 w-full pr-4 animate-in fade-in fill-mode-forwards" style={{ animationDelay: '300ms' }}>
          <ChartWidget chart={{ ...c, size: 'full', showDataLabels: true }} isExploreMode={true} />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AIInterface Component
// ---------------------------------------------------------------------------
export default function AIInterface({ handleAskAI: handleAskAIFromApp, handleConfirmPendingAI: handleConfirmFromApp, handleGenerateInfographic: _unused }) {
  const {
    showMagicBar, setShowMagicBar,
    activeDataset,
    aiMode, setAiMode,
    chatInput, setChatInput,
    exploreHistory, setExploreHistory,
    isThinking, aiError, aiThinkingLabel,
    pendingAIAction, setPendingAIAction,
    setIsExploreOpen,
    userRole,
  } = useAppState();

  const { handleGenerateInfographic, handleAskAI, executeExploreDataLogic, handleHierarchyAnswer, handleDeepDiveExecute, handleTrendExecute } = useAI();
  const { hierarchyPending, deepDiveHierarchy, setDeepDiveHierarchy } = useAppState();
  const { generateUnifiedCTE } = useDataEngine();

  const isViewer = userRole === 'viewer';
  const chatEndRef = useRef(null);
  const chatAreaRef = useRef(null);

  // Local state: which analysis path is selected
  const [analysisPath, setAnalysisPath] = useState('fast');

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTo({
        top: chatAreaRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [exploreHistory, isThinking, aiError, pendingAIAction]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim() || isThinking || pendingAIAction || !activeDataset) return;
    // If a hierarchy counter-question is waiting, treat this message as the hierarchy answer
    if (aiMode === 'explore' && hierarchyPending) {
      handleHierarchyAnswer(chatInput, hierarchyPending);
      return;
    }
    if (aiMode === 'explore') {
      await executeExploreDataLogic(chatInput, aiMode, analysisPath);
    } else {
      await handleAskAI(e);
    }
  };

  const handleRetry = () => {
    if (exploreHistory.length > 0) {
      const lastUser = [...exploreHistory].reverse().find(m => m.role === 'user');
      if (lastUser) executeExploreDataLogic(lastUser.text, aiMode, analysisPath);
    }
  };

  return (
    <div className="w-96 border-l t-border flex flex-col z-20 shadow-lg shrink-0 relative animate-in slide-in-from-right" style={{ background: 'var(--theme-app-bg)' }}>

      {/* Header */}
      <div className="p-4 border-b t-border flex justify-between items-center shrink-0" style={{ background: 'var(--theme-panel-bg)' }}>
        <div className="flex items-center gap-2 font-bold t-text-main">
          <Sparkles className="t-accent" size={18} /> AI Copilot
        </div>
        <button
          onClick={() => { setIsExploreOpen(false); if (!isViewer && aiMode === 'explore') setAiMode('build'); }}
          className="t-text-muted hover:t-accent transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Mode Tabs: Explore / Build */}
      <div className="flex p-2 gap-2 bg-black/5 border-b t-border shrink-0">
        <button
          onClick={() => { setAiMode('explore'); setPendingAIAction(null); }}
          className={`flex-1 py-1.5 text-xs font-bold transition-colors ${aiMode === 'explore' ? 'bg-white shadow-sm t-text-main' : 't-text-muted hover:t-text-main'} rounded-md flex items-center justify-center gap-1`}
        >
          <MessageSquare size={14} /> Explore Data
        </button>
        {!isViewer && (
          <button
            onClick={() => { setAiMode('build'); setPendingAIAction(null); }}
            className={`flex-1 py-1.5 text-xs font-bold transition-colors ${aiMode === 'build' ? 'bg-white shadow-sm t-text-main' : 't-text-muted hover:t-text-main'} rounded-md flex items-center justify-center gap-1`}
          >
            <LayoutTemplate size={14} /> Build Visual
          </button>
        )}
      </div>

      {/* Analysis Path Toggle — only visible in Explore mode */}
      {aiMode === 'explore' && (
        <div className="flex p-2 gap-2 bg-black/5 border-b t-border shrink-0">
          <button
            onClick={() => setAnalysisPath('fast')}
            className={`flex-1 py-1.5 text-xs font-bold transition-colors rounded-md flex items-center justify-center gap-1 ${analysisPath === 'fast' ? 'bg-amber-400 text-white shadow-sm' : 't-text-muted hover:t-text-main t-panel border t-border'}`}
          >
            <Zap size={12} /> Quick Answer
          </button>
          <button
            onClick={() => setAnalysisPath('trend')}
            className={`flex-1 py-1.5 text-xs font-bold transition-colors rounded-md flex items-center justify-center gap-1 ${analysisPath === 'trend' ? 'bg-emerald-500 text-white shadow-sm' : 't-text-muted hover:t-text-main t-panel border t-border'}`}
          >
            <Zap size={12} /> Trend
          </button>
          <button
            onClick={() => setAnalysisPath('deep_dive')}
            className={`flex-1 py-1.5 text-xs font-bold transition-colors rounded-md flex items-center justify-center gap-1 ${analysisPath === 'deep_dive' ? 'bg-indigo-500 text-white shadow-sm' : 't-text-muted hover:t-text-main t-panel border t-border'}`}
          >
            <Search size={12} /> Deep Dive
          </button>
        </div>
      )}

      {/* Chat Area */}
      <div ref={chatAreaRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        {/* Empty state */}
        {exploreHistory.length === 0 && !isThinking && !aiError && !pendingAIAction && (
          <div className="text-center mt-10 opacity-70">
            <Sparkles size={32} className="mx-auto mb-3 t-accent" />
            <p className="text-sm font-bold t-text-main">Welcome to CuteBI Copilot</p>
            <p className="text-xs mt-2 leading-relaxed t-text-muted bg-black/5 p-3 rounded-lg border t-border">
              {aiMode === 'explore'
                ? analysisPath === 'fast'
                  ? "⚡ Quick Answer mode: Ask a direct question and get a concise answer.\n\nTry: 'Who is the top dealer?'"
                  : analysisPath === 'trend'
                    ? "⚡ Trend mode: Quick 15-second analysis of one dimension over time. No hierarchy required."
                    : "🔍 Deep Dive mode: Ask for trends, patterns, or 'why' questions and get a 3-layer strategic analysis.\n\nTry: 'Why did Q3 performance drop?' or 'Analyze fuel type trends.'"
                : "Tell me what to build!\n\nTry: 'Create a sales performance dashboard' or 'Build a pie chart showing orders by category'"
              }
            </p>
          </div>
        )}

        {/* Chat history */}
        {exploreHistory.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2`}>
            {msg.role === 'user' ? (
              <div className="flex items-end gap-1">
                {msg.analysisPath === 'fast' && <Zap size={10} className="text-amber-400 mb-1 shrink-0" />}
                {msg.analysisPath === 'deep_dive' && <Search size={10} className="text-indigo-400 mb-1 shrink-0" />}
                <div
                  className="px-4 py-2.5 max-w-[90%] text-sm shadow-sm t-accent-bg rounded-t-2xl rounded-bl-2xl font-medium border-none"
                  style={{ borderRadius: '1rem 1rem 0 1rem' }}
                >
                  {msg.text}
                </div>
              </div>
            ) : (
              <AIMessage 
                msg={msg} 
                handleGenerateInfographic={handleGenerateInfographic} 
                handleDeepDiveExecute={handleDeepDiveExecute}
                handleTrendExecute={handleTrendExecute}
              />
            )}
          </div>
        ))}

        {/* Error state */}
        {aiError && (
          <div className="t-panel border t-border border-red-500/50 p-4 rounded-xl shadow-sm text-sm t-text-main animate-in zoom-in-95">
            <strong className="text-red-500 flex items-center gap-1 mb-2">Error</strong>
            <pre className="font-sans whitespace-pre-wrap bg-red-500/10 p-2 rounded text-xs">{aiError}</pre>
            <button
              onClick={handleRetry}
              className="mt-2 flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-300 transition-colors"
            >
              <RotateCcw size={12} /> Try Again
            </button>
          </div>
        )}

        {/* Thinking spinner with progressive label */}
        {isThinking && (
          <div className="flex items-start gap-2 t-text-muted animate-in fade-in">
            <Loader2 size={16} className="animate-spin mt-1 shrink-0" />
            <span className="text-sm font-medium italic">{aiThinkingLabel}</span>
          </div>
        )}

        {/* Pending AI Action (Build mode measure approval) */}
        {pendingAIAction && (
          <div className="t-panel border t-border border-[var(--theme-accent)] p-4 rounded-xl shadow-md text-sm t-text-main animate-in slide-in-from-bottom-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--theme-accent)] to-transparent" />
            <h4 className="font-black text-[var(--theme-accent)] mb-2 flex items-center gap-1"><PenTool size={16} /> Copilot Suggestion</h4>
            <p className="mb-3 text-xs leading-relaxed font-semibold">I need to create new measures to fulfill your request:</p>
            <ul className="mb-4 text-xs space-y-2">
              {pendingAIAction.measures.map((m, i) => (
                <li key={i} className="flex flex-col bg-black/5 p-2 rounded t-border border">
                  <span className="font-bold">{m.label}</span>
                  <span className="font-mono text-[10px] t-text-muted t-accent truncate mt-1">{m.op1} {m.operator} {m.op2}</span>
                </li>
              ))}
            </ul>
            <p className="mb-4 text-[10px] font-bold t-text-muted italic">I will save these to your Semantic Dictionary and generate the charts.</p>
            <div className="flex gap-2">
              <button onClick={handleConfirmFromApp} className="flex-1 t-accent-bg py-2 rounded-lg font-bold flex justify-center items-center gap-1 shadow-sm"><Check size={14} /> Approve & Build</button>
              <button onClick={() => setPendingAIAction(null)} className="flex-1 t-button py-2 rounded-lg font-bold flex justify-center items-center gap-1 shadow-sm"><X size={14} /> Cancel</button>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Footer */}
      <div className="p-4 border-t t-border bg-[var(--theme-panel-bg)] shrink-0">
        {exploreHistory.length > 0 && (
          <div className="flex justify-end mb-2">
            <button onClick={() => setExploreHistory([])} className="text-xs font-bold t-text-muted hover:text-red-400 flex items-center gap-1 transition-colors">
              <Trash2 size={12} /> Clear Chat
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={aiMode === 'explore'
              ? analysisPath === 'fast' ? '⚡ Ask a quick question...' : analysisPath === 'trend' ? '⚡ Select dimension for trend...' : '🔍 Ask for deep analysis...'
              : 'Prompt dashboard/charts...'}
            disabled={isThinking || pendingAIAction || !activeDataset}
            className="w-full t-panel border t-border pl-4 pr-10 py-3 text-sm font-medium focus:ring-2 focus:ring-[var(--theme-accent)] shadow-sm disabled:opacity-50"
            style={{ borderRadius: 'var(--theme-radius-button)' }}
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || isThinking || pendingAIAction || !activeDataset}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 t-accent-bg t-accent-text disabled:opacity-50 transition-all shadow-sm"
            style={{ borderRadius: 'calc(var(--theme-radius-button) / 2)' }}
          >
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="mt-2 text-[10px] text-center t-text-muted font-semibold tracking-wide flex items-center justify-center gap-1">
          <Sparkles size={10} className="t-accent opacity-70" />
          {aiMode === 'explore' ? (analysisPath === 'fast' ? 'Quick Answer Mode' : analysisPath === 'trend' ? 'Dimension Trend Mode' : 'Deep Dive — 3 Phase Analysis') : 'Powered by Semantic Dictionary Map'}
        </div>
      </div>
    </div>
  );
}
