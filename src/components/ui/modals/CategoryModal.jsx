import React from 'react';
import { Tags, Plus, X, Trash2 } from 'lucide-react';
import { useAppState } from '../../../contexts/AppStateContext';

export default function CategoryModal() {
  const {
    showCategoryModal,
    setShowCategoryModal,
    categories,
    newCategoryName,
    setNewCategoryName,
    handleAddCategory,
    handleDeleteCategory
  } = useAppState();

  if (!showCategoryModal) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto">
      <div className="t-panel p-8 shadow-xl w-full max-w-sm t-border border my-auto relative">
        <button onClick={() => setShowCategoryModal(false)} className="absolute top-6 right-6 p-2 hover:bg-black/5 rounded-full">
          <X size={20} className="t-text-muted"/>
        </button>
        <h3 className="text-xl font-bold t-text-main mb-6 flex items-center gap-2">
          <Tags className="t-accent" size={24}/> Manage Categories
        </h3>
        
        <div className="flex gap-2 mb-8">
          <input 
            value={newCategoryName} 
            onChange={e => setNewCategoryName(e.target.value)} 
            placeholder="e.g. Regions..." 
            className="flex-1 t-panel border t-border px-4 py-3 text-sm font-bold t-text-main outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/30 transition-all" 
            style={{ borderRadius: 'var(--theme-radius-button)' }} 
            onKeyDown={e => {if(e.key === 'Enter') handleAddCategory()}}
          />
          <button onClick={handleAddCategory} className="t-accent-bg px-5 font-bold shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center" style={{ borderRadius: 'var(--theme-radius-button)' }}>
            <Plus size={20}/>
          </button>
        </div>
        
        <h4 className="text-[10px] font-black t-text-muted uppercase tracking-widest mb-4">Existing Categories</h4>
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {categories.map(c => (
            <div key={c} className="flex justify-between items-center p-3 border t-border bg-black/5" style={{ borderRadius: 'var(--theme-radius-button)' }}>
              <span className="text-sm font-bold t-text-main">{c}</span>
              {c !== 'Uncategorized' && (
                <button onClick={() => handleDeleteCategory(c)} className="text-red-400 hover:text-red-600 hover:bg-red-500/10 p-1.5 rounded-full transition-colors">
                  <Trash2 size={14}/>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
