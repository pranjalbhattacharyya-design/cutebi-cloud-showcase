export const THEMES = {
  cute: {
    name: 'Cute (Default)',
    '--theme-app-bg': '#f3f0fa',
    '--theme-panel-bg': '#FFFFFF',
    '--theme-text-main': '#4c1d95',
    '--theme-text-muted': '#8b5cf6',
    '--theme-border': '#f3e8ff',
    '--theme-accent': '#ec4899',
    '--theme-accent-bg': 'linear-gradient(to right, #a855f7, #ec4899)',
    '--theme-accent-text': '#ffffff',
    '--theme-font': "'Nunito', 'Segoe UI', Tahoma, sans-serif",
    '--theme-radius-panel': '0.75rem',
    '--theme-radius-button': '0.375rem',
    '--theme-shadow': '0 4px 12px rgba(0,0,0,0.05)',
    '--theme-header-bg': '#f3f4f6',
    colors: ['#FF9CEE', '#B28DFF', '#6EB5FF', '#85E3FF', '#FFF5BA', '#FFB5E8', '#AFF8DB', '#F6A6FF', '#C4FAF8', '#FFABAB']
  },
  dark: {
    name: 'Night Mode',
    '--theme-app-bg': '#0f172a',
    '--theme-panel-bg': '#1e293b',
    '--theme-text-main': '#f8fafc',
    '--theme-text-muted': '#94a3b8',
    '--theme-border': '#334155',
    '--theme-accent': '#38bdf8',
    '--theme-accent-bg': 'linear-gradient(to right, #6366f1, #06b6d4)',
    '--theme-accent-text': '#ffffff',
    '--theme-font': "'Inter', system-ui, sans-serif",
    '--theme-radius-panel': '0.75rem',
    '--theme-radius-button': '0.375rem',
    '--theme-shadow': '0 4px 12px rgba(0,0,0,0.3)',
    '--theme-header-bg': '#334155',
    colors: ['#818cf8', '#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#2dd4bf', '#fb7185', '#a3e635', '#60a5fa']
  },
  corporate: {
    name: 'Corporate Blue',
    '--theme-app-bg': '#e2e8f0',
    '--theme-panel-bg': '#ffffff',
    '--theme-text-main': '#1e293b',
    '--theme-text-muted': '#64748b',
    '--theme-border': '#cbd5e1',
    '--theme-accent': '#2563eb',
    '--theme-accent-bg': '#2563eb',
    '--theme-accent-text': '#ffffff',
    '--theme-font': "'Helvetica Neue', Helvetica, Arial, sans-serif",
    '--theme-radius-panel': '0.5rem',
    '--theme-radius-button': '0.25rem',
    '--theme-shadow': '0 1px 3px 0 rgba(0,0,0,0.1)',
    '--theme-header-bg': '#f1f5f9',
    colors: ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#0f766e', '#14b8a6', '#5eead4', '#ccfbf1', '#2563eb']
  },
  nature: {
    name: 'Nature Green',
    '--theme-app-bg': '#ecfdf5',
    '--theme-panel-bg': '#ffffff',
    '--theme-text-main': '#064e3b',
    '--theme-text-muted': '#10b981',
    '--theme-border': '#d1fae5',
    '--theme-accent': '#059669',
    '--theme-accent-bg': '#059669',
    '--theme-accent-text': '#ffffff',
    '--theme-font': "'Optima', 'Candara', serif",
    '--theme-radius-panel': '0.75rem',
    '--theme-radius-button': '0.375rem',
    '--theme-shadow': '0 4px 12px rgba(0,0,0,0.05)',
    '--theme-header-bg': '#f0fdf4',
    colors: ['#065f46', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#4d7c0f', '#84cc16', '#bef264', '#d9f99d', '#059669']
  },
  professional: {
    name: 'Professional',
    '--theme-app-bg': '#cbd5e1',
    '--theme-panel-bg': '#f8fafc',
    '--theme-text-main': '#0f172a',
    '--theme-text-muted': '#475569',
    '--theme-border': '#94a3b8',
    '--theme-accent': '#0ea5e9',
    '--theme-accent-bg': '#0284c7',
    '--theme-accent-text': '#ffffff',
    '--theme-font': "'Roboto', 'Segoe UI', Tahoma, sans-serif",
    '--theme-radius-panel': '4px',
    '--theme-radius-button': '4px',
    '--theme-shadow': '0 4px 6px rgba(0,0,0,0.1)',
    '--theme-header-bg': '#f1f5f9',
    colors: ['#0284c7', '#0369a1', '#075985', '#0c4a6e', '#38bdf8', '#7dd3fc']
  },
  cool: {
    name: 'Cool Cyber',
    '--theme-app-bg': '#000000',
    '--theme-panel-bg': '#18181b',
    '--theme-text-main': '#f4f4f5',
    '--theme-text-muted': '#a1a1aa',
    '--theme-border': '#27272a',
    '--theme-accent': '#c084fc',
    '--theme-accent-bg': 'linear-gradient(135deg, #3b82f6, #c084fc)',
    '--theme-accent-text': '#ffffff',
    '--theme-font': "'Trebuchet MS', 'Lucida Sans Unicode', sans-serif",
    '--theme-radius-panel': '16px',
    '--theme-radius-button': '8px',
    '--theme-shadow': '0 0 20px rgba(139, 92, 246, 0.2)',
    '--theme-header-bg': '#27272a',
    colors: ['#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#3b82f6', '#06b6d4']
  },
  ceo: {
    name: 'CEO Minimal',
    '--theme-app-bg': '#f3f4f6',
    '--theme-panel-bg': '#ffffff',
    '--theme-text-main': '#111111',
    '--theme-text-muted': '#6b7280',
    '--theme-border': '#e5e7eb',
    '--theme-accent': '#b8860b',
    '--theme-accent-bg': '#111111',
    '--theme-accent-text': '#d4af37',
    '--theme-font': "'Georgia', 'Playfair Display', serif",
    '--theme-radius-panel': '0px',
    '--theme-radius-button': '0px',
    '--theme-shadow': 'none',
    '--theme-header-bg': '#f9fafb',
    colors: ['#111111', '#333333', '#555555', '#777777', '#999999', '#b8860b']
  },
  retro: {
    name: 'Retro Brutal',
    '--theme-app-bg': '#d7c7a1',
    '--theme-panel-bg': '#f4ecd8',
    '--theme-text-main': '#3e2723',
    '--theme-text-muted': '#5d4037',
    '--theme-border': '#3e2723',
    '--theme-accent': '#d84315',
    '--theme-accent-bg': '#ff8f00',
    '--theme-accent-text': '#3e2723',
    '--theme-font': "'Courier New', Courier, monospace",
    '--theme-radius-panel': '0px',
    '--theme-radius-button': '0px',
    '--theme-shadow': '4px 4px 0px #3e2723',
    '--theme-header-bg': '#e3d8c1',
    colors: ['#d84315', '#ff8f00', '#2e7d32', '#1565c0', '#c62828', '#6a1b9a']
  },
  bw: {
    name: 'Black & White',
    '--theme-app-bg': '#e5e5e5',
    '--theme-panel-bg': '#ffffff',
    '--theme-text-main': '#000000',
    '--theme-text-muted': '#555555',
    '--theme-border': '#000000',
    '--theme-accent': '#000000',
    '--theme-accent-bg': '#000000',
    '--theme-accent-text': '#ffffff',
    '--theme-font': "'Helvetica Neue', Helvetica, Arial, sans-serif",
    '--theme-radius-panel': '0px',
    '--theme-radius-button': '0px',
    '--theme-shadow': 'none',
    '--theme-header-bg': '#f5f5f5',
    colors: ['#000000', '#222222', '#444444', '#666666', '#888888', '#aaaaaa']
  },
  typewriter: {
    name: 'Typewriter',
    '--theme-app-bg': '#dfd5c5',
    '--theme-panel-bg': '#fdf6e3',
    '--theme-text-main': '#1e1e1e',
    '--theme-text-muted': '#737373',
    '--theme-border': '#a1a1aa',
    '--theme-accent': '#b91c1c',
    '--theme-accent-bg': '#1e1e1e',
    '--theme-accent-text': '#fdf6e3',
    '--theme-font': "'Courier New', Courier, monospace",
    '--theme-radius-panel': '0px',
    '--theme-radius-button': '0px',
    '--theme-shadow': 'inset 0 0 0 1px #d4d4d8',
    '--theme-header-bg': '#eee8d5',
    colors: ['#1e1e1e', '#3f3f3f', '#52525b', '#71717a', '#a1a1aa', '#b91c1c']
  },
  mahindra: {
    name: 'Mahindra Automobile',
    '--theme-app-bg': '#f5f5f5',
    '--theme-panel-bg': '#ffffff',
    '--theme-text-main': '#e31837',
    '--theme-text-muted': '#5c5c5c',
    '--theme-border': '#dddddd',
    '--theme-accent': '#e31837',
    '--theme-accent-bg': '#e31837',
    '--theme-accent-text': '#ffffff',
    '--theme-font': "'Inter', system-ui, sans-serif",
    '--theme-radius-panel': '0.5rem',
    '--theme-radius-button': '0.25rem',
    '--theme-shadow': '0 2px 4px rgba(0,0,0,0.1)',
    '--theme-header-bg': '#f9fafb',
    colors: ['#e31837', '#333333', '#666666', '#999999', '#cccccc', '#ffffff']
  },
  vihaan: {
    name: 'Vihaan Enterprise',
    '--theme-app-bg': '#F0F4F8',
    '--theme-panel-bg': '#FFFFFF',
    '--theme-text-main': '#111827',
    '--theme-text-muted': '#4B5563',
    '--theme-border': '#E2E8F0',
    '--theme-accent': '#304571',
    '--theme-accent-bg': '#304571',
    '--theme-accent-text': '#FFFFFF',
    '--theme-font': "'Inter', system-ui, sans-serif",
    '--theme-radius-panel': '0.5rem',
    '--theme-radius-button': '9999px',
    '--theme-shadow': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    '--theme-header-bg': '#E1E7F5',
    colors: ['#76C8D5', '#304571', '#94A3B8', '#CBD5E1', '#E2E8F0', '#111827']
  }
};

// Global Geometry Defaults (Applied to all themes during injection)
const GEOMETRY = {
  '--radius-container': '0.5rem', // 8px
  '--radius-pill': '9999px'
};

export const applyTheme = (themeName, options = {}) => {
  const t = THEMES[themeName];
  if (!t) return;
  
  const { fontScale = 1.0, textWrap = false } = options;
  const root = document.documentElement;

  // 1. Apply Theme Variables + Geometry Tokens
  const fullTheme = { ...GEOMETRY, ...t };
  Object.keys(fullTheme).forEach(k => {
    if (k.startsWith('--')) {
      root.style.setProperty(k, fullTheme[k]);
    }
  });

  // 2. Apply Dynamic Scaling & Wrapping
  root.style.setProperty('--theme-font-scale-base', fontScale.toFixed(2));
  // Capped scale for KPIs to prevent layout break (max 1.1x)
  const kpiScale = Math.min(fontScale, 1.1).toFixed(2);
  root.style.setProperty('--theme-font-scale-kpi', kpiScale);
  
  // Logical state for wrap
  root.style.setProperty('--theme-text-wrap', textWrap ? 'normal' : 'nowrap');
  
  // Set the theme class on body for specific styling overrides
  root.className = `theme-${themeName}`;
};
