/**
 * Stylesheets als Baustein.
 *
 * Vite kann `import 'x.css'` — TypeScript weiß das nicht und meldet ein
 * fehlendes Modul. Diese Zeile schließt die Lücke. Gebraucht wird sie für
 * `leaflet/dist/leaflet.css`, das zusammen mit Leaflet erst beim Öffnen der
 * Karte geholt wird; ein fester Import würde es in das Startpaket ziehen und
 * damit genau das aufheben, weswegen die Karte nachgeladen wird.
 */
declare module '*.css';
