import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages serves the project under its repository name.
  base: '/legionowo-transit/',
  // The page lives with the sources; static files and the open data stay in public/.
  root: 'src',
  publicDir: '../public',
  build: { outDir: '../dist', emptyOutDir: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Wyjdź na autobus · Legionowo (nieoficjalne)',
        short_name: 'Wyjdź na D',
        description: 'Kiedy wyjść na darmowy autobus D w Legionowie. Aplikacja nieoficjalna.',
        lang: 'pl',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1f2937',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell works offline. Timetable and status are fetched fresh and kept
        // by the app itself, so a service worker never serves them stale.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        cleanupOutdatedCaches: true,
        // Opening the data file must show the file, not the app.
        navigateFallbackDenylist: [/\/data\//],
      },
    }),
  ],
});
