import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages liefert die App unter https://<user>.github.io/<repo>/ aus.
// VITE_BASE überschreibt den Pfad (z. B. '/' für eine eigene Domain).
export default defineConfig(({ command, isPreview }) => {
  const isDevServer = command === 'serve' && !isPreview;
  const base = isDevServer ? '/' : (process.env.VITE_BASE || '/stock-dashboard/');
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        strategies: 'injectManifest', // eigener Service Worker (src/sw.js) – nötig für Push
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
        manifest: {
          name: 'Stock Dashboard',
          short_name: 'Stocks',
          description: 'Depotübersicht mit Kursen von Yahoo Finance',
          lang: 'de',
          start_url: base,
          scope: base,
          display: 'standalone',
          background_color: '#14171C',
          theme_color: '#14171C',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    test: {
      include: ['src/**/*.test.js'],
    },
  };
});
