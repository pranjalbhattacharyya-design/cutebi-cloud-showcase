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

/**
 * Ensures semantic models are patched with origin metadata and calculated field tokens.
 * Migrated from legacy semanticSync utility.
 */
export const syncSemanticModels = (models, rels) => {
  const patched = {};

  for (let [dsId, model] of Object.entries(models || {})) {
      patched[dsId] = model.map(f => {
          // Auto-patch calculated fields if they are missing logic tokens (legacy support)
          if (f.isCalculated && !f.mathTokens && f.op1) {
              f.mathTokens = [
                 { type: 'measure', val: f.op1 },
                 { type: 'operator', val: f.operator || '+' },
                 { type: 'measure', val: f.op2 }
              ];
              f.filters = [];
              f.filterLogic = 'AND';
              f.timeConfig = { enabled: false, dateDimensionId: '', period: 'MTD' };
          }

          if (!f.isJoined) {
              return { ...f, originDatasetId: f.originDatasetId || dsId, originFieldId: f.originFieldId || f.id };
          } else {
              const rel = (rels || []).find(r => r.id === f.joinRelId);
              let oDsId = f.originDatasetId;
              if (!oDsId && rel) {
                  if (rel.fromDatasetId === dsId) oDsId = rel.toDatasetId;
                  else if (rel.toDatasetId === dsId) oDsId = rel.fromDatasetId;
              }
              return { ...f, originDatasetId: oDsId, originFieldId: f.originFieldId || f.originalId };
          }
      });
  }

  return patched;
};
