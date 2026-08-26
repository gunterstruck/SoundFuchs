/**
 * SOUNDFUCHS — DIE KUNDENKARTE
 *
 * Schnitt 2 aus docs/kunden-und-karte.md.
 *
 * Auf die Karte kommt der Kunde, nicht die Maschine. Das ist der ganze Trick,
 * an dem der frühere Einwand gegen eine Karte hing: Pumpe 17 und Pumpe 18
 * stehen fünf Meter auseinander und wären auf einer Landkarte dasselbe Pixel.
 * Ein Kunde dagegen ist genau das, was auf eine Landkarte gehört — ein Ort, an
 * dem man ankommt. Die Maschinen hängen darunter, im Blatt des Kunden, und
 * dort entscheidet der Name, nicht die Geografie.
 *
 * ── ZWEITES FENSTER, NICHT ERSTES ───────────────────────────────────────────
 *
 * Die Karte ersetzt die Maschinenliste nicht. Sie braucht Netz für ihre
 * Kacheln; in einer Halle ohne Empfang bleibt sie grau. Deshalb führt der
 * Hauptweg zur Maschine weiterhin über die Liste, und die Karte liegt hinter
 * einer eigenen Zeile im Menü.
 *
 * ── ERST BEIM ÖFFNEN GELADEN ────────────────────────────────────────────────
 *
 * Leaflet sind rund 150 KB. Sie kommen per `import()` erst, wenn jemand die
 * Karte wirklich aufmacht — dieselbe Überlegung wie bei den PLZ-Daten und beim
 * TensorFlow-Paket. Wer nie einen Kunden anlegt, lädt nie ein Byte davon.
 *
 * ── GENAUIGKEIT WIRD NICHT VORGETÄUSCHT ─────────────────────────────────────
 *
 * Ein Kunde liegt auf der Ortsmitte seiner Postleitzahl, nicht auf seiner
 * Hausnummer. Der Marker sagt das (`.approx`, plus die Zeile „Ortsmitte" im
 * Blatt), statt eine Schärfe zu behaupten, die die Daten nicht haben.
 */

import type {
  Map as LeafletMap,
  TileLayer,
  Marker,
  GeoJSON as GeoJSONLayer,
  LayerGroup,
} from 'leaflet';
import { getAllCustomers, getAllMachines } from '@data/db.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';
import {
  KACHELGRUENDE,
  KARTENSICHT,
  gemerkterKachelgrund,
  merkeKachelgrund,
  type Kachelwahl,
} from '../../services/mapTiles.js';
import {
  GEBIETE_QUELLE,
  ladeGebiete,
  stufeZuZoom,
  zaehleJeGebiet,
  fuellstaerke,
  type Gebietsstufe,
} from '../../services/plzGebiete.js';
import {
  ladeBestandsuebersicht,
  zustandZuWert,
  type Zustand,
  type StandortStand,
} from '../../services/bestandsuebersicht.js';
import {
  markerstufe,
  markerstufeKlasse,
  standortname,
  stapelradius,
  stapelbefund,
  farbeFuerZustand,
  MARKERSTUFEN,
} from '../../stamm/features/standortmarker.js';
import { istBlatt } from '../../stamm/ui/schale.js';
import { passt, FILTER_EVENT } from '../shell/standortfilter.js';
import type { Machine } from '@data/types.js';

/** Was der Aufrufer bereitstellen muss. */
export interface KundenkarteDeps {
  /** Eine Maschine öffnen — führt in die Ansicht, die es längst gibt. */
  zeigeMaschine: (machine: Machine) => void;
  /**
   * Das Scharnier: den Maschinenstandort öffnen.
   *
   * Die Karte weiß nicht, was dahinter liegt, und soll es nicht wissen. Sie
   * kennt den Namen, den man angetippt hat, und gibt ihn weiter.
   */
  zeigeStandort: (standortId: string) => void;
}

/**
 * Der Zustand als Wort.
 *
 * Ausgeschrieben und nicht als `t(`map.state.${zustand}`)`: `check-i18n`
 * sammelt die benutzten Schlüssel über ein Textmuster auf `t('…')`. Ein
 * Schlüssel, der erst zur Laufzeit entsteht, ist für die Prüfung unsichtbar —
 * er fehlt dann irgendwann in einer Sprache, und in der Oberfläche steht
 * wörtlich „map.state.warnung". Vier Zeilen sind der Preis dafür, dass das
 * Werkzeug seine Arbeit tun kann.
 */
function zustandswort(zustand: Zustand): string {
  switch (zustand) {
    case 'gesund':
      return t('map.stateHealthy');
    case 'warnung':
      return t('map.stateWarning');
    case 'kritisch':
      return t('map.stateCritical');
    default:
      return t('map.stateUnchecked');
  }
}

