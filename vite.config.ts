import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// Dynamic base path: GitHub Pages uses /Zanobot/, Vercel uses /
const base = process.env.DEPLOY_TARGET === 'github-pages' ? '/Zanobot/' : '/';

export default defineConfig({
  base,  // Dynamic: /Zanobot/ for GitHub Pages, / for Vercel
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, './src/core'),
      '@data': path.resolve(__dirname, './src/data'),
      '@ui': path.resolve(__dirname, './src/ui'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
  plugins: [
    VitePWA({
      filename: 'service-worker.js',
      registerType: 'autoUpdate',
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
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
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
        }
      }
    }
  },
  server: {
    port: 3000,
    strictPort: false,
    open: true
  }
});
