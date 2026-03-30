// useChartData is a thin wrapper around useDataEngine.
// All chart data computation lives in useDataEngine to avoid
// duplicating joinedDataMap / maxDatesCache logic.
export { useDataEngine as useChartData } from './useDataEngine';
