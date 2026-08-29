import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const screenshotDir = join(root, 'public/docs/screenshots');
const expectedScreenshots = [
  'BILD-START-01-beispieldaten.png',
  'BILD-START-02-standort-anlegen.png',
  'BILD-SCHULUNG-01-fuenf-live-demos.png',
  'BILD-NORMAL-01-normalzustand-und-pruefung.png',
  'BILD-UNTERSCHIED-01-hoerlupe.png',
  'BILD-IMPORT-01-handyfilm-mitbringen.png',
  'BILD-ERKENNEN-01-lokaler-treffer.png',
  'BILD-BRIEFING-01-lokal-vorbereiten.png',
];
const requiredFiles = [
  'docs/guide-ki-wissensbasis.md',
  'docs/schulung-soundfuchs.md',
  'docs/kurzanleitung-soundfuchs.md',
  'docs/bildanleitung-soundfuchs.md',
  'docs/guided-agent-systemprompt.txt',
  'SoundFuchs_KI-Agent_Wissensbasis.pdf',
  'tools/docs-previews.mjs',
  'tools/docs-screenshots.mjs',
];
const failures = [];
const requireCondition = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const relative of requiredFiles) {
  requireCondition(existsSync(join(root, relative)), `Datei fehlt: ${relative}`);
}

function webpDimensions(webp) {
  if (webp.toString('ascii', 0, 4) !== 'RIFF' || webp.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  let offset = 12;
  while (offset + 8 <= webp.length) {
    const type = webp.toString('ascii', offset, offset + 4);
    const size = webp.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === 'VP8 ' && data + 10 <= webp.length) {
      return {
        width: webp.readUInt16LE(data + 6) & 0x3fff,
        height: webp.readUInt16LE(data + 8) & 0x3fff,
      };
    }
    if (type === 'VP8L' && data + 5 <= webp.length) {
      const b1 = webp[data + 1];
      const b2 = webp[data + 2];
      const b3 = webp[data + 3];
      const b4 = webp[data + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
      };
    }
    if (type === 'VP8X' && data + 10 <= webp.length) {
      return {
        width: 1 + webp.readUIntLE(data + 4, 3),
        height: 1 + webp.readUIntLE(data + 7, 3),
      };
    }
    offset = data + size + (size % 2);
  }
  return null;
}

const catalog = readFileSync(join(root, 'docs/bildanleitung-soundfuchs.md'), 'utf8');
for (const name of expectedScreenshots) {
  const path = join(screenshotDir, name);
  requireCondition(existsSync(path), `Screenshot fehlt: ${name}`);
  if (!existsSync(path)) continue;
  const png = readFileSync(path);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  requireCondition(width === 390 && height === 844, `${name}: ${width}x${height}, erwartet 390x844`);
  requireCondition(catalog.includes(name), `Bildkatalog nennt ${name} nicht`);
  requireCondition(
    catalog.includes(`https://soundfuchs.vercel.app/docs/screenshots/${name}`),
    `Original-URL fehlt für ${name}`,
  );
  const previewName = name.replace(/\.png$/i, '-preview.webp');
  const previewPath = join(screenshotDir, previewName);
  requireCondition(existsSync(previewPath), `WebP-Vorschau fehlt: ${previewName}`);
  if (!existsSync(previewPath)) continue;
  const preview = readFileSync(previewPath);
  const dimensions = webpDimensions(preview);
  requireCondition(
    dimensions?.width === 390 && dimensions?.height === 844,
    `${previewName}: ${dimensions?.width}x${dimensions?.height}, erwartet 390x844`,
  );
  requireCondition(
    catalog.includes(`https://soundfuchs.vercel.app/docs/screenshots/${previewName}`),
    `Vorschau-URL fehlt für ${previewName}`,
  );
  requireCondition(preview.length < png.length, `${previewName} ist nicht kleiner als das PNG`);
}

