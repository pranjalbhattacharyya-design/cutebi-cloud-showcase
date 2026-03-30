export const syncSemanticModels = (models, rels) => {
  const patched = {};

  // Step 1: Patch all existing fields with origin metadata
  for (let [dsId, model] of Object.entries(models || {})) {
      patched[dsId] = model.map(f => {
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

  // Steps 2 & 3: Obsolete - We NO LONGER inject "Joined" copies of fields
  // because the CTE-First architecture handles the unified projection dynamically.
  // We keep the patched return to maintain compatibility with existing callers.

  return patched;
};