function escape(text: string): string {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

export class CustomerMap {
  private karte: LeafletMap | null = null;
  private grund: TileLayer | null = null;
  private marker: Marker[] = [];
  private wahl: Kachelwahl = gemerkterKachelgrund();
  private fenster: HTMLElement | null = null;
  /** Die Flächenebene der Postleitzahlgebiete. */
  private gebiete: GeoJSONLayer | null = null;
  /** Die Gruppe, die dicht beieinanderliegende Kunden zu Stapeln fasst. */
  private stapel: LayerGroup | null = null;
  /** Welcher Zuschnitt gerade liegt — verhindert unnötiges Neuzeichnen. */
  private gezeichneteStufe: Gebietsstufe | null = null;
  /** Welcher Zuschnitt gerade geladen wird — verhindert doppelte Ebenen. */
  private stufeInArbeit: Gebietsstufe | null = null;

  constructor(private readonly deps: KundenkarteDeps) {}

  /** Ist mindestens ein Kunde verortet? */
  public static async hatKunden(): Promise<boolean> {
    try {
      return (await getAllCustomers()).some(
        (k) => k.geo !== 'none' && k.lat != null && k.lng != null
      );
    } catch {
      return false;
    }
  }

  public async oeffne(): Promise<void> {
    this.fenster = document.getElementById('customer-map-modal');
    if (!this.fenster) {
      logger.warn('Standortkarte: das Fenster fehlt im Markup');
      return;
    }
    this.fenster.style.display = 'flex';
    await this.zeichne();
  }

  /**
   * Dieselbe Karte, nur ohne Fenster: Im Stamm liegt sie als Grund und wird
   * nicht geöffnet — sie ist immer da. Der Behälter heißt dort `#map`, so wie
   * in TourFuchs (`<main id="map">`).
   */
  public async zeigeImGrund(): Promise<void> {
    this.fenster = null;
    await this.zeichne();
  }

  /**
   * Wo die Karte hängt.
   *
   * Zwei Plätze, in dieser Reihenfolge: `#map` ist der Grund des Stamms und
   * gewinnt, solange es ihn gibt. `#customer-map` ist der alte Behälter im
   * Kartenfenster; er bleibt, bis das Fenster hinter dem Scharnier
   * verschwindet. Die Reihenfolge ist die Aussage — der Stamm ist der
   * Normalfall, das Fenster der Rest.
   */
  private static behaelter(): HTMLElement | null {
    return document.getElementById('map') ?? document.getElementById('customer-map');
  }

  private async zeichne(): Promise<void> {
    const behaelter = CustomerMap.behaelter();
    if (!behaelter) return;

    if (!this.karte) {
      await this.baueKarte(behaelter);
    }
    await this.zeichneKunden();
    await this.zeichneGebiete();

    // Leaflet misst beim Anlegen die Größe des Behälters. Der war eben noch
    // verborgen oder gerade umgezogen — ohne diesen Anstoß bliebe die Karte
    // ein graues Viertel.
    requestAnimationFrame(() => this.karte?.invalidateSize());
  }

  public schliesse(): void {
    if (this.fenster) this.fenster.style.display = 'none';
  }

  /** Wohin schaut die Karte gerade? Die Nahliste rechnet von hier aus. */
  public mitte(): { lat: number; lng: number } | null {
    const m = this.karte?.getCenter();
    return m ? { lat: m.lat, lng: m.lng } : null;
  }

  /**
   * Zu einem Standort fliegen und sein Blatt öffnen — der Weg aus der
   * Nahliste zurück auf die Karte. Ohne den Flug bliebe die Zeile ein
   * Eintrag, der etwas nennt, das man dann selbst suchen muss.
   */
  public async zeigeStandort(id: string): Promise<void> {
    const kunde = (await getAllCustomers()).find((k) => k.id === id);
    if (!kunde || kunde.lat == null || kunde.lng == null) return;
    this.karte?.flyTo([kunde.lat, kunde.lng], Math.max(this.karte.getZoom(), 10), {
      duration: 0.7,
    });

    // Das Popup hängt am Marker, nicht an der Karte — also den Marker suchen
    // und ihn selbst aufmachen. Er kann in einem Stapel stecken; dann holt
    // `zoomToShowLayer` ihn erst heraus, sonst öffnete sich ein Popup an einer
    // Stelle, an der kein Punkt zu sehen ist.
    const marker = this.marker.find(
      (m) => m.options.title === standortname(kunde.name, { demo: Boolean(kunde.demo) })
    );
    if (!marker) return;
    const gruppe = this.stapel as unknown as {
      zoomToShowLayer?: (m: unknown, cb: () => void) => void;
    } | null;
    if (typeof gruppe?.zoomToShowLayer === 'function') {
      gruppe.zoomToShowLayer(marker, () => marker.openPopup());
    } else {
      marker.openPopup();
    }
  }

  /**
   * Die Karte vergisst ihren Behälter — nötig, wenn die Schale ihn umhängt.
   * Leaflet hält eine Messung des alten Platzes fest; ein neuer Aufbau am
   * neuen Platz ist billiger als jeder Versuch, sie nachzuziehen.
   */
  public vergissKarte(): void {
    this.karte?.remove();
    this.karte = null;
    this.grund = null;
    this.gebiete = null;
    this.stapel = null;
    this.marker = [];
    this.gezeichneteStufe = null;
    this.stufeInArbeit = null;
  }

  private async baueKarte(behaelter: HTMLElement): Promise<void> {
    // Leaflet und sein Stylesheet kommen erst jetzt.
    const L = (await import('leaflet')).default;
    await import('leaflet/dist/leaflet.css');

    this.karte = L.map(behaelter, {
      attributionControl: true,
      zoomControl: false,
      maxBoundsViscosity: 0.05,
      minZoom: KARTENSICHT.minZoom,
      maxZoom: KARTENSICHT.maxZoom,
    }).setView(KARTENSICHT.mitte, KARTENSICHT.zoom);

    // Leaflets eigene Werbezeile („Leaflet") weg, die Quellenangabe der
    // Kacheln bleibt — die eine ist Schmuck, die andere ist Pflicht.
    this.karte.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'bottomright' }).addTo(this.karte);
    this.karte.setMaxBounds(KARTENSICHT.grenzen);

    // Die Namensnennung der Flächen gehört dauerhaft dazu, unabhängig davon,
    // welcher Kachelgrund gerade gewählt ist.
    this.karte.attributionControl.addAttribution(GEBIETE_QUELLE);

    // Beim Zoomen wechselt der Zuschnitt: zehn grobe Gebiete in der
    // Übersicht, 95 feinere beim Hineinzoomen.
    this.karte.on('zoomend', () => {
      void this.zeichneGebiete();
      this.markerstufeAnwenden();
    });
    this.markerstufeAnwenden();

    // Der Filter verkleinert die Menge auf der Karte. Er wird woanders
    // gestellt (Reiter „Filter"), und die Karte hört zu — sie muss dafür
    // nicht wissen, wer ihn gestellt hat.
    document.addEventListener(FILTER_EVENT, () => void this.zeichneKunden());

    await this.setzeGrund(this.wahl);
    this.baueGrundwahl();
  }

  /**
   * Die Postleitzahlgebiete als Flächen — das „Deutschlandbild".
   *
   * Sie liegen unter den Markern und über den Kacheln. Eingefärbt wird nach
   * der Zahl der Maschinen im Gebiet: Wo TourFuchs den Umsatz eines
   * Vertriebsbezirks zeigt, zeigt SoundFuchs, wo die eigene Arbeit steht.
   *
   * Gebiete ohne eine einzige Maschine bleiben ungefüllt, aber sichtbar. Das
   * ist Absicht: Das Bild soll ganz Deutschland zeigen und nicht nur die Ecke,
   * in der man zufällig angefangen hat.
   */
  private async zeichneGebiete(): Promise<void> {
    if (!this.karte) return;
    const stufe = stufeZuZoom(this.karte.getZoom());
    if (stufe === this.gezeichneteStufe || stufe === this.stufeInArbeit) return;

    // Der Platz wird VOR dem ersten `await` belegt, nicht danach.
    //
    // Sonst entsteht ein Wettlauf, und er ist beim Bauen prompt aufgetreten:
    // `oeffne()` ruft erst `zeichneKunden()`, das mit `fitBounds` den Zoom
    // ändert und damit `zoomend` auslöst — und ruft danach selbst noch
    // `zeichneGebiete()`. Beide Läufe standen dann gleichzeitig vor einem
    // `gezeichneteStufe`, das noch `null` war, luden beide und legten beide
    // ihre Ebene auf die Karte. Gemessen: 190 Flächen statt 95, jede Farbe
    // doppelt so satt. Nichts stürzte ab, nichts meldete sich — nur die
    // gezählten Flächen im attention-check verrieten es.
    this.stufeInArbeit = stufe;
    try {
      await this.zeichneGebieteWirklich(stufe);
    } finally {
      this.stufeInArbeit = null;
    }
  }

  private async zeichneGebieteWirklich(stufe: Gebietsstufe): Promise<void> {
    const sammlung = await ladeGebiete(stufe);
    if (!sammlung || !this.karte) return;

    const L = (await import('leaflet')).default;
    if (this.gebiete) this.karte.removeLayer(this.gebiete);

    const kunden = await getAllCustomers();
    const maschinen = await getAllMachines();
    // Jede Maschine zählt an der Postleitzahl ihres Kunden. Maschinen ohne
    // Kunde haben keinen Ort und können deshalb auch kein Gebiet färben.
    const plzJeKunde = new Map(kunden.map((k) => [k.id, k.plz]));
    const plzListe = maschinen
      .map((m) => (m.customerId ? plzJeKunde.get(m.customerId) : undefined))
      .filter((p): p is string => Boolean(p));

    const zaehler = zaehleJeGebiet(plzListe, stufe);
    const hoechstwert = Math.max(0, ...zaehler.values());

    this.gebiete = L.geoJSON(sammlung as never, {
      style: (merkmal) => {
        const schluessel = String(
          (merkmal as { properties?: { plz?: string } })?.properties?.plz ?? ''
        );
        const anzahl = zaehler.get(schluessel) ?? 0;
        return {
          color: '#475569',
          weight: 1,
          opacity: 0.55,
          fillColor: anzahl > 0 ? '#0d9488' : '#cbd5e1',
          fillOpacity: anzahl > 0 ? fuellstaerke(anzahl, hoechstwert) : 0.06,
        };
      },
      onEachFeature: (merkmal, ebene) => {
        const schluessel = String(
          (merkmal as { properties?: { plz?: string } })?.properties?.plz ?? ''
        );
        const anzahl = zaehler.get(schluessel) ?? 0;
        ebene.bindTooltip(
          anzahl > 0
            ? t('map.areaWithMachines', { plz: schluessel, count: String(anzahl) })
            : t('map.areaEmpty', { plz: schluessel }),
          { sticky: true }
        );
      },
    }).addTo(this.karte);

    // Unter die Marker, damit ein Kunde nie hinter seiner eigenen Fläche
    // verschwindet.
    this.gebiete.bringToBack();
    this.gezeichneteStufe = stufe;
  }

  private async setzeGrund(wahl: Kachelwahl): Promise<void> {
    if (!this.karte) return;
    const L = (await import('leaflet')).default;
    const grund = KACHELGRUENDE[wahl] ?? KACHELGRUENDE.light;
    if (this.grund) this.karte.removeLayer(this.grund);
    this.grund = L.tileLayer(grund.url, {
      attribution: grund.attribution,
      maxZoom: grund.maxZoom,
      minZoom: grund.minZoom,
      crossOrigin: true,
    }).addTo(this.karte);
    this.wahl = wahl;
    merkeKachelgrund(wahl);
  }

  /**
   * Die Wahl des Kartengrunds — ein Auswahlfeld, wie im Stamm.
   *
   * Hier standen bis zum 16.08.2026 drei Pillen (`#map-basemap-row`). Sie
   * waren einmal selbst von TourFuchs abgeschaut, stammten aber aus einer
   * älteren Fassung; der Stamm füllt heute ein `<select>` in der Seitenleiste
   * (`sidebar.js`, `basemap-select`).
   *
   * Die Beschriftungen kommen weiter aus der Übersetzung und nicht aus
   * `CONFIG.tileLayers.label` wie im Stamm — SoundFuchs spricht fünf Sprachen,
   * TourFuchs eine.
   */
  private baueGrundwahl(): void {
    const feld = document.getElementById('basemap-select') as HTMLSelectElement | null;
    if (!feld) return;
    feld.textContent = '';
    for (const grund of Object.values(KACHELGRUENDE)) {
      const eintrag = document.createElement('option');
      eintrag.value = grund.schluessel;
      eintrag.textContent = t(grund.key);
      eintrag.selected = grund.schluessel === this.wahl;
      feld.appendChild(eintrag);
    }
    if (feld.dataset.verdrahtet === '1') return;
    feld.dataset.verdrahtet = '1';
    feld.addEventListener('change', () => {
      const wahl = feld.value as Kachelwahl;
      if (wahl in KACHELGRUENDE) void this.setzeGrund(wahl);
    });
  }

  /**
   * Progressive Offenlegung: Wie viel zeigt ein Marker bei diesem Zoom?
   *
   * Aus dem Stamm (`syncCustomerMarkerMode`). Erst Orientierung — ein
   * anonymer Punkt —, dann ein anklickbares Kärtchen, dann der Name, zuletzt
   * der Zusatz. Entschieden wird das **nicht** im Marker, sondern mit einer
   * Klasse am Kartenbehälter: Sonst müsste jeder Marker bei jeder Zoomstufe
   * neu gebaut werden, und bei hundert Standorten sieht man das.
   *
   * Deshalb trägt jeder Marker immer alle vier Teile, und das Stamm-CSS
   * blendet ein, was gerade dran ist.
   */
  private markerstufeAnwenden(): void {
    if (!this.karte) return;
    const behaelter = this.karte.getContainer();
    for (const stufe of MARKERSTUFEN) behaelter.classList.remove(markerstufeKlasse(stufe));
    behaelter.classList.add(
      markerstufeKlasse(markerstufe(this.karte.getZoom(), { mobil: istBlatt() }))
    );
  }

  /**
   * Die Stapelgruppe, einmal angelegt und dann wiederverwendet.
   *
   * `leaflet.markercluster` hängt sich beim Laden an Leaflet an — es erweitert
   * `L` um `markerClusterGroup`, statt etwas zurückzugeben. Deshalb der
   * Seiteneffekt-Import und die Umtypisierung; sie ist an genau dieser Stelle
   * eingesperrt statt über die Datei verteilt.
   */
  private async holeStapelgruppe(L: typeof import('leaflet')): Promise<LayerGroup> {
    if (this.stapel) return this.stapel;
    await import('leaflet.markercluster');
    await import('leaflet.markercluster/dist/MarkerCluster.css');
    await import('leaflet.markercluster/dist/MarkerCluster.Default.css');

    const mitStapeln = L as unknown as {
      markerClusterGroup: (o: Record<string, unknown>) => LayerGroup;
    };
    this.stapel = mitStapeln.markerClusterGroup({
      // Erst ab fünf lohnt ein Stapel; vier Punkte liest man noch einzeln.
      minClusterSize: 5,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: istBlatt() ? 1.85 : 1.2,
      spiderLegPolylineOptions: { weight: 2, color: '#0f766e', opacity: 0.65 },
      // Aus dem Stamm: der Radius hängt an der Zoomstufe. Vorher stand hier
      // eine feste 45 — dieselbe Zahl für Deutschland und für eine Straße, und
      // damit überall ein bisschen falsch.
      maxClusterRadius: (zoom: number) => stapelradius(zoom, { mobil: istBlatt() }),
      iconCreateFunction: (stapel: {
        getChildCount: () => number;
        getAllChildMarkers: () => { options?: { zanoboZustand?: Zustand } }[];
      }) => {
        // Die Farbe des Stapels kommt vom schlechtesten Standort darin. Der
        // Zustand hängt am Marker selbst, damit der Stapel ihn nicht erneut
        // aus der Datenbank holen muss — er wird beim Zeichnen mitgegeben.
        const zustaende = stapel
          .getAllChildMarkers()
          .map((m) => m.options?.zanoboZustand ?? 'ungeprueft');
        const befund = stapelbefund(zustaende);
        const titel = t('map.stackTitle', { count: String(befund.anzahl) });
        return L.divIcon({
          className: 'cluster-wrapper',
          html:
            `<div class="customer-stack-card" style="--stack-color:${befund.farbe};` +
            `--stack-accent:${befund.farbe}" role="button" aria-label="${escape(titel)}" ` +
            `title="${escape(titel)}">` +
            `<span class="customer-stack-accent"></span>` +
            `<strong>${befund.anzahl}</strong><small>${escape(t('map.stackUnit'))}</small>` +
            `</div>`,
          iconSize: [48, 46],
          iconAnchor: [24, 23],
        });
      },
    });
    this.karte?.addLayer(this.stapel);
    return this.stapel;
  }

  /**
   * Wie viel von der Karte tatsächlich frei liegt.
   *
   * Im Fenster ist das die ganze Fläche. Im Grund der neuen Schale liegt oben
   * der Kopfstreifen und unten das Blatt darüber — und ohne diese Polsterung
   * rechnet Leaflet mit der vollen Höhe: Beim ersten Messen saß Deutschland
   * unter dem Blatt, und die Marker, um die es geht, waren nicht anzutippen.
   *
   * Gemessen wird, was dasteht, nicht was im CSS steht. Das Blatt ist mal
   * 46 px hoch und mal halbhoch, der Streifen mal ein-, mal zweizeilig; jede
   * feste Zahl wäre nur so lange richtig, bis jemand eine Zeile ergänzt.
   * Dieselbe Überlegung steht bei TourFuchs über `fitPadding()` und
   * `syncTopnavMetrics()`.
   */
  private freieFlaeche(): { oben: number; unten: number; links: number; rechts: number } {
    const grund = this.karte?.getContainer().getBoundingClientRect();
    const rand = { oben: 24, unten: 24, links: 18, rechts: 18 };
    if (!grund) return rand;

    const sichtbar = (id: string): DOMRect | null => {
      const el = document.getElementById(id);
      if (!el) return null;
      const stil = getComputedStyle(el);
      if (stil.display === 'none' || stil.visibility === 'hidden') return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    };

    const streifen = sichtbar('schale-streifen');
    if (streifen && streifen.bottom > grund.top) {
      rand.oben = Math.max(rand.oben, Math.round(streifen.bottom - grund.top) + 12);
    }
    const blatt = sichtbar('schale-blatt');
    if (blatt && blatt.top < grund.bottom) {
      rand.unten = Math.max(rand.unten, Math.round(grund.bottom - blatt.top) + 12);
    }

    // ── WARUM DIE POLSTERUNG GEDECKELT WIRD ───────────────────────────────
    //
    // Beim ersten Messen war sie ungedeckelt, und Deutschland lag trotzdem
    // unter dem Blatt — genauso falsch wie ganz ohne Polsterung. Der Grund
    // liegt eine Ebene tiefer: Die Karte hat einen Rahmen (`setMaxBounds`),
    // über den hinaus sie nicht schwenkt. Ein aufgezogenes Blatt verdeckt 439
    // von 792 Punkten; die Karte hätte den Inhalt in den schmalen Rest darüber
    // schieben müssen und wäre dabei aus ihrem Rahmen gelaufen. Also zog der
    // Rahmen sie wieder zurück, und die Polsterung war wirkungslos. Sichtbar
    // wurde das erst an einer Zahl: das erste Marker-Symbol bei 466 px, das
    // Blatt beginnt bei 405.
    //
    // Deshalb eine Obergrenze: Zusammen nehmen sich Kopfstreifen und Blatt
    // höchstens 68 % der Höhe. Darüber hinaus zu reservieren nützt nichts
    // mehr — die Karte kann nicht unter ihre kleinste Stufe, und was übrig
    // bliebe, wäre kleiner als Deutschland. Gemessen im Einstiegszustand, in
    // dem das Blatt 55 % einnimmt: ohne Polsterung liegen 9 von 12 Markern
    // dahinter, mit ihr 2. TourFuchs deckelt aus demselben Grund, dort mit
    // einer festen Zahl (`fitPadding`: `Math.min(mobileBottom, overlap + 16)`).
    const obergrenze = Math.round(grund.height * 0.68);
    if (rand.oben + rand.unten > obergrenze) {
      rand.unten = Math.max(24, obergrenze - rand.oben);
    }
    return rand;
  }

  private async zeichneKunden(): Promise<void> {
    if (!this.karte) return;
    const L = (await import('leaflet')).default;

    for (const m of this.marker) m.remove();
    this.marker = [];

    // Der Filter aus dem Reiter „Filter" (Schnitt 6) verkleinert die Menge,
    // die überhaupt gezeichnet wird — genau wie bei TourFuchs, wo alles
    // Weitere danach auf `customersOnMap()` arbeitet. Ohne laufende Schale ist
    // die Übersicht ungefiltert, und diese Zeile kostet einen Durchlauf.
    const uebersicht = await ladeBestandsuebersicht();
    const sichtbar = uebersicht.filter((e) => passt(e));
    const kunden = sichtbar.map((e) => e.kunde);
    const verortet = sichtbar.filter(
      (e) => e.kunde.geo !== 'none' && e.kunde.lat != null && e.kunde.lng != null
    );

    // ── WARUM GESTAPELT WIRD ─────────────────────────────────────────────
    //
    // Beim ersten Versuch lagen 100 Marker einzeln auf der Karte. Auf
    // Deutschland-Zoom überdeckten sie das Land vollständig — man sah einen
    // Teppich aus Punkten und keine Karte mehr, und ausgerechnet das
    // Deutschlandbild, um das es hier geht, verschwand darunter.
    //
    // Deshalb dasselbe Mittel wie bei TourFuchs (`L.markerClusterGroup` in
    // `src/features/map.js`): Was zu dicht beieinander liegt, wird zu einem
    // Stapel mit Zahl zusammengefasst und fällt beim Hineinzoomen wieder
    // auseinander. Erst ab fünf Markern lohnt ein Stapel — darunter ist der
    // einzelne Punkt die ehrlichere Auskunft.
    const gruppe = await this.holeStapelgruppe(L);
    gruppe.clearLayers();

    for (const stand of verortet) {
      const kunde = stand.kunde;
      const ort = [kunde.plz, kunde.ort].filter(Boolean).join(' ');

      // Der Zusatz unter dem Namen sagt, was hier steht — und wie es darum
      // bestellt ist. Im Stamm steht an dieser Stelle der Besuchsrhythmus;
      // die Form (Ort · Kontext) ist dieselbe.
      const zusatz = [ort, this.maschinenzeile(stand.maschinen.length, stand.zustand)]
        .filter(Boolean)
        .join(' · ');

      const anzeigename = standortname(kunde.name, { demo: Boolean(kunde.demo) });
      const marker = L.marker([kunde.lat!, kunde.lng!], {
        icon: L.divIcon({
          className: 'customer-marker-wrapper',
          // Aufbau eins zu eins aus dem Stamm (`customerMarkerIcon`): Karte,
          // Akzent, Symbol, Beschriftung. Welcher Teil davon zu sehen ist,
          // entscheidet allein die Klasse am Kartenbehälter — deshalb steht
          // hier immer alles, auch auf der Punktstufe.
          html:
            `<div class="customer-marker-card${kunde.geo === 'plz' ? ' approx' : ''}" ` +
            `style="--marker-color:${farbeFuerZustand(stand.zustand)}" aria-hidden="true">` +
            `<span class="customer-marker-accent"></span>` +
            `<span class="customer-marker-symbol"></span>` +
            `<span class="customer-marker-copy"><b>${escape(anzeigename)}</b>` +
            `<small>${escape(zusatz || t('map.openDetails'))}</small></span></div>`,
          iconSize: istBlatt() ? [44, 44] : [28, 28],
          iconAnchor: istBlatt() ? [22, 22] : [14, 14],
        }),
        title: anzeigename,
        // Reist mit dem Marker, damit der Stapel seine Farbe bestimmen kann,
        // ohne die Datenbank ein zweites Mal zu fragen.
        zanoboZustand: stand.zustand,
      } as L.MarkerOptions & { zanoboZustand: Zustand });

      marker.bindPopup(this.standortPopup(stand), {
        maxWidth: 300,
        className: 'customer-detail-popup',
        autoPanPadding: [16, 16],
      });
      gruppe.addLayer(marker);
      this.marker.push(marker);
    }

    // Wer keine Koordinaten hat, verschwindet nicht stillschweigend: Die Zeile
    // unter der Karte sagt, wie viele fehlen und warum.
    const hinweis = document.getElementById('map-unlocated');
    if (hinweis) {
      const ohne = kunden.length - verortet.length;
      hinweis.textContent = ohne > 0 ? t('map.unlocated', { count: String(ohne) }) : '';
      hinweis.style.display = ohne > 0 ? '' : 'none';
    }

    // Alle Standorte ins Bild holen — aber nicht näher als der Startzoom, sonst
    // klebt man bei einem einzigen Standort auf Straßenebene. Die Polsterung
    // hält Kopfstreifen und Blatt frei, siehe `freieFlaeche()`.
    if (verortet.length > 0) {
      const punkte = verortet.map((e) => [e.kunde.lat!, e.kunde.lng!] as [number, number]);
      const rand = this.freieFlaeche();
      this.karte.fitBounds(L.latLngBounds(punkte).pad(0.25), {
        maxZoom: 11,
        paddingTopLeft: L.point(rand.links, rand.oben),
        paddingBottomRight: L.point(rand.rechts, rand.unten),
      });
    }

    this.zeigeLeerzustand(verortet.length === 0);
  }

  /**
   * Der Einstieg, wenn noch kein Kunde da ist.
   *
   * Vorher führte die Karte in diesem Fall nirgendwohin — und damit die
   * Menüzeile auch nicht, weshalb sie versteckt wurde. Das war eine Falle:
   * Ohne Kunden keine Karte, und der Weg zu Kunden lag hinter derselben
   * verborgenen Tür. Die Regel „kein Knopf auf ein graues Feld" war richtig,
   * die Anwendung falsch — man muss das graue Feld füllen, nicht die Tür
   * zumauern.
   *
   * Jetzt zeigt die Karte in diesem Fall Deutschland mit seinen
   * Postleitzahlgebieten (die stehen ohnehin) und darüber drei geordnete
   * Schritte: die erste Maschine anlegen, zunächst nur einen Standort
   * vorbereiten oder Beispieldaten laden. Der eigene Bestand ist die
   * Hauptsache, die Vorführung die Alternative. Aus der Sackgasse wird der
   * Eingang.
   */
  private zeigeLeerzustand(leer: boolean): void {
    const kasten = document.getElementById('map-empty');
    if (!kasten) return;
    kasten.style.display = leer ? '' : 'none';
    if (!leer) return;

    // Die Maschinenanlage verdrahtet die Schale in main.ts, weil nur sie das
    // Scharnier zur Bestandsebene öffnen kann. Hier gehört allein die Aktion,
    // die die Karte selbst füllt: Beispieldaten laden und neu zeichnen.
    const knopf = document.getElementById('map-empty-demo-btn');
    if (!knopf || knopf.dataset.verdrahtet === '1') return;
    knopf.dataset.verdrahtet = '1';
    knopf.addEventListener('click', () => {
      void (async () => {
        (knopf as HTMLButtonElement).disabled = true;
        knopf.textContent = t('map.emptyLoading');
        try {
          const { ladeBeispieldaten } = await import('../../services/demoCustomers.js');
          await ladeBeispieldaten();
          await this.zeichneKunden();
          this.gezeichneteStufe = null; // Färbung neu berechnen
          await this.zeichneGebiete();
        } catch (fehler) {
          logger.error('Beispieldaten aus der Karte heraus fehlgeschlagen', fehler);
          knopf.textContent = t('map.emptyButton');
          (knopf as HTMLButtonElement).disabled = false;
        }
      })();
    });
  }

  /**
   * Ein Wort zu den Maschinen: wie viele, und wie es ihnen geht.
   *
   * Im Stamm steht an dieser Stelle der Besuchsrhythmus („alle 4 Wochen"). Die
   * Form ist dieselbe — ein kurzer Zusatz, der die Zeile fertig macht —, nur
   * beantwortet er hier die Frage, die diese Anwendung stellt.
   */
  private maschinenzeile(anzahl: number, zustand: Zustand): string {
    if (anzahl === 0) return t('map.noMachinesShort');
    const zahl = t(anzahl === 1 ? 'map.machineCountOne' : 'map.machineCount', {
      count: String(anzahl),
    });
    return zustand === 'ungeprueft' ? zahl : `${zahl} · ${zustandswort(zustand)}`;
  }

  /**
   * DAS SCHARNIER
   *
   * Der Übergang von der Karte in die Tiefe — und der Auftraggeber hat ihn an
   * genau einem Element festgemacht: **dem klickbaren Namen**.
   *
   *     Karte → Maschinenstandortname → Standortansicht → Maschinenliste
   *           → Maschinenansicht → Zanobo-Funktionen
   *
   * Deshalb ist die Überschrift hier ein `<button>` und keine Zeile Text. Sie
   * sieht aus wie eine Überschrift, weil sie eine ist; sie ist ein Knopf, weil
   * sie die Tür ist. Beides zugleich geht nur, wenn man es so schreibt — ein
   * `<h3>` mit `onclick` wäre für die Tastatur und für Vorlesewerkzeuge keine
   * Tür, sondern eine Überschrift, die sich seltsam verhält.
   *
   * ## Warum ein Popup und kein Blatt mehr
   *
   * Bis zum 16.08.2026 öffnete ein Marker ein Blatt am unteren Bildschirmrand
   * (`#customer-sheet`). Das war SoundFuchs' eigene Erfindung. Der Stamm hängt
   * die Auskunft an den Marker, den man angetippt hat
   * (`customerPopupHtml` + `bindPopup`), und das ist der Unterschied zwischen
   * „hier ist etwas über einen Standort" und „hier ist etwas über DIESEN
   * Standort": Das Blatt verlor den Bezug zum Punkt, sobald es aufging.
   *
   * ## Warum als DOM und nicht als Zeichenkette
   *
   * Der Stamm baut seine Popups aus Zeichenketten und hängt die Zuhörer
   * nachträglich über `data-action` an. Das ist dort gewachsen und trägt; hier
   * kämen Standort- und Maschinennamen aus der Datenbank in eine Zeichenkette,
   * die als HTML gelesen wird. Ein Standort namens `<img onerror=…>` wäre dann
   * ein Einfallstor. Gebaute Knoten mit `textContent` haben das Problem nicht.
   */
  private standortPopup(stand: StandortStand): HTMLElement {
    const kunde = stand.kunde;
    const wurzel = document.createElement('div');
    wurzel.className = 'popup popup-customer';

    // ── Der Name: die Tür ──────────────────────────────────────────────────
    const ueberschrift = document.createElement('h3');
    const tuer = document.createElement('button');
    tuer.type = 'button';
    tuer.className = 'popup-scharnier';
    tuer.textContent = standortname(kunde.name, { demo: Boolean(kunde.demo) });
    tuer.title = t('map.openSite');
    tuer.addEventListener('click', () => this.deps.zeigeStandort(kunde.id));
    ueberschrift.appendChild(tuer);

    if (kunde.demo) {
      const abzeichen = document.createElement('span');
      abzeichen.className = 'popup-demo-badge';
      abzeichen.textContent = t('map.demoBadge');
      ueberschrift.appendChild(abzeichen);
    }
    wurzel.appendChild(ueberschrift);

    // ── Adresse, mit der Angabe, wie genau sie ist ─────────────────────────
    const ort = [kunde.plz, kunde.ort].filter(Boolean).join(' ');
    const anschrift = [kunde.strasse, ort].filter(Boolean).join(' · ');
    if (anschrift || kunde.geo === 'gps') {
      const zeile = document.createElement('p');
      zeile.className = 'popup-addr';
      zeile.textContent = anschrift || t('map.accuracyGps');
      if (kunde.geo === 'plz') {
        // Aus dem Stamm, wörtlich in der Sache: Ein Punkt, der die Ortsmitte
        // meint, darf nicht wie eine Hausnummer aussehen.
        const ungefaehr = document.createElement('span');
        ungefaehr.className = 'muted small';
        ungefaehr.textContent = ` · 📍 ${t('map.accuracyPlz')}`;
        zeile.appendChild(ungefaehr);
      } else if (anschrift && kunde.geo === 'gps') {
        zeile.append(` · 📍 ${t('map.accuracyGps')}`);
      }
      wurzel.appendChild(zeile);
    }

    const meta = document.createElement('p');
    meta.className = 'muted small popup-meta';
    meta.textContent = this.maschinenzeile(stand.maschinen.length, stand.zustand);
    wurzel.appendChild(meta);

    // ── Die Maschinen, immer als Liste ─────────────────────────────────────
    //
    // Keine Knopfreihe, keine Schwelle, ab der aus Knöpfen eine Liste wird,
    // keine Suche. Begründung des Auftraggebers: „Es wird praktisch nie zu
    // viele geben." Das ist zugleich die einfachere Sache — eine Form statt
    // zweier, kein Umschaltpunkt, der geprüft werden müsste (§0g).
    const liste = document.createElement('ul');
    liste.className = 'rep-list';
    for (const maschine of stand.maschinen) {
      liste.appendChild(this.maschinenzeileBauen(maschine, stand));
    }
    if (stand.maschinen.length > 0) wurzel.appendChild(liste);

    return wurzel;
  }

  /**
   * Eine Maschinenzeile im Standort-Popup.
   *
   * Vier Spalten, wie `.popup .rep-list li` im Stamm sie vorgibt: Punkt, Name,
   * Wert, Pfeil. Dort sind es Farbpunkt, Bezirk, Kundenzahl und Umsatz — die
   * Form passt, weil die Frage dieselbe Gestalt hat: ein Merkmal, ein Name,
   * eine Zahl, ein Weg weiter.
   *
   * Die Zeile IST der Knopf und nicht bloß ein Träger für einen (§0g).
   */
  private maschinenzeileBauen(maschine: Machine, stand: StandortStand): HTMLLIElement {
    const zeile = document.createElement('li');

    const wert = stand.befunde.get(maschine.id) ?? null;
    const zustand = zustandZuWert(wert);

    const punkt = document.createElement('span');
    punkt.className = 'rl-dot';
    punkt.style.background = farbeFuerZustand(zustand);
    punkt.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'rl-name';
    name.textContent = maschine.name;

    const zahl = document.createElement('span');
    zahl.className = 'rl-count';
    zahl.textContent =
      wert !== null
        ? `${Math.round(wert)} %`
        : maschine.referenceModels?.length
          ? t('status.ready')
          : t('map.noReference');

    const pfeil = document.createElement('span');
    pfeil.className = 'rl-arrow';
    pfeil.textContent = '›';
    pfeil.setAttribute('aria-hidden', 'true');

    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'rl-row';
    knopf.append(punkt, name, zahl, pfeil);
    knopf.addEventListener('click', () => {
      this.karte?.closePopup();
      this.deps.zeigeMaschine(maschine);
    });

    zeile.appendChild(knopf);
    return zeile;
  }
}