const expectedNames = new Set(expectedScreenshots);
const expectedPreviews = new Set(
  expectedScreenshots.map((name) => name.replace(/\.png$/i, '-preview.webp')),
);
for (const name of readdirSync(screenshotDir).filter((entry) => entry.endsWith('.png'))) {
  requireCondition(expectedNames.has(name), `Nicht katalogisierter Screenshot: ${name}`);
}
for (const name of readdirSync(screenshotDir).filter((entry) => entry.endsWith('.webp'))) {
  requireCondition(expectedPreviews.has(name), `Nicht katalogisierte Vorschau: ${name}`);
}

const knowledgeDocPaths = [
  'docs/guide-ki-wissensbasis.md',
  'docs/schulung-soundfuchs.md',
  'docs/kurzanleitung-soundfuchs.md',
];
const knowledgeDocs = knowledgeDocPaths.map((relative) =>
  readFileSync(join(root, relative), 'utf8'),
);
for (const [index, document] of knowledgeDocs.entries()) {
  requireCondition(document.includes('Normalzustand'), `${knowledgeDocPaths[index]}: Normalzustand fehlt`);
  requireCondition(document.includes('Briefing'), `${knowledgeDocPaths[index]}: Briefing fehlt`);
  requireCondition(
    document.includes(`App-Version: ${appVersion}`),
    `${knowledgeDocPaths[index]}: App-Version ${appVersion} fehlt`,
  );
  for (const match of document.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|data:)/.test(target)) continue;
    const resolved = resolve(root, dirname(knowledgeDocPaths[index]), decodeURIComponent(target));
    requireCondition(existsSync(resolved), `${knowledgeDocPaths[index]}: Bildlink fehlt: ${target}`);
  }
}

const guide = knowledgeDocs[0];
requireCondition(
  guide.includes('kein technisches oder medizinisches Diagnosesystem'),
  'Guide: Diagnosegrenze fehlt',
);
requireCondition(guide.includes('GMIA'), 'Guide: GMIA fehlt');
requireCondition(guide.includes('fünf Mini-Schulungen'), 'Guide: Mini-Schulungen fehlen');
requireCondition(guide.includes('Vercel'), 'Guide: Netzwerktransparenz fehlt');

const prompt = readFileSync(join(root, 'docs/guided-agent-systemprompt.txt'), 'utf8');
const utf16Length = prompt.length;
const codePointLength = [...prompt].length;
requireCondition(utf16Length <= 7900, `Systemprompt hat ${utf16Length} UTF-16-Zeichen (maximal 7900)`);
requireCondition(codePointLength <= 7900, `Systemprompt hat ${codePointLength} Codepoints (maximal 7900)`);
requireCondition(prompt.includes('kein technisches oder medizinisches Diagnosesystem'), 'Systemprompt: Diagnosegrenze fehlt');
requireCondition(prompt.includes('keine ehrliche Abweichungs-Prozentzahl'), 'Systemprompt: Einzelaufnahme-Grenze fehlt');
requireCondition(prompt.includes('lädt aber nichts hoch'), 'Systemprompt: Briefing-Datengrenze fehlt');
requireCondition(prompt.includes('SoundFuchs_KI-Agent_Wissensbasis.pdf'), 'Systemprompt: native Bildquelle fehlt');
requireCondition(prompt.includes('display(image)'), 'Systemprompt: native Bildausgabe fehlt');
requireCondition(prompt.includes('immer vollständig als Text'), 'Systemprompt: Text-vor-Bild-Regel fehlt');
requireCondition(prompt.includes('genau ein Bild'), 'Systemprompt: Ein-Bild-Regel fehlt');
requireCondition(prompt.includes('BILD-BRIEFING'), 'Systemprompt: echte Bild-IDs fehlen');

if (failures.length) {
  console.error(`Dokumentationsprüfung fehlgeschlagen (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Dokumentationsprüfung erfolgreich: ${expectedScreenshots.length} Screenshots; ` +
    `Systemprompt ${utf16Length} UTF-16-Zeichen / ${codePointLength} Codepoints.`,
);
