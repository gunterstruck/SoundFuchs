/**
 * Öffentlicher Produktionswächter.
 *
 * Er prüft nicht den lokalen Build, sondern die wirklich ausgelieferte PWA:
 * Identität, Sicherheits-/Cache-Header, Manifest, Update-Worker und – wenn
 * SOUNDFUCHS_EXPECTED_SHA gesetzt ist – den erwarteten Git-Commit.
 */

const basis = (process.env.SOUNDFUCHS_URL || 'https://soundfuchs.vercel.app').replace(/\/$/, '');
const erwartet = process.env.SOUNDFUCHS_EXPECTED_SHA?.trim().toLowerCase();
const fehler = [];

function pruefe(name, bedingung, detail = '') {
  const gut = Boolean(bedingung);
  console.log(`${gut ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!gut) fehler.push(name);
}

async function hole(pfad) {
  const antwort = await fetch(`${basis}${pfad}`, {
    headers: { 'cache-control': 'no-cache' },
    redirect: 'follow',
  });
  const text = await antwort.text();
  return { antwort, text };
}

const start = await hole('/');
pruefe('Startseite antwortet', start.antwort.ok, `${start.antwort.status}`);
pruefe('Startseite ist SoundFuchs', /<title>[^<]*SoundFuchs/i.test(start.text));
pruefe(
  'Clickjacking-Schutz ist aktiv',
  start.antwort.headers.get('x-frame-options')?.toUpperCase() === 'DENY'
);
pruefe(
  'MIME-Sniffing ist gesperrt',
  start.antwort.headers.get('x-content-type-options')?.toLowerCase() === 'nosniff'
);
pruefe(
  'Referrer-Policy ist gesetzt',
  start.antwort.headers.get('referrer-policy') === 'strict-origin-when-cross-origin'
);

const manifest = await hole('/manifest.webmanifest');
pruefe('PWA-Manifest antwortet', manifest.antwort.ok, `${manifest.antwort.status}`);
let manifestJson;
try {
  manifestJson = JSON.parse(manifest.text);
} catch {
  manifestJson = null;
}
pruefe('PWA-Manifest nennt SoundFuchs', manifestJson?.short_name === 'SoundFuchs');

const worker = await hole('/service-worker.js');
pruefe('Service Worker antwortet', worker.antwort.ok, `${worker.antwort.status}`);
pruefe('Service Worker überspringt den Wartestand', worker.text.includes('self.skipWaiting()'));
pruefe('Service Worker übernimmt offene Seiten', worker.text.includes('clientsClaim()'));
pruefe(
  'Service Worker wird nicht dauerhaft gecacht',
  /no-cache|no-store/.test(worker.antwort.headers.get('cache-control') || ''),
  worker.antwort.headers.get('cache-control') || 'kein Cache-Control'
);

const version = await hole('/version.json');
pruefe('Build-Information antwortet', version.antwort.ok, `${version.antwort.status}`);
let build;
try {
  build = JSON.parse(version.text);
} catch {
  build = null;
}
pruefe('Build-Information enthält eine Revision', /^[0-9a-f]{40}$/i.test(build?.revision || ''));
pruefe(
  'Build-Information wird nicht dauerhaft gecacht',
  /no-cache|no-store/.test(version.antwort.headers.get('cache-control') || ''),
  version.antwort.headers.get('cache-control') || 'kein Cache-Control'
);

if (erwartet) {
  pruefe(
    'Erwarteter Git-Stand ist ausgeliefert',
    build?.revision?.toLowerCase() === erwartet,
    `erwartet ${erwartet.slice(0, 7)}, gefunden ${String(build?.revision || '—').slice(0, 7)}`
  );
} else if (build?.revision) {
  console.log(
    `  Produktion: ${build.revision.slice(0, 7)} · ${build.builtAt || 'Bauzeit unbekannt'}`
  );
}

if (fehler.length) {
  console.error(`\n${fehler.length} Produktionsprüfungen fehlgeschlagen.`);
  process.exit(1);
}

console.log('\n✓ Die öffentliche PWA ist erreichbar und konsistent ausgeliefert.');
