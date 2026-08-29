import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'guided-agent-upload');
const sources = [
  ['docs/guide-ki-wissensbasis.md', 'guide-ki-wissensbasis.md'],
  ['docs/schulung-soundfuchs.md', 'schulung-soundfuchs.md'],
  ['docs/kurzanleitung-soundfuchs.md', 'kurzanleitung-soundfuchs.md'],
  ['docs/bildanleitung-soundfuchs.md', 'bildanleitung-soundfuchs.md'],
  ['docs/guided-agent-systemprompt.txt', 'guided-agent-systemprompt.txt'],
  ['SoundFuchs_KI-Agent_Wissensbasis.pdf', 'SoundFuchs_KI-Agent_Wissensbasis.pdf'],
];

mkdirSync(target, { recursive: true });
for (const [source, name] of sources) copyFileSync(join(root, source), join(target, name));

const guide = readFileSync(join(root, 'docs/guide-ki-wissensbasis.md'), 'utf8');
const version = guide.match(/^\*\*Version\s+([^·*\n]+)/m)?.[1]?.trim() ?? 'unbekannt';
const appVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
writeFileSync(
  join(target, 'README.md'),
  `# SoundFuchs - Export für den Guided Agent\n\n` +
    `Generierter Uploadstand: Wissensbasis ${version}, App ${appVersion}.\n\n` +
    `Diese Kopien nicht direkt bearbeiten. Quellen liegen unter \`docs/\` und im Repository-Stamm. ` +
    `Nach Änderungen zuerst \`npm run docs:pdf\` und danach \`npm run docs:guided-upload\` ausführen.\n\n` +
    `1. Den Inhalt von \`guided-agent-systemprompt.txt\` in das Anweisungsfeld kopieren.\n` +
    `2. Die vier Markdown-Dateien und die PDF als Wissen hochladen.\n` +
    `3. Testfragen stellen, etwa: „Wie lege ich meinen ersten Normalzustand an?“ und „Lädt SoundFuchs mein Geräusch hoch?“\n\n` +
    `Die PDF enthält zusätzlich den visuellen Bildanhang. Alle Bilder verwenden ausschließlich Demo- oder synthetische Daten.\n`,
  'utf8',
);

console.log(`Guided-Agent-Uploadordner aktualisiert: ${target}`);
