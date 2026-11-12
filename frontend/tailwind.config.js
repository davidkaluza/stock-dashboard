/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-background)',
        surface: 'var(--bg-surface)',
        surface2: 'var(--bg-surface2)',
        sheet: 'var(--bg-sheet)',
        group: 'var(--bg-group)',
        control: 'var(--bg-control)',
        fg: 'var(--clr-fg)',
        line: 'var(--clr-line)',
        accent: 'var(--clr-accent)',
        'accent-fg': 'var(--clr-accent-fg)',
        muted: 'var(--clr-muted)',
        pos: 'var(--clr-pos)',
        neg: 'var(--clr-neg)',
        'pos-light': 'var(--clr-pos-light)',
        'neg-light': 'var(--clr-neg-light)',
      },
      fontSize: {
        'xs-mono': '0.78rem',
        'sm-mono': '0.9rem',
        'title-mono': '1.125rem',
        'table-mono': '0.95rem',
      },
      fontFamily: {
        mono: ['var(--font-family)', 'monospace'],
      }
    },
  },
  plugins: [],
}
