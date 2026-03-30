import { syncSemanticModels } from './semanticSync';

/**
 * Generates an initial semantic model (fields) for a dataset based on its headers and sample data.
 */
export const generateInitModel = (dsId, headers, data) => 
  headers.map(h => {
    // Smart Detection: Scan the entire sample to see if it's primarily numeric
    let numericCount = 0;
    let nonNullCount = 0;
    
    data.forEach(row => {
        const val = row[h];
        if (val !== undefined && val !== null && val !== '') {
            nonNullCount++;
            const isNum = typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)) && isFinite(val));
            if (isNum) numericCount++;
        }
    });

    const isMeasure = nonNullCount > 0 && (numericCount / nonNullCount) > 0.8;
    
    return {
      id: String(h), 
      label: String(h).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      type: isMeasure ? 'measure' : 'dimension',
      aggType: 'sum',
      isHidden: false, 
      format: (h.toLowerCase().includes('date') || h.toLowerCase().includes('time')) ? 'date' : 'auto', 
      description: '',
      category: 'Uncategorized',
      originDatasetId: dsId, 
      originFieldId: String(h)
    };
  });

/**
 * Ensures all fields in semantic models have the required enterprise metadata.
 */
export const patchModels = (models) => {
  const patched = {};
  for (let [key, model] of Object.entries(models || {})) {
    patched[key] = (model || []).map(f => ({
      ...f, 
      aggType: f.aggType || 'sum', 
      category: f.category || 'Uncategorized', 
      originDatasetId: f.originDatasetId || (f.isJoined ? null : key), 
      originFieldId: f.originFieldId || (f.isJoined ? f.originalId : f.id)
    }));
  }
  return patched;
};
