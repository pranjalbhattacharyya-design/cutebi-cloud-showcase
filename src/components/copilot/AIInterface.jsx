import React, { useRef, useEffect } from 'react';
import { Sparkles, X, Loader2, ArrowRight, MessageSquare, Trash2, LayoutTemplate, PenTool, Check, Image as ImageIcon } from 'lucide-react';
import { useAppState } from '../../contexts/AppStateContext';
import ChartWidget from '../dashboard/ChartWidget';

export default function AIInterface({ handleAskAI, handleConfirmPendingAI, handleGenerateInfographic }) {
  const {
      showMagicBar, setShowMagicBar,
      activeDataset,
      aiMode, setAiMode,
      chatInput, setChatInput,
      exploreHistory, setExploreHistory,
      isThinking, aiError,
      pendingAIAction, setPendingAIAction,
      setIsExploreOpen,
      userRole
  } = useAppState();

  const isViewer = userRole === 'viewer';
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [exploreHistory, isThinking, aiError, pendingAIAction]);

  return (
    <div className="w-96 border-l t-border flex flex-col z-20 shadow-lg shrink-0 relative animate-in slide-in-from-right" style={{ background: 'var(--theme-app-bg)' }}>
      <div className="p-4 border-b t-border flex justify-between items-center shrink-0" style={{ background: 'var(--theme-panel-bg)' }}>
          <div className="flex items-center gap-2 font-bold t-text-main">
              <Sparkles className="t-accent" size={18} /> AI Copilot
          </div>
          <button 
            onClick={() => { 
                setIsExploreOpen(false); 
                if (!isViewer && aiMode === 'explore') setAiMode('build'); 
            }} 
            className="t-text-muted hover:t-accent transition-colors"
          >
            <X size={18} />
          </button>
      </div>
     
      <div className="flex p-2 gap-2 bg-black/5 border-b t-border shrink-0">
          <button 
            onClick={() => { setAiMode('explore'); setPendingAIAction(null); }} 
            className={`flex-1 py-1.5 text-xs font-bold transition-colors ${aiMode === 'explore' ? 'bg-white shadow-sm t-text-main' : 't-text-muted hover:t-text-main'} rounded-md flex items-center justify-center gap-1`}
          >
            <MessageSquare size={14}/> Explore Data
          </button>
          {!isViewer && (
            <button 
              onClick={() => { setAiMode('build'); setPendingAIAction(null); }} 
              className={`flex-1 py-1.5 text-xs font-bold transition-colors ${aiMode === 'build' ? 'bg-white shadow-sm t-text-main' : 't-text-muted hover:t-text-main'} rounded-md flex items-center justify-center gap-1`}
            >
              <LayoutTemplate size={14}/> Build Visual
            </button>
          )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {exploreHistory.length === 0 && !isThinking && !aiError && !pendingAIAction && (
              <div className="text-center mt-10 opacity-70">
                  <Sparkles size={32} className="mx-auto mb-3 t-accent" />
                  <p className="text-sm font-bold t-text-main">Welcome to CuteBI Copilot</p>
                  <p className="text-xs mt-2 leading-relaxed t-text-muted bg-black/5 p-3 rounded-lg border t-border">
                      {aiMode === 'explore' ? "Ask me anything about your data! Try:\n\n'What are the top 5 regions by sales?'\n'Show me revenue by product.'" : "Tell me what to build! Try:\n\n'Create a dashboard for sales performance'\n'Build a pie chart showing orders by category'"}
                  </p>
              </div>
          )}

          {exploreHistory.map((msg, i) => (
             <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2`}>
                <div className={`px-4 py-2.5 max-w-[90%] text-sm shadow-sm ${msg.role === 'user' ? 't-accent-bg rounded-t-2xl rounded-bl-2xl font-medium border-none' : 't-panel border rounded-t-2xl rounded-br-2xl'}`} style={{ borderRadius: msg.role === 'user' ? '1rem 1rem 0 1rem' : '1rem 1rem 1rem 0' }}>
                   {msg.role === 'ai' ? (
                       <pre className="font-sans whitespace-pre-wrap leading-relaxed font-bold break-words">{msg.text}</pre>
                   ) : msg.text}
                </div>
                {msg.role === 'ai' && msg.charts && msg.charts.map(c => (
                    <div key={c.id} className="mt-2 w-full pr-4 animate-in fade-in fill-mode-forwards" style={{ animationDelay: '300ms' }}>
                        <ChartWidget chart={{...c, size: 'full', showDataLabels: true}} isExploreMode={true} />
                    </div>
                ))}
                {msg.role === 'user' && msg.isImageRequest && (
                    <button onClick={() => handleGenerateInfographic(exploreHistory.findLast(m=>m.role==='ai')?.text, msg.text)} className="mt-1 flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-400">
                        <ImageIcon size={12}/> Generate Infographic
                    </button>
                )}
             </div>
          ))}

          {aiError && (
             <div className="t-panel border t-border border-red-500/50 p-4 rounded-xl shadow-sm text-sm t-text-main animate-in zoom-in-95">
                 <strong className="text-red-500 flex items-center gap-1 mb-2">Error</strong>
                 <pre className="font-sans whitespace-pre-wrap bg-red-500/10 p-2 rounded text-xs">{aiError}</pre>
             </div>
          )}

          {isThinking && (
             <div className="flex items-start gap-2 t-text-muted animate-in fade-in">
                 <Loader2 size={16} className="animate-spin mt-1" />
                 <span className="text-sm font-medium italic">Analyzing semantics...</span>
             </div>
          )}
         
          {pendingAIAction && (
             <div className="t-panel border t-border border-[var(--theme-accent)] p-4 rounded-xl shadow-md text-sm t-text-main animate-in slide-in-from-bottom-4 relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--theme-accent)] to-transparent"></div>
                 <h4 className="font-black text-[var(--theme-accent)] mb-2 flex items-center gap-1"><PenTool size={16}/> Copilot Suggestion</h4>
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
                     <button onClick={handleConfirmPendingAI} className="flex-1 t-accent-bg py-2 rounded-lg font-bold flex justify-center items-center gap-1 shadow-sm"><Check size={14}/> Approve & Build</button>
                     <button onClick={() => setPendingAIAction(null)} className="flex-1 t-button py-2 rounded-lg font-bold flex justify-center items-center gap-1 shadow-sm"><X size={14}/> Cancel</button>
                 </div>
             </div>
          )}
          <div ref={chatEndRef} />
      </div>

      <div className="p-4 border-t t-border bg-[var(--theme-panel-bg)] shrink-0">
          {exploreHistory.length > 0 && (
             <div className="flex justify-end mb-2">
                 <button onClick={() => setExploreHistory([])} className="text-xs font-bold t-text-muted hover:text-red-400 flex items-center gap-1 transition-colors"><Trash2 size={12}/> Clear Chat</button>
             </div>
          )}
          <form onSubmit={handleAskAI} className="relative">
             <input
                 type="text"
                 value={chatInput}
                 onChange={(e) => setChatInput(e.target.value)}
                 placeholder={aiMode === 'explore' ? "Ask about your data..." : "Prompt dashboard/charts..."}
                 disabled={isThinking || pendingAIAction || !activeDataset}
                 className="w-full t-panel border t-border pl-4 pr-10 py-3 text-sm font-medium focus:ring-2 focus:ring-[var(--theme-accent)] shadow-sm disabled:opacity-50"
                 style={{ borderRadius: 'var(--theme-radius-button)' }}
             />
             <button type="submit" disabled={!chatInput.trim() || isThinking || pendingAIAction || !activeDataset} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 t-accent-bg t-accent-text disabled:opacity-50 transition-all shadow-sm" style={{ borderRadius: 'calc(var(--theme-radius-button) / 2)' }}>
                 <ArrowRight size={16} />
             </button>
          </form>
          <div className="mt-2 text-[10px] text-center t-text-muted font-semibold tracking-wide flex items-center justify-center gap-1">
              <Sparkles size={10} className="t-accent opacity-70"/> Powered by Semantic Dictionary Map
          </div>
      </div>
    </div>
  );
}
