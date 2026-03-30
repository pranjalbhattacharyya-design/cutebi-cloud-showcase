import React, { useState, useEffect } from 'react';
import { Database as Bug, X, Info, AlertTriangle, Database } from 'lucide-react';
import { useAppState } from '../../../contexts/AppStateContext';

export default function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showPanel, setShowPanel] = useState(true);

  const { 
    setDatasets, setActiveDatasetId, setSemanticModels, setShowPortal, 
    setDashboards, setPages, setActivePageId, showToast,
    relationships, setRelationships
  } = useAppState();

  const handleLoadMockData = () => {
    const mockWsId = 'w_default';
    const mockId1 = 'ds_sales_123';
    const mockId2 = 'ds_regions_456';
    const mockId3 = 'ds_products_789';
    
    const mockDataset1 = {
      id: mockId1,
      workspaceId: mockWsId,
      name: 'Sales Performance',
      tableName: 'ds_sales',
      originalFileName: 'sales.csv',
      headers: ['Regional Key', 'Product', 'Sales'],
      data: [['R1', 'Widget A', 100], ['R2', 'Widget B', 200]]
    };

    const mockDataset2 = {
      id: mockId2,
      workspaceId: mockWsId,
      name: 'Regional Hierarchy',
      tableName: 'ds_regions',
      originalFileName: 'regions.csv',
      headers: ['Regional Key', 'Location Name', 'Country'],
      data: [['R1', 'New York', 'USA'], ['R2', 'London', 'UK']]
    };

    const mockDataset3 = {
      id: mockId3,
      workspaceId: mockWsId,
      name: 'Product Categories',
      tableName: 'ds_products',
      originalFileName: 'products.csv',
      headers: ['Product', 'Business Category', 'Margin %'],
      data: [['Widget A', 'Hardware', 0.25], ['Widget B', 'Software', 0.85]]
    };
    
    setDatasets([mockDataset1, mockDataset2, mockDataset3]);
    
    const initialModels = {
      [mockId1]: [
        { id: 'Regional Key', label: 'Regional Key', type: 'dimension', datasetId: mockId1, originDatasetId: mockId1, originFieldId: 'Regional Key', category: 'Uncategorized' },
        { id: 'Product', label: 'Product', type: 'dimension', datasetId: mockId1, originDatasetId: mockId1, originFieldId: 'Product', category: 'Uncategorized' },
        { id: 'Sales', label: 'Sales', type: 'measure', aggType: 'sum', datasetId: mockId1, originDatasetId: mockId1, originFieldId: 'Sales', category: 'Measures' }
      ],
      [mockId2]: [
        { id: 'Regional Key', label: 'Regional Key', type: 'dimension', datasetId: mockId2, originDatasetId: mockId2, originFieldId: 'Regional Key', category: 'Uncategorized' },
        { id: 'Location Name', label: 'Location Name', type: 'dimension', datasetId: mockId2, originDatasetId: mockId2, originFieldId: 'Location Name', category: 'Uncategorized' },
        { id: 'Country', label: 'Country', type: 'dimension', datasetId: mockId2, originDatasetId: mockId2, originFieldId: 'Country', category: 'Uncategorized' }
      ],
      [mockId3]: [
        { id: 'Product', label: 'Product', type: 'dimension', datasetId: mockId3, originDatasetId: mockId3, originFieldId: 'Product', category: 'Uncategorized' },
        { id: 'Business Category', label: 'Business Category', type: 'dimension', datasetId: mockId3, originDatasetId: mockId3, originFieldId: 'Business Category', category: 'Uncategorized' },
        { id: 'Margin %', label: 'Margin %', type: 'measure', aggType: 'sum', datasetId: mockId3, originDatasetId: mockId3, originFieldId: 'Margin %', category: 'Measures' }
      ]
    };

    const initialRels = [
      {
        id: 'rel_mock_1',
        fromDatasetId: mockId1,
        toDatasetId: mockId2,
        fromColumn: 'Regional Key',
        toColumn: 'Regional Key',
        direction: 'left'
      },
      {
        id: 'rel_mock_2',
        fromDatasetId: mockId1,
        toDatasetId: mockId3,
        fromColumn: 'Product',
        toColumn: 'Product',
        direction: 'left'
      }
    ];

    setSemanticModels(initialModels);
    setRelationships(initialRels);
    
    setActiveDatasetId(mockId1);
    setShowPortal(false);
    setDashboards({ 'page_1': [] });
    setPages([{ id: 'page_1', name: 'Page 1' }]);
    setActivePageId('page_1');
    showToast("✨ Multi-table mock data loaded and synchronized!");
    setIsOpen(false);
  };

  useEffect(() => {
    // Listen for custom debug events
    const handleDebug = (e) => {
      setLogs(prev => [e.detail, ...prev].slice(0, 100));
      setShowPanel(true);
    };
    window.addEventListener('cutebi-debug', handleDebug);
    return () => window.removeEventListener('cutebi-debug', handleDebug);
  }, []);

  if (!showPanel) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2 pointer-events-none">
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="bg-black text-white p-3 rounded-full shadow-2xl flex items-center gap-2 hover:scale-105 transition-transform pointer-events-auto active:scale-95"
          title="Open Debug Panel"
        >
          <Bug size={20} className="text-yellow-400" />
          <span className="font-bold text-xs uppercase tracking-widest">Debug</span>
        </button>
      )}

      {isOpen && (
        <div className="w-96 max-h-[500px] bg-white border-2 border-black rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto">
          <div className="bg-black text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bug size={18} className="text-yellow-400" />
              <span className="font-bold text-sm">System Diagnostics</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:text-red-400 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 scrollbar-hide">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-gray-400 italic">No diagnostics captured yet...</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`p-3 rounded-lg border-l-4 shadow-sm bg-white ${
                  log.type === 'error' ? 'border-red-500' : 
                  log.type === 'warning' ? 'border-yellow-500' : 'border-blue-500'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {log.type === 'error' ? <AlertTriangle size={14} className="text-red-500" /> : <Info size={14} className="text-blue-500" />}
                    <span className="font-bold text-xs uppercase text-gray-500">{log.category || 'General'}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-800 leading-relaxed">{log.message}</div>
                  {log.details && (
                    <div className="mt-2 text-[10px] font-mono bg-gray-100 p-2 rounded overflow-x-auto text-gray-600">
                      {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          
          <div className="p-3 bg-white border-t border-gray-100 flex justify-between uppercase">
            <div className="flex items-center gap-4">
               <button 
                   onClick={() => setLogs([])} 
                   className="text-[10px] font-bold text-gray-400 hover:text-red-500"
               >CLEAR LOGS</button>
               <button 
                   onClick={() => {
                       const text = logs.map(l => `[${l.category || 'GENERAL'}] ${l.message}\n${l.details ? JSON.stringify(l.details, null, 2) : ''}`).join('\n---\n');
                       const fallback = (t) => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); };
                       try { if (navigator.clipboard) { navigator.clipboard.writeText(text).catch(() => fallback(text)); } else { fallback(text); } } catch(e) { fallback(text); }
                       showToast("📋 Logs copied to clipboard!");
                   }} 
                   className="text-[10px] font-bold text-gray-400 hover:text-blue-500"
               >COPY ALL LOGS</button>
               <button 
                   onClick={handleLoadMockData}
                   className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
               >
                 <Database size={10} /> FORCE LOAD MOCK DATA
               </button>
            </div>
            <span className="text-[10px] font-bold text-gray-300">CUTEBI V1.0 DEBUG</span>
          </div>
        </div>
      )}
    </div>
  );
}
