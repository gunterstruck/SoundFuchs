/**
 * Zwei Oberflächen, kein drittes Gesicht.
 *
 * **Stamm.** Übernommen aus TourFuchs `tests/faces.test.js` (Stand
 * `19b3951`), nach Vitest/TypeScript geschrieben.
 *
 * Die verbindliche Regel:
 *
 *   Tablet hochkant = Mobile View, vollständig.
 *   Tablet quer     = Desktop View, vollständig.
 *   Dazwischen gibt es nichts.
 *
 * Geprüft wird nicht das Aussehen — das gehört ans Auge und an
 * `npm run stammvergleich`. Geprüft wird die Struktur: **welche Medienabfragen
 * es überhaupt gibt** und **für wen sie greifen**. Denn eine dritte Oberfläche
 * entsteht nie durch eine Absicht, sondern immer durch eine vierte Schwelle,
 * die jemand für einen Einzelfall einzieht.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DESKTOP_FACE_MEDIA, faceFor, PHONE_FACE_MEDIA } from './viewport.js';

const lies = (datei: string): string => readFileSync(resolve(process.cwd(), datei), 'utf8');

const STIL_ORT = 'src/styles';

/** Alle Stilblätter, auch die in Unterordnern — dort liegt der Stamm. */
function alleCss(ort: string): string[] {
  return readdirSync(resolve(process.cwd(), ort)).flatMap((eintrag) => {
    const pfad = join(ort, eintrag);
    if (statSync(resolve(process.cwd(), pfad)).isDirectory()) return alleCss(pfad);
    return pfad.endsWith('.css') ? [pfad] : [];
  });
}

/**
 * Zwei Sorten Stilblatt, zwei Maßstäbe.
 *
 * `src/styles/stamm/` und alles, was die Schale gestaltet, muss die
 * Gesichtsregel einhalten: keine Abfrage, die über die Grenze greift.
 *
 * `src/styles/style.css` ist die bisherige SoundFuchs-Oberfläche hinter dem
 * Scharnier. Sie ist noch nicht überführt und hat eigene Schwellen bei 768 und
 * 900 — Regeln über die Breite einer scrollenden Seite, keine Gesichtsfragen.
 * Sie hier mitzuprüfen hieße, den ganzen Umbau der Maschinenebene in diesen
 * Auftrag hineinzuziehen.
 *
 * Sie kommt trotzdem nicht ungeprüft davon: Der Block „Die alte Oberfläche
 * greift nicht in die Schale" weiter unten stellt ihr die Frage, die hier
 * wirklich zählt — ob eine ihrer Abfragen ein Element des Stamms anfasst.
 */
const ALLE_STILBLAETTER = alleCss(STIL_ORT);
const ALTE_OBERFLAECHE = 'src/styles/style.css';
const STILBLAETTER = ALLE_STILBLAETTER.filter((d) => d !== ALTE_OBERFLAECHE);

/* ---------------------------------------------------------------------------
   Ein winziger Auswerter für Medienabfragen.

   Zeichenketten zu vergleichen fängt nur die Schreibweise; hier interessiert
   die **Bedeutung**. Verstanden werden Breite, Höhe und Ausrichtung – mehr
   braucht eine Gesichtsfrage nicht. Alles andere (`pointer`, `prefers-*`)
   macht eine Abfrage zu einer anderen Art von Frage; solche Preludes bleiben
   außen vor, statt hier falsch beantwortet zu werden.
--------------------------------------------------------------------------- */

interface Fenster {
  width: number;
  height: number;
}

