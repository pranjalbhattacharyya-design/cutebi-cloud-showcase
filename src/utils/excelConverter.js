/**
 * excelConverter.js
 * 
 * Converts .xlsx / .xls files to CSV entirely in the browser using SheetJS.
 * This completely eliminates server-side Excel parsing, which was causing
 * Vercel FUNCTION_INVOCATION_FAILED errors (timeout / openpyxl not installed).
 * 
 * The result is a File object (CSV) that the backend can process with
 * DuckDB's native read_csv_auto(), which is extremely fast (<1 second).
 */

/**
 * Returns true if the file is an Excel file that needs client-side conversion.
 */
export function isExcelFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  return ext === 'xlsx' || ext === 'xls';
}

/**
 * Convert an Excel File → CSV File in the browser using SheetJS.
 * 
 * @param {File} file - The xlsx/xls File object from a file input
 * @returns {Promise<File>} - A new File object with .csv extension, same base name
 */
export async function convertExcelToCSV(file) {
  // Dynamic import so SheetJS (~900KB) only loads when needed
  const XLSX = await import('xlsx');

  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  // Use the first sheet
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to CSV string (SheetJS handles dates, numbers, strings correctly)
  const csvString = XLSX.utils.sheet_to_csv(worksheet, {
    blankrows: false,   // skip completely empty rows
    defval: '',         // empty cells become empty string (not undefined)
    dateNF: 'YYYY-MM-DD', // Force ISO dates so DuckDB TRY_CAST(x AS DATE) works for YTD/LYTD
  });

  if (!csvString || csvString.trim().length === 0) {
    throw new Error(`Excel file "${file.name}" appears to be empty.`);
  }

  // Create a new File blob with .csv extension but the same base filename
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const csvBlob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const csvFile = new File([csvBlob], `${baseName}.csv`, { type: 'text/csv' });

  console.log(`[ExcelConverter] Converted "${file.name}" → "${csvFile.name}" (${csvFile.size} bytes, ${csvString.split('\n').length} rows)`);
  return csvFile;
}

/**
 * Pre-process a list of files, converting any Excel files to CSV first.
 * Non-Excel files (CSV, TXT) are returned unchanged.
 * 
 * @param {File[]} files
 * @param {(msg: string) => void} [onProgress] - Optional callback for status messages
 * @returns {Promise<File[]>} - Array of files ready for upload (all CSV/TXT)
 */
export async function preprocessFilesForUpload(files, onProgress) {
  const result = [];
  for (const file of files) {
    if (isExcelFile(file)) {
      onProgress?.(`⚙️ Converting "${file.name}" to CSV...`);
      try {
        const csvFile = await convertExcelToCSV(file);
        result.push(csvFile);
        onProgress?.(`✅ Converted "${file.name}" → CSV (${(csvFile.size / 1024).toFixed(0)} KB)`);
      } catch (err) {
        console.error(`[ExcelConverter] Failed to convert ${file.name}:`, err);
        throw new Error(`Failed to read Excel file "${file.name}": ${err.message}`);
      }
    } else {
      result.push(file);
    }
  }
  return result;
}
