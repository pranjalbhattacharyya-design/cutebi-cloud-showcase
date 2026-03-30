export const parseFileAsync = (file) => new Promise((resolve, reject) => {
  const isCSV = file.name.endsWith('.csv') || file.name.endsWith('.txt');
  const reader = new FileReader();
 
  const splitCSV = (str) => {
      const result = [];
      let inQuotes = false;
      let current = '';
      for (let i = 0; i < str.length; i++) {
          const char = str[i];
          if (char === '"' || char === "'") {
              inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
              result.push(current);
              current = '';
          } else {
              current += char;
          }
      }
      result.push(current);
      return result.map(v => v.trim().replace(/['"]/g, ''));
  };

  reader.onload = async (event) => {
    try {
      if (isCSV) {
        const text = event.target.result;
        const lines = text.split('\n').filter(l => l.trim() !== '');
        if (lines.length < 2) return resolve(null);
        const headers = splitCSV(lines[0]);
        // Return a small sample for the semantic modeler
        const sampleData = lines.slice(1, 5).map(line => {
          const values = splitCSV(line);
          let row = {};
          headers.forEach((header, index) => {
            const val = values[index];
            // Attempt to parse number
            if (val !== undefined && val !== '' && !isNaN(val) && val.trim() !== '') {
               row[header] = Number(val);
            } else {
               row[header] = val;
            }
          });
          return row;
        });
        
        // Return both the sample for UI and the raw info for DuckDB
        const buffer = new TextEncoder().encode(text).buffer;
        resolve({ headers, data: sampleData, buffer, file });
      } else {
        const XLSX = await loadXLSX();
        const arrayBuffer = event.target.result;
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (jsonData.length > 1) {
          const headers = jsonData[0].map(h => String(h).trim());
          const rows = jsonData.slice(1, 5).map(rowArr => {
            let row = {};
            headers.forEach((h, i) => {
              row[h] = rowArr[i];
            });
            return row;
          });
          // raw: false so Excel dates come as formatted strings (not serial numbers)
          // dateNF hint helps but may be overridden by the cell's own format
          const rawRows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: null, dateNF: 'YYYY-MM-DD' });
          const cleanedRows = rawRows.map(row => {
             const newRow = {};
             for (const key in row) {
                const k = String(key).trim();
                const v = row[key];
                if (v === null || v === undefined || v === '') { newRow[k] = null; continue; }
                
                const str = String(v).trim();
                
                // Already ISO date format (YYYY-MM-DD) – keep as string
                if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
                   newRow[k] = str;
                   continue;
                }
                
                // Try as a plain number first (strip commas for thousands separators)
                const stripped = str.replace(/,/g, '');
                const asNum = Number(stripped);
                if (!isNaN(asNum) && stripped !== '') {
                   newRow[k] = asNum;
                   continue;
                }
                
                // Try to parse as any recognizable date string (e.g. "Wednesday, September 27, 2023")
                const dateAttempt = new Date(str);
                if (!isNaN(dateAttempt.getTime()) && /[a-zA-Z]/.test(str)) {
                   // Convert to ISO date string that DuckDB can parse
                   newRow[k] = dateAttempt.toISOString().split('T')[0];
                   continue;
                }
                
                newRow[k] = str;
             }
             return newRow;
          });
          const jsonText = JSON.stringify(cleanedRows);
          const jsonBuffer = new TextEncoder().encode(jsonText).buffer;
          resolve({ headers, data: rows, buffer: jsonBuffer, file, isExcel: true });
        } else {
          resolve(null);
        }
      }
    } catch (e) {
      reject(e);
    }
  };
  reader.onerror = reject;
  if (isCSV) reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
});

export const loadXLSX = async () => {
  if (window.XLSX) return window.XLSX;
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    document.head.appendChild(script);
  });
};
