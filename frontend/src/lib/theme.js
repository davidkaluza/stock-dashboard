// Gespeicherte Farben und Schrift vor dem ersten Rendern anwenden,
// damit auch der Login-Bildschirm im eigenen Farbschema erscheint.
const VARS = {
  background: '--bg-background',
  surface: '--bg-surface',
  accent: '--clr-accent',
  muted: '--clr-muted',
  pos: '--clr-pos',
  neg: '--clr-neg',
  posLight: '--clr-pos-light',
  negLight: '--clr-neg-light',
};

export function applyStoredTheme() {
  try {
    const root = document.documentElement;
    const colors = JSON.parse(localStorage.getItem('colorSettings') || '{}');
    for (const [key, cssVar] of Object.entries(VARS)) {
      if (typeof colors[key] === 'string') root.style.setProperty(cssVar, colors[key]);
    }
    const font = localStorage.getItem('fontFamily');
    if (font) root.style.setProperty('--font-family', font);
    const scale = parseInt(localStorage.getItem('fontScale') || '', 10);
    if (Number.isFinite(scale)) root.style.fontSize = `${16 * Math.min(140, Math.max(80, scale)) / 100}px`;
  } catch {
    /* localStorage nicht verfügbar – Standardfarben bleiben */
  }
}