/** Alle `@media`-Preludes einer Datei, Kommentare vorher entfernt. */
function preludes(css: string): string[] {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...ohneKommentare.matchAll(/@media([^{]+)\{/g)].map((m) =>
    m[1]!.replace(/\s+/g, ' ').trim()
  );
}

const FEATURE = /^\((min|max)-(width|height):\s*(\d+)px\)$/;
const ORIENTATION = /^\(orientation:\s*(portrait|landscape)\)$/;

/** Lässt sich das Prelude allein aus Breite, Höhe und Ausrichtung beantworten? */
function istGeometrisch(prelude: string): boolean {
  return prelude
    .split(',')
    .every((klausel) =>
      klausel
        .trim()
        .split(' and ')
        .every((teil) => FEATURE.test(teil.trim()) || ORIENTATION.test(teil.trim()))
    );
}

function trifftTeil(teil: string, { width, height }: Fenster): boolean {
  const haltung = ORIENTATION.exec(teil);
  // CSS: hochkant, sobald die Höhe die Breite erreicht – wie `faceFor()`.
  if (haltung) return (height >= width) === (haltung[1] === 'portrait');
  const treffer = FEATURE.exec(teil);
  if (!treffer) return false;
  const [, grenze, achse, roh] = treffer;
  const wert = achse === 'width' ? width : height;
  return grenze === 'min' ? wert >= Number(roh) : wert <= Number(roh);
}

/** Greift das Prelude in diesem Fenster? */
function trifft(prelude: string, fenster: Fenster): boolean {
  return prelude
    .split(',')
    .some((klausel) =>
      klausel
        .trim()
        .split(' and ')
        .every((teil) => trifftTeil(teil.trim(), fenster))
    );
}

/* ---------------------------------------------------------------------------
   Echte Geräte. Die Tablets sind der Prüfstein, die anderen sind der Maßstab,
   an dem sie gemessen werden.
--------------------------------------------------------------------------- */
const HANDY = { name: 'iPhone 15 hochkant', width: 393, height: 852 };
const SCHREIBTISCH = { name: 'Laptop', width: 1440, height: 900 };

const TABLETS_HOCHKANT = [
  { name: 'iPad mini hochkant', width: 744, height: 1133 },
  { name: 'Galaxy Tab S6 Lite hochkant', width: 800, height: 1333 },
  { name: 'iPad 11" hochkant', width: 834, height: 1194 },
  { name: 'iPad 12,9" hochkant', width: 1024, height: 1366 },
];

const TABLETS_QUER = [
  { name: 'iPad mini quer', width: 1133, height: 744 },
  { name: 'Galaxy Tab S6 Lite quer', width: 1333, height: 800 },
  { name: 'iPad 11" quer', width: 1194, height: 834 },
  { name: 'iPad 12,9" quer', width: 1366, height: 1024 },
];

/** Ein grobes Raster für die Vollständigkeitsprüfung der beiden Listen. */
const RASTER: Fenster[] = [];
for (let width = 320; width <= 1600; width += 23) {
  for (let height = 320; height <= 1600; height += 29) RASTER.push({ width, height });
}

describe('Die zwei Listen sind Verneinungen voneinander', () => {
  it('teilt jedes Fenster genau einem Gesicht zu', () => {
    // Kein Fenster darf beide Listen treffen (Regeln lägen übereinander)
    // und keines darf zwischen ihnen durchfallen (Regeln fehlten ganz).
    const beide = RASTER.filter(
      (v) => trifft(PHONE_FACE_MEDIA, v) && trifft(DESKTOP_FACE_MEDIA, v)
    );
    const keines = RASTER.filter(
      (v) => !trifft(PHONE_FACE_MEDIA, v) && !trifft(DESKTOP_FACE_MEDIA, v)
    );
    expect({ beide: beide.slice(0, 5), keines: keines.slice(0, 5) }).toEqual({
      beide: [],
      keines: [],
    });
  });

  it('stimmt mit der TypeScript-Entscheidung überein', () => {
    const abweichungen = RASTER.filter(
      (v) => (trifft(PHONE_FACE_MEDIA, v) ? 'phone' : 'desktop') !== faceFor(v)
    );
    expect(abweichungen.slice(0, 5)).toEqual([]);
  });

  it('schickt jedes Tablet an eine der beiden Oberflächen – hochkant mobil, quer Schreibtisch', () => {
    for (const tablet of TABLETS_HOCHKANT) expect(faceFor(tablet)).toBe('phone');
    for (const tablet of TABLETS_QUER) expect(faceFor(tablet)).toBe('desktop');
  });
});

describe('Kein drittes Gesicht im CSS', () => {
  const alle = STILBLAETTER.flatMap((datei) =>
    preludes(lies(datei)).map((prelude) => ({ datei, prelude }))
  );

  it('findet überhaupt Medienabfragen (sonst prüft der Rest nichts)', () => {
    expect(alle.length).toBeGreaterThan(15);
  });

  it('kennt keine Abfrage, die nur ein Tablet trifft', () => {
    // Die konkrete Vorlage, die es nicht geben darf: „769 bis 1200 Pixel im
    // Hochformat". Allgemeiner: alles, was ein Tablet erwischt, ohne das
    // Referenzgerät desselben Gesichts zu erwischen.
    const eigenbroetler = alle.filter(({ prelude }) => {
      if (!istGeometrisch(prelude)) return false;
      const hochkantNurTablet =
        TABLETS_HOCHKANT.some((t) => trifft(prelude, t)) && !trifft(prelude, HANDY);
      const querNurTablet =
        TABLETS_QUER.some((t) => trifft(prelude, t)) && !trifft(prelude, SCHREIBTISCH);
      return hochkantNurTablet || querNurTablet;
    });
    expect(eigenbroetler).toEqual([]);
  });

  it('lässt keine Abfrage über die Gesichtsgrenze hinweggreifen', () => {
    // Eine Abfrage, die Fenster aus beiden Gesichtern trifft, legt Mobile- und
    // Desktopregeln übereinander. Genau daran ist „ab 769px quer" gescheitert:
    // Ein Handy quer (880×500) traf es mit.
    const grenzgaenger = alle.filter(({ prelude }) => {
      if (!istGeometrisch(prelude)) return false;
      const treffer = RASTER.filter((v) => trifft(prelude, v));
      const gesichter = new Set(treffer.map((v) => faceFor(v)));
      return gesichter.size > 1;
    });
    expect(grenzgaenger).toEqual([]);
  });

  it('benutzt für Gesichtsfragen die beiden Listen wortgleich', () => {
    // Wer eine Schwelle des Gesichts anfasst, muss die ganze Liste
    // hinschreiben – eine halbe ist wieder eine eigene Grenze.
    const SCHWELLEN = /\b(768|769|900|901|1200|1201|520|521)px\b/;
    const eigenmaechtig = alle.filter(({ prelude }) => {
      if (!SCHWELLEN.test(prelude)) return false;
      if (prelude === PHONE_FACE_MEDIA || prelude === DESKTOP_FACE_MEDIA) return false;
      // Erlaubt ist, eine der Listen **weiter einzuschränken** (etwa auf
      // niedrige Fenster). Verboten ist, ihre Grenzen zu verschieben.
      const treffer = RASTER.filter((v) => trifft(prelude, v));
      const phone = RASTER.filter((v) => trifft(PHONE_FACE_MEDIA, v));
      const desktop = RASTER.filter((v) => trifft(DESKTOP_FACE_MEDIA, v));
      const teilmenge = (a: Fenster[], b: Fenster[]): boolean => a.every((v) => b.includes(v));
      return !(teilmenge(treffer, phone) || teilmenge(treffer, desktop));
    });
    expect(eigenmaechtig).toEqual([]);
  });

  it('hält die beiden Listen in responsive.css im Wortlaut vor', () => {
    const css = lies('src/styles/stamm/responsive.css');
    for (const liste of [PHONE_FACE_MEDIA, DESKTOP_FACE_MEDIA]) {
      for (const teil of liste.split(',').map((s) => s.trim())) {
        expect(css).toContain(teil);
      }
    }
  });

  it('hat den Tablet-Aufsatz restlos entfernt', () => {
    const css = lies('src/styles/stamm/responsive.css');
    expect(css).not.toContain('(min-width: 769px) and (max-width: 1200px)');
    // Seine Sondermaße: eigene Blatt-Höhe, eigener Griff, eigene Knopfzeile.
    expect(css).not.toContain('--mobile-sheet-peek: 52px');
    expect(css).not.toContain('min(52dvh, 640px)');
    expect(css).not.toContain('--mobile-topnav-bottom');
  });

  it('kennt --mobile-topnav-bottom nirgends mehr', () => {
    // Das Maß hatte genau einen Leser: die Karten-Knopfzeile, die nur auf dem
    // hochkanten Tablet nach oben wanderte. Ein Messwert ohne Leser ist kein
    // Vorrat, sondern eine Einladung, die Sonderregel zurückzuholen.
    for (const datei of [...ALLE_STILBLAETTER, 'src/stamm/ui/schale.ts']) {
      const inhalt = lies(datei).replace(/\/\*[\s\S]*?\*\//g, '');
      expect({ datei, treffer: inhalt.includes('--mobile-topnav-bottom') }).toEqual({
        datei,
        treffer: false,
      });
    }
  });
});

describe('Die alte Oberfläche greift nicht in die Schale', () => {
  /**
   * Die Elemente, die dem Stamm gehören.
   *
   * Der Auftrag nennt sie namentlich, und der Grund ist an jedem einzelnen
   * nachgemessen worden: `body { line-height: 1.6 }` aus `style.css` vererbte
   * sich in `.topbar` und machte aus TourFuchs' `normal` ein `24px`. Zwei
   * Wurzelregeln verkleinerten auf kurzen Fenstern die ganze Schale um ein
   * Viertel — sichtbar als 35 px hohe Kartenknöpfe statt 39.
   *
   * Beides ist behoben. Diese Prüfung hält es fest: Wer in `style.css` eine
   * Regel für eines dieser Elemente schreibt, gestaltet den Stamm um, ohne ihn
   * anzufassen — und niemand sucht den Fehler dort.
   */
  const DEM_STAMM = [
    '.topbar',
    '#sidebar',
    '#mobile-topnav',
    '#depth-switch',
    '.tabs',
    '.basemap-control',
    '.map-fab',
    '.map-fab-row',
    '#map',
  ];

  const alteRegeln = (() => {
    const css = lies(ALTE_OBERFLAECHE).replace(/\/\*[\s\S]*?\*\//g, '');
    return [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.replace(/\s+/g, ' ').trim());
  })();

  /** Sonderzeichen entschärfen, damit `.` im Selektor kein „irgendein Zeichen" wird. */
  const alsMuster = (auswahl: string): RegExp =>
    // Nachgestellte Wortgrenze, damit `.topbar` nicht auf `.topbar-mark`
    // anspringt und `#map` nicht auf `#map-empty` — beides gehört nicht dem
    // Stamm. Beim ersten Versuch stand hier eine selbstgebaute Ersetzung; sie
    // ließ ausgerechnet die Klassen durch (`\\.topbar` suchte einen echten
    // Rückstrich) und fing nur die IDs. Der Wächter meldete brav ein Leck und
    // übersah daneben ein zweites.
    new RegExp(`${auswahl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);

  it.each(DEM_STAMM)('%s wird von style.css nicht angefasst', (auswahl) => {
    const muster = alsMuster(auswahl);
    const treffer = alteRegeln.filter((sel) => muster.test(sel));
    expect({ auswahl, treffer }).toEqual({ auswahl, treffer: [] });
  });

  it('setzt die Zeilenhöhe der alten Reise an ihr selbst, nicht am Körper', () => {
    // Am Körper vererbte sie sich in die Schale hinein.
    const css = lies(ALTE_OBERFLAECHE);
    const koerper = css.slice(css.indexOf('\nbody {'), css.indexOf('\nbody {') + 260);
    expect(koerper).not.toContain('line-height');
    expect(css).toContain('.zanobo-tiefe {\n  line-height: 1.6;\n}');
  });

  it('verkleinert die Wurzelschrift nicht mehr nach Fensterhöhe', () => {
    // `rem` ist wurzelbezogen: Eine Wurzelregel trifft beide Welten, und die
    // Kopfleiste steht in beiden. Gemessen waren es 35 px hohe Kartenknöpfe
    // statt der 39 von TourFuchs.
    const css = lies(ALTE_OBERFLAECHE).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/@media[^{]*max-height[^{]*\{\s*:root\s*\{[^}]*font-size/);
  });
});

describe('Kein drittes Gesicht im JavaScript', () => {
  it('kennt nur einen Begriff für „Mobile View"', () => {
    const schale = lies('src/stamm/ui/schale.ts');
    expect(schale).toContain('export function istBlatt(): boolean {\n  return isPhoneUi();');
    expect(schale).not.toContain('istTabletHochkant');
  });

  it('hängt unterwegs nur die Ansichtstiefe in den Kopfstreifen', () => {
    // Die Reiter schalten den Inhalt DES BLATTS um und gehören dorthin, wo
    // dieser Inhalt steht. Oben angeheftet wären sie eine Navigation, die auf
    // etwas zeigt, das gerade eingeklappt ist — und der Streifen wäre
    // zweizeilig (gemessene 100 px statt 55).
    const schale = lies('src/stamm/ui/schale.ts');
    const fn = schale.slice(
      schale.indexOf('function reiterUmhaengen()'),
      schale.indexOf('function reiterUmhaengen()') + 700
    );
    expect(fn).toContain('topnav.appendChild(tiefe)');
    expect(fn).not.toContain("querySelector('.tabs')");
  });

  it('setzt beim Drehen die Darstellung zurück, aber nicht die Arbeit', () => {
    const schale = lies('src/stamm/ui/schale.ts');
    const stelle = schale.indexOf('onFaceChange(() => {');
    expect(stelle).toBeGreaterThan(-1);
    const handler = schale.slice(stelle, stelle + 500);
    // Umgehängt wird die Schale …
    expect(handler).toContain('reiterUmhaengen()');
    // … der fachliche Zustand aber nicht angefasst.
    expect(handler).not.toContain('schliesseTiefe');
    expect(handler).not.toContain('oeffneTiefe');
    expect(handler).not.toContain('zeigeMaschine');
  });

  it('sperrt die installierte App nicht aufs Hochformat', () => {
    // Sonst wäre der Schreibtisch auf dem Tablet gar nicht erreichbar – die
    // Regel „quer ist Schreibtisch" braucht das Drehen.
    expect(lies('vite.config.ts')).not.toMatch(/^\s*orientation:/m);
    expect(lies('src/stamm/core/viewport.ts')).toContain('screen?.orientation?.unlock?.()');
    expect(lies('src/main.ts')).toContain('releaseInheritedOrientationLock();');
  });

  it('startet im Schreibtisch mit offenem Panel, unterwegs geschlossen', () => {
    expect(lies('src/stamm/ui/schale.ts')).toContain('blattOffen: !isPhoneUi()');
  });

  it('bedient den Griff überall gleich: ziehen ändert die Höhe', () => {
    const schale = lies('src/stamm/ui/schale.ts');
    expect(schale).toContain("art = !istBlatt() && Math.abs(dx) > Math.abs(dy) ? 'move' : 'resize';");
    expect(schale).toContain("if (art === 'resize' && istBlatt() && !zustand.blattOffen) {");
  });
});
