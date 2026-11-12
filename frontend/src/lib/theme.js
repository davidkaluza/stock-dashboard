// Farbschema und Schrift. Die Farben selbst stehen in index.css (data-theme), nur „custom“ wird hier gesetzt.

export const SCHEMES = [
  { id: 'system', label: 'System (iOS)', hint: 'Hell oder dunkel nach iPhone-Einstellung' },
  { id: 'gold', label: 'Gold dunkel', hint: 'Das bisherige Aussehen' },
  { id: 'custom', label: 'Eigene', hint: 'Eigene Farben wählen' },
];

export const SYSTEM_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";
const OLD_DEFAULT_FONT = "'JetBrains Mono', monospace";

// Bisherige Standardfarben (vor dem iPhone-Design) – wer sie nie geändert hat, bekommt „System“
export const OLD_DEFAULT_COLORS = {
  background: '#33312B', surface: '#33312B', accent: '#C09537', muted: '#888888',
  pos: '#22c55e', neg: '#ef4444', posLight: '#86efac', negLight: '#fca5a5',
};
export const DEFAULT_CUSTOM_COLORS = { ...OLD_DEFAULT_COLORS, surface: '#3D3A33' };

// Eigene Farben → CSS-Variablen. fg/line/surface2 werden abgeleitet (eigene Schemata sind dunkel).
const CUSTOM_VARS = {
  background: '--bg-background', surface: '--bg-surface', accent: '--clr-accent', muted: '--clr-muted',
  pos: '--clr-pos', neg: '--clr-neg', posLight: '--clr-pos-light', negLight: '--clr-neg-light',
};
const ALL_CUSTOM_PROPS = [...Object.values(CUSTOM_VARS), '--clr-line', '--bg-surface2', '--bg-sheet', '--bg-group', '--bg-control'];

const sameColors = (a, b) => Object.keys(b).every((k) => String(a?.[k] || '').toLowerCase() === b[k].toLowerCase());

/**
 * Einmalige Umstellung auf das iPhone-Design (rein, testbar):
 * {colorSettings, fontFamily} → {colorScheme, fontFamily}
 */
export function migrateDesign({ colorSettings, fontFamily }) {
  const custom = colorSettings && Object.keys(colorSettings).length && !sameColors(colorSettings, OLD_DEFAULT_COLORS);
  return {
    colorScheme: custom ? 'custom' : 'system',
    fontFamily: !fontFamily || fontFamily === OLD_DEFAULT_FONT ? SYSTEM_FONT : fontFamily,
  };
}

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* egal */ } };

/** Liest Schema/Schrift aus dem localStorage und führt die Umstellung einmalig durch. */
export function loadThemeSettings() {
  let colorSettings = {};
  try { colorSettings = JSON.parse(read('colorSettings') || '{}'); } catch { /* leer */ }
  let colorScheme = read('colorScheme');
  let fontFamily = read('fontFamily');
  if (!colorScheme) {
    const migrated = migrateDesign({ colorSettings, fontFamily });
    colorScheme = migrated.colorScheme;
    fontFamily = migrated.fontFamily;
    write('colorScheme', colorScheme);
    write('fontFamily', fontFamily);
  }
  return { colorScheme, colorSettings: { ...DEFAULT_CUSTOM_COLORS, ...colorSettings }, fontFamily: fontFamily || SYSTEM_FONT };
}

function setThemeColorMeta(scheme, colors) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const add = (content, media) => {
    const m = document.createElement('meta');
    m.name = 'theme-color';
    m.content = content;
    if (media) m.media = media;
    document.head.appendChild(m);
  };
  if (scheme === 'system') {
    add('#F2F2F7', '(prefers-color-scheme: light)');
    add('#14171C', '(prefers-color-scheme: dark)');
  } else {
    add(scheme === 'custom' ? colors.background : OLD_DEFAULT_COLORS.background);
  }
}

export function applyTheme(scheme = 'system', colors = DEFAULT_CUSTOM_COLORS) {
  const root = document.documentElement;
  root.dataset.theme = scheme;
  ALL_CUSTOM_PROPS.forEach((p) => root.style.removeProperty(p));
  if (scheme === 'custom') {
    for (const [key, cssVar] of Object.entries(CUSTOM_VARS)) {
      if (colors[key]) root.style.setProperty(cssVar, colors[key]);
    }
    root.style.setProperty('--clr-line', colors.muted || '#5A5548');
    root.style.setProperty('--bg-surface2', colors.surface || colors.background);
    root.style.setProperty('--bg-sheet', colors.background);
    root.style.setProperty('--bg-group', colors.surface || colors.background);
    root.style.setProperty('--bg-control', colors.muted || '#5A5548');
  }
  setThemeColorMeta(scheme, colors);
}

export function applyFont(fontFamily = SYSTEM_FONT, fontScale) {
  const root = document.documentElement;
  root.style.setProperty('--font-family', fontFamily);
  if (Number.isFinite(fontScale)) root.style.fontSize = `${16 * Math.min(140, Math.max(80, fontScale)) / 100}px`;
}

/** Vor dem ersten Rendern (main.jsx): gespeichertes Schema und Schrift anwenden. */
export function applyStoredTheme() {
  try {
    const { colorScheme, colorSettings, fontFamily } = loadThemeSettings();
    applyTheme(colorScheme, colorSettings);
    applyFont(fontFamily, parseInt(read('fontScale') || '', 10));
  } catch {
    /* Standardfarben bleiben */
  }
}
