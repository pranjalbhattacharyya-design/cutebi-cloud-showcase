import React from 'react';
import { Link as LinkIcon, X, Database, ArrowLeftRight, ArrowRight, ArrowLeft, Trash2, Plus } from 'lucide-react';
import { useAppState } from '../../../contexts/AppStateContext';
import { syncSemanticModels } from '../../../utils/semanticSync';

export default function RelationshipsModal() {
  const {
    showRelModal, setShowRelModal,
    datasets, activeDatasetId, activeDataset,
    relationships, setRelationships,
    relForm, setRelForm,
    setSemanticModels, showToast,
    hiddenDatasetIds, setHiddenDatasetIds
  } = useAppState();

  if (!showRelModal) return null;

  const handleHideSources = () => {
    const ids = new Set();
    relationships.forEach(r => {
        ids.add(r.fromDatasetId);
        ids.add(r.toDatasetId);
    });
    setHiddenDatasetIds(Array.from(ids));
    showToast(`${ids.size} source tables have been hidden!`);
    setShowRelModal(false);
  };

  const handleAddRelationship = () => {
    if (!relForm.fromColumn || !relForm.toDatasetId || !relForm.toColumn) return;
    const newRel = { id: `rel_${Date.now()}`, ...relForm, fromDatasetId: activeDatasetId };
    const nextRels = [...relationships, newRel];
    setRelationships(nextRels);
    setSemanticModels(p => syncSemanticModels(p, nextRels));
    setRelForm({ fromColumn: '', toDatasetId: '', toColumn: '', direction: 'left' });
    showToast("Relationship Created!");
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto">
       <div className="t-panel p-8 shadow-xl w-full max-w-4xl t-border border my-auto relative">
          <button onClick={() => setShowRelModal(false)} className="absolute top-6 right-6 p-2 hover:bg-black/5 rounded-full"><X size={20} className="t-text-muted"/></button>
          <h3 className="text-xl font-bold t-text-main mb-6 flex items-center gap-2"><LinkIcon className="t-accent" size={24}/> Database Relationships</h3>
         
          {datasets.length < 2 ? (
              <div className="p-8 text-center bg-black/5 t-border border rounded-xl">
                 <Database size={48} className="mx-auto t-text-muted mb-4 opacity-50" />
                 <h4 className="font-bold t-text-main text-lg mb-2">Need More Data</h4>
                 <p className="t-text-muted text-sm">Upload at least two datasets to create relationships between them.</p>
              </div>
          ) : (
              <div className="flex flex-col md:flex-row gap-8">
                 <div className="flex-1 bg-black/5 p-6 rounded-2xl border t-border relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 t-accent opacity-5 -mr-12 -mt-12">
                       <LinkIcon size={128} />
                    </div>
                    <h4 className="font-bold text-sm t-text-main uppercase tracking-widest mb-6 flex items-center gap-2">
                       <Plus size={16} className="t-accent"/> Create New Relationship
                    </h4>
                    
                    <div className="flex flex-col gap-5 relative z-10">
                       <div className="p-4 t-panel border t-border rounded-xl">
                          <label className="text-[10px] font-black t-text-muted uppercase tracking-widest block mb-2">From Dataset (Active)</label>
                          <div className="flex items-center gap-3 mb-3">
                             <div className="w-10 h-10 t-accent-bg flex items-center justify-center rounded-lg shadow-sm">
                                <Database size={18} />
                             </div>
                             <span className="font-bold t-text-main">{activeDataset?.name}</span>
                          </div>
                          <select 
                            value={relForm.fromColumn} 
                            onChange={e => setRelForm({...relForm, fromColumn: e.target.value})} 
                            className="w-full t-panel t-border border px-3 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-[var(--theme-accent)] transition-all outline-none"
                            style={{ borderRadius: 'var(--theme-radius-button)' }}
                          >
                             <option value="">Select Join Column...</option>
                             {activeDataset?.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                       </div>

                       <div className="flex justify-center -my-3 relative z-20">
                          <div className="bg-white p-2 rounded-full border t-border shadow-md t-accent animate-pulse">
                             <ArrowLeftRight size={20} />
                          </div>
                       </div>

                       <div className="p-4 t-panel border t-border rounded-xl">
                          <label className="text-[10px] font-black t-text-muted uppercase tracking-widest block mb-2">Target Dataset</label>
                          <select 
                            value={relForm.toDatasetId} 
                            onChange={e => setRelForm({...relForm, toDatasetId: e.target.value, toColumn: ''})} 
                            className="w-full bg-white t-border border px-3 py-2.5 text-sm font-semibold mb-3 focus:ring-2 focus:ring-[var(--theme-accent)] transition-all outline-none"
                            style={{ borderRadius: 'var(--theme-radius-button)' }}
                          >
                             <option value="">Choose Dataset...</option>
                             {datasets.filter(d => d.id !== activeDatasetId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>

                          {relForm.toDatasetId && (
                             <select 
                                value={relForm.toColumn} 
                                onChange={e => setRelForm({...relForm, toColumn: e.target.value})} 
                                className="w-full t-panel t-border border px-3 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-[var(--theme-accent)] transition-all outline-none animate-in slide-in-from-top-2"
                                style={{ borderRadius: 'var(--theme-radius-button)' }}
                             >
                                <option value="">Select Target Column...</option>
                                {datasets.find(d => d.id === relForm.toDatasetId)?.headers?.map(h => <option key={h} value={h}>{h}</option>)}
                             </select>
                          )}
                       </div>

                       <div className="pt-2">
                          <label className="text-[10px] font-black t-text-muted uppercase tracking-widest block mb-2">Join Type</label>
                          <select 
                            value={relForm.direction} 
                            onChange={e => setRelForm({...relForm, direction: e.target.value})} 
                            className="w-full t-panel border t-border px-3 py-2.5 text-sm font-black t-accent focus:ring-2 focus:ring-[var(--theme-accent)] transition-all outline-none"
                            style={{ borderRadius: 'var(--theme-radius-button)' }}
                          >
                             <option value="left">Left Join (Enrich {activeDataset?.name})</option>
                             <option value="right">Right Join (Enrich Target)</option>
                             <option value="both">Both (Link Tables)</option>
                          </select>
                       </div>

                       <button 
                         onClick={handleAddRelationship} 
                         disabled={!relForm.fromColumn || !relForm.toDatasetId || !relForm.toColumn} 
                         className="mt-2 t-accent-bg py-4 font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale uppercase tracking-widest text-xs flex items-center justify-center gap-2" 
                         style={{ borderRadius: 'var(--theme-radius-button)' }}
                       >
                          <Plus size={18} /> Establish Relationship
                       </button>
                    </div>
                 </div>

                 <div className="flex-1">
                    <h4 className="font-bold text-sm t-text-main uppercase tracking-widest mb-4">Active Relationships</h4>
                    <div className="flex flex-col gap-3">
                       {relationships.length === 0 ? (
                           <div className="text-sm t-text-muted italic">No relationships defined yet.</div>
                       ) : (
                           relationships.map(rel => {
                              const fromDs = datasets.find(d => d.id === rel.fromDatasetId)?.name || 'Unknown';
                              const toDs = datasets.find(d => d.id === rel.toDatasetId)?.name || 'Unknown';
                              return (
                                 <div key={rel.id} className="p-4 t-panel border t-border rounded-xl shadow-sm text-sm">
                                    <div className="flex justify-between items-start mb-2">
                                       <div className="font-bold t-text-main flex items-center gap-2">
                                          {rel.direction === 'both' ? <ArrowLeftRight size={14} className="t-accent"/> : (rel.direction === 'right' ? <ArrowRight size={14} className="t-accent"/> : <ArrowLeft size={14} className="t-accent"/>)}
                                          Join
                                       </div>
                                       <button onClick={() => {
                                           const nextRels = relationships.filter(r => r.id !== rel.id);
                                           setRelationships(nextRels);
                                           setSemanticModels(p => syncSemanticModels(p, nextRels));
                                       }} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                                    </div>
                                    <div className="text-xs t-text-muted grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                                       <div className="text-right truncate"><span className="font-bold t-text-main">{fromDs}</span><br/>{rel.fromColumn}</div>
                                       <div className="font-black text-center">=</div>
                                       <div className="text-left truncate"><span className="font-bold t-text-main">{toDs}</span><br/>{rel.toColumn}</div>
                                    </div>
                                 </div>
                              )
                           })
                       )}
                    </div>
                 </div>
              </div>
          )}

          {relationships.length > 0 && (
              <div className="mt-8 pt-6 border-t t-border flex justify-end gap-3">
                  <div className="flex-1 flex flex-col">
                    <span className="text-[10px] font-bold t-text-muted uppercase tracking-widest mb-1">Enterprise Automation</span>
                    <p className="text-[11px] t-text-muted">Hide raw tables to focus on the combined model.</p>
                  </div>
                  <button 
                    onClick={handleHideSources}
                    className="t-button px-6 py-2.5 text-xs font-bold hover:t-accent-bg hover:text-white transition-all"
                  >
                    Hide All Source Tables
                  </button>
              </div>
          )}
       </div>
    </div>
  );
}
