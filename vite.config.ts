import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// Dynamic base path: GitHub Pages uses /Zanobot/, Vercel uses /
const base = process.env.DEPLOY_TARGET === 'github-pages' ? '/Zanobot/' : '/';

export default defineConfig({
  base, // Dynamic: /Zanobot/ for GitHub Pages, / for Vercel
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, './src/core'),
      '@data': path.resolve(__dirname, './src/data'),
      '@ui': path.resolve(__dirname, './src/ui'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@lab': path.resolve(__dirname, './src/lab'),
    },
  },
  plugins: [
    VitePWA({
      filename: 'service-worker.js',
      // 'prompt': a new version waits instead of silently taking over, so we can
      // show a discreet "update available" prompt and only reload when the user
      // accepts AND no measurement is running. Registration is handled manually
      // (src/utils/pwaUpdate.ts), so disable the auto-injected register script.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'assets/**/*'],
      manifest: {
        name: 'Zanobo - AI Assistant',
        short_name: 'Zanobo',
        description: 'Industrial Machine Diagnostics using Acoustic Analysis',
        theme_color: '#0A1929',
        background_color: '#0A1929',
        display: 'standalone',
        scope: base,
        start_url: base,
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Keep the PWA install lean: do NOT precache the large TF.js chunk
        // (~1.9 MB, only needed for the optional YAMNet engine). It is loaded on
        // demand and cached at runtime below. Users of GMIA / spectral-cosine
        // never download it. The chunk has a stable name (manualChunks → 'tfjs').
        globIgnores: ['**/tfjs-*.js'],
        runtimeCaching: [
          {
            // On-demand caching of the lazy TF.js chunk so YAMNet works offline
            // after its first use, without bloating the install for everyone.
            urlPattern: /\/assets\/tfjs-.*\.js$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'lazy-js-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep TF.js in its own stably-named, lazily-loaded chunk so it is
          // excluded from the PWA precache (only fetched when YAMNet is used).
          if (id.includes('@tensorflow') || id.includes('node_modules/seedrandom')) {
            return 'tfjs';
          }
          // Split DSP modules into separate chunk
          if (id.includes('src/core/dsp')) {
            return 'dsp';
          }
          // Split ML modules into separate chunk
          if (id.includes('src/core/ml')) {
            return 'ml';
          }
          // Split database modules
          if (id.includes('src/data')) {
            return 'data';
          }
          // Vendor libraries (html5-qrcode, idb)
          if (id.includes('node_modules')) {
            if (id.includes('html5-qrcode')) {
              return 'vendor-qr';
            }
            if (id.includes('idb')) {
              return 'vendor-idb';
            }
          }
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    open: true,
  },
});
