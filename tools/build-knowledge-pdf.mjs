/** Erzeugt die visuelle PDF-Wissensbasis samt aktuellem Bildanhang. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'docs/guide-ki-wissensbasis.md');
const IMAGE_DIR = resolve(ROOT, 'public/docs/screenshots');
const WORK = resolve(ROOT, 'tmp/pdfs/soundfuchs-wissensbasis');
const OUTPUT = resolve(ROOT, 'SoundFuchs_KI-Agent_Wissensbasis.pdf');
const PACKAGE = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

async function optionalImport(packageName, explicitPath, help) {
  try {
    return await import(packageName);
  } catch (originalError) {
    if (explicitPath) return import(pathToFileURL(explicitPath).href);
    throw new Error(`${help} (${originalError.message})`);
  }
}

const [{ marked }, { chromium }] = await Promise.all([
  optionalImport(
    'marked',
    process.env.MARKED_MODULE_PATH,
    'Marked fehlt. Einmalig `npm i -D marked` ausführen.',
  ),
  optionalImport(
    'playwright',
    process.env.PLAYWRIGHT_MODULE_PATH,
    'Playwright fehlt. Einmalig `npm i -D playwright` ausführen.',
  ),
]);

function pdfSafeText(value) {
  return String(value)
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
    .replace(/\u00a0/g, ' ');
}

function imageTitle(fileName) {
  return fileName.replace(/\.png$/i, '').replace(/-/g, ' ');
}

const sourceMarkdown = readFileSync(SOURCE, 'utf8');
const guideVersion = sourceMarkdown.match(/^\*\*Version\s+([^·*\n]+)/m)?.[1]?.trim() ?? PACKAGE.version;
const captureDate = sourceMarkdown.match(/Stand:\s*(\d{2}\.\d{2}\.\d{4})/)?.[1] ?? '29.08.2026';
const content = await marked.parse(pdfSafeText(sourceMarkdown), { gfm: true });
const imageFiles = readdirSync(IMAGE_DIR).filter((name) => /\.png$/i.test(name)).sort();
const appendix = imageFiles
  .map(
    (name) => `
      <article class="visual-page">
        <h2>${imageTitle(name)}</h2>
        <img src="${pathToFileURL(resolve(IMAGE_DIR, name)).href}" alt="${imageTitle(name)}">
        <p>App-Version ${PACKAGE.version} - Aufnahme ${captureDate} - ausschließlich Demo-/synthetische Testdaten.</p>
      </article>`,
  )
  .join('');

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${pathToFileURL(resolve(ROOT, 'docs') + '/').href}">
<title>SoundFuchs - Wissensbasis für den Guided Agent</title>
<style>
  @page { size: A4; margin: 17mm 15mm 18mm; }
  :root { color: #16202a; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.42; }
  body { margin: 0; }
  h1, h2, h3, h4 { color: #087f78; break-after: avoid; page-break-after: avoid; line-height: 1.18; }
  h1 { font-size: 24pt; margin: 0 0 12pt; }
  h2 { font-size: 17pt; margin: 22pt 0 8pt; border-bottom: 1px solid #b8d8d5; padding-bottom: 4pt; }
  h3 { font-size: 13pt; margin: 16pt 0 6pt; }
  h4 { font-size: 11pt; margin: 12pt 0 4pt; }
  p { margin: 5pt 0 8pt; orphans: 3; widows: 3; }
  ul, ol { margin: 5pt 0 10pt 18pt; padding: 0; }
  li { margin: 2pt 0; }
  blockquote { margin: 10pt 0; padding: 8pt 11pt; border-left: 4px solid #0d9488; background: #edf9f7; }
  code { font-family: Menlo, Consolas, monospace; font-size: 8.6pt; background: #f1f5f6; padding: 1pt 3pt; border-radius: 3px; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f1f5f6; border: 1px solid #d8e1e3; padding: 8pt; font-size: 8.2pt; break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0 12pt; font-size: 8.5pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #cbd8da; padding: 4pt 5pt; vertical-align: top; }
  th { background: #e6f4f2; color: #164e52; text-align: left; }
  a { color: #087f78; text-decoration: none; }
  hr { border: 0; border-top: 1px solid #cbd8da; margin: 16pt 0; }
  .visual-appendix { break-before: page; }
  .visual-intro { background: #edf9f7; border-left: 4px solid #0d9488; padding: 9pt 11pt; }
  .visual-page { break-before: page; min-width: 0; min-height: 238mm; display: flex; flex-direction: column; justify-content: flex-start; overflow: hidden; }
  .visual-page h2 { margin-top: 0; overflow-wrap: anywhere; }
  .visual-page img { width: 100%; max-height: 190mm; object-fit: contain; border: 1px solid #b8c6c9; }
  .visual-page p { color: #526473; font-size: 8.5pt; }
</style>
</head>
<body>
${content}
<section class="visual-appendix">
  <h1>Bildanhang - aktuelle App-Aufnahmen</h1>
  <p class="visual-intro">Alle Bilder stammen aus der tatsächlich laufenden SoundFuchs-App. Sie zeigen ausschließlich integrierte Demo-Daten oder temporär erzeugte synthetische Schulungsdaten. Zweck, Klickpfad und Alternativtext stehen in docs/bildanleitung-soundfuchs.md.</p>
  ${appendix}
</section>
</body>
</html>`;

mkdirSync(WORK, { recursive: true });
const htmlPath = resolve(WORK, 'wissensbasis.html');
writeFileSync(htmlPath, html, 'utf8');

const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
}
const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((done) => {
              img.addEventListener('load', done, { once: true });
              img.addEventListener('error', done, { once: true });
            }),
      ),
    );
    const broken = [...document.images]
      .filter((img) => !img.naturalWidth)
      .map((img) => img.getAttribute('src'));
    if (broken.length) throw new Error(`Nicht geladene Bilder: ${broken.join(', ')}`);
  });
  await page.pdf({
    path: OUTPUT,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="font:8px Arial;color:#60717a;width:100%;padding:0 15mm;">SoundFuchs - Guided Agent - Version ${guideVersion}</div>`,
    footerTemplate: '<div style="font:8px Arial;color:#60717a;width:100%;padding:0 15mm;text-align:right;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '17mm', right: '15mm', bottom: '18mm', left: '15mm' },
  });
  console.log(`${OUTPUT}\n${imageFiles.length} Screenshots im Bildanhang`);
} finally {
  await browser.close();
}
