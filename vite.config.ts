import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// Die App wird unter dem Wurzelpfad ausgeliefert (soundfuchs.vercel.app).
//
// Hier stand bis zum 13.08.2026 eine Weiche: GitHub Pages brauchte den
// Unterpfad /SoundFuchs/, Vercel die Wurzel. Der Pages-Weg ist entfallen –
// er scheiterte, seit das Repository privat ist, und zwei Ziele fuer
// dieselbe App bedeuten zwei Staende, die auseinanderlaufen.
const base = '/';

export default defineConfig({
  base,
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
        name: 'SoundFuchs – Maschinen anhören',
        short_name: 'SoundFuchs',
        // Ohne diese Angabe schrieb das Manifest 'en', obwohl die Oberfläche
        // deutsch ist. Betriebssysteme nutzen den Wert unter anderem für die
        // Sortierung im App-Verzeichnis und die Sprachausgabe des Namens.
        lang: 'de',
        description: 'Maschinengeräusche lokal am Gerät vergleichen – Vergleich statt Diagnose.',
        theme_color: '#0d9488',
        background_color: '#f8fafc',
        display: 'standalone',
        scope: base,
        start_url: base,
        // Zwei Fassungen desselben Bildes, weil Android Startbildschirm-Symbole
        // zuschneidet – Kreis, Tropfen oder Quadrat, je nach Hersteller.
        //
        //   purpose 'any'      volle Fläche, wird unverändert angezeigt
        //   purpose 'maskable' um 20 % verkleinert, verträgt jeden Zuschnitt
        //
        // Ohne die zweite Fassung schneidet ein Kreiszuschnitt dem Fuchs die
        // Ohrspitzen ab. Beide Angaben sind nötig: Ein Symbol nur als
        // 'maskable' zu liefern, lässt es dort zu klein wirken, wo gar nicht
        // zugeschnitten wird.
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Keep the PWA install lean: do NOT precache the large TF.js chunk
        // (~1.9 MB, only needed for the optional YAMNet engine). It is loaded on
        // demand and cached at runtime below. Users of GMIA / spectral-cosine
        // never download it. The chunk has a stable name (manualChunks → 'tfjs').
        // Dasselbe für Leaflet (~150 KB Code + 16 KB Stylesheet): Es wird nur
        // gebraucht, wenn jemand die Kundenkarte öffnet, und die setzt voraus,
        // dass überhaupt ein Kunde angelegt wurde. Wer nur Maschinen prüft,
        // lädt kein Byte davon. Der Name des Bündels ist stabil (manualChunks
        // → 'leaflet'), das Stylesheet erbt ihn.
        globIgnores: ['**/tfjs-*.js', '**/leaflet-*.js', '**/leaflet-*.css'],
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
            // Leaflet nach demselben Muster: nicht im Vorrat, aber nach dem
            // ersten Öffnen der Karte dauerhaft da. Eine feste Fassung ändert
            // sich nicht mehr — deshalb CacheFirst.
            urlPattern: /\/assets\/leaflet-.*\.(js|css)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lazy-map-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // PLZ-Daten (~400 KB) genauso: nicht im Vorrat, aber nach dem
            // ersten Gebrauch dauerhaft da. Wer nie einen Kunden anlegt, lädt
            // sie nie; wer einen anlegt, kann danach auch ohne Empfang
            // verorten. Die Dateien ändern sich praktisch nie — deshalb
            // CacheFirst statt StaleWhileRevalidate.
            urlPattern: /\/geodata\/.*\.json$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'geodata-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
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
          // Leaflet ebenso: eigenes Bündel mit festem Namen, damit die Regeln
          // oben (globIgnores + runtimeCaching) daran greifen können. Ohne den
          // festen Namen hinge das Auslassen aus dem Vorrat daran, wie Rollup
          // die Datei zufällig benennt.
          if (id.includes('node_modules/leaflet')) {
            return 'leaflet';
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
