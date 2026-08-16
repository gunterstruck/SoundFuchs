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
import {
  getAllCustomers,
  getAllMachines,
  getMachinesForCustomer,
  getLatestDiagnosis,
} from '@data/db.js';
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
import { ladeBestandsuebersicht } from '../../services/bestandsuebersicht.js';
import { passt, FILTER_EVENT } from '../shell/standortfilter.js';
import type { Customer, Machine } from '@data/types.js';

/** Was der Aufrufer bereitstellen muss. */
export interface KundenkarteDeps {
  /** Eine Maschine öffnen — führt in die Ansicht, die es längst gibt. */
  zeigeMaschine: (machine: Machine) => void;
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
      return (await getAllCustomers()).some((k) => k.geo === 'plz');
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
    await this.zeigeKundenblatt(kunde);
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
    this.karte.on('zoomend', () => void this.zeichneGebiete());

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

  /** Die drei Pillen Hell · Standard · Satellit. */
  private baueGrundwahl(): void {
    const leiste = document.getElementById('map-basemap-row');
    if (!leiste) return;
    leiste.textContent = '';
    for (const grund of Object.values(KACHELGRUENDE)) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'map-basemap-btn';
      knopf.textContent = t(grund.key);
      knopf.dataset.grund = grund.schluessel;
      knopf.setAttribute('aria-pressed', String(grund.schluessel === this.wahl));
      knopf.classList.toggle('is-active', grund.schluessel === this.wahl);
      knopf.addEventListener('click', () => {
        void this.setzeGrund(grund.schluessel).then(() => {
          leiste.querySelectorAll<HTMLElement>('.map-basemap-btn').forEach((b) => {
            const aktiv = b.dataset.grund === this.wahl;
            b.classList.toggle('is-active', aktiv);
            b.setAttribute('aria-pressed', String(aktiv));
          });
        });
      });
      leiste.appendChild(knopf);
    }
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
      maxClusterRadius: 45,
      iconCreateFunction: (stapel: { getChildCount: () => number }) =>
        L.divIcon({
          className: 'customer-cluster-wrapper',
          html: `<div class="customer-cluster"><strong>${stapel.getChildCount()}</strong></div>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
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
    const kunden = uebersicht.filter((e) => passt(e)).map((e) => e.kunde);
    const verortet = kunden.filter((k) => k.geo === 'plz' && k.lat != null && k.lng != null);

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

    for (const kunde of verortet) {
      const ort = [kunde.plz, kunde.ort].filter(Boolean).join(' ');
      const marker = L.marker([kunde.lat!, kunde.lng!], {
        icon: L.divIcon({
          className: 'customer-marker-wrapper',
          html:
            `<div class="customer-marker-card approx" aria-hidden="true">` +
            `<span class="customer-marker-symbol"></span>` +
            `<span class="customer-marker-copy"><b>${escape(kunde.name)}</b>` +
            `<small>${escape(ort)}</small></span></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        title: kunde.name,
      });

      marker.on('click', () => void this.zeigeKundenblatt(kunde));
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
      const punkte = verortet.map((k) => [k.lat!, k.lng!] as [number, number]);
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
   * Postleitzahlgebieten (die stehen ohnehin) und darüber einen Satz mit dem
   * Knopf, der Beispieldaten holt. Aus der Sackgasse wird der Eingang.
   */
  private zeigeLeerzustand(leer: boolean): void {
    const kasten = document.getElementById('map-empty');
    if (!kasten) return;
    kasten.style.display = leer ? '' : 'none';
    if (!leer) return;

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
   * Das Blatt des Kunden: Name, Ort, seine Maschinen.
   *
   * Statt Umsatz und Kanal — das führt TourFuchs, dort gehört es hin — steht
   * hier, was in dieser App zählt: welche Maschinen bei ihm stehen und wie es
   * ihnen geht. Ein Tipp auf eine Zeile führt in die Maschinenansicht, die es
   * längst gibt. Kein neues Blatt, kein zweiter Weg.
   */
  private async zeigeKundenblatt(kunde: Customer): Promise<void> {
    const blatt = document.getElementById('customer-sheet');
    const titel = document.getElementById('customer-sheet-title');
    const ortZeile = document.getElementById('customer-sheet-place');
    const liste = document.getElementById('customer-sheet-machines');
    if (!blatt || !titel || !ortZeile || !liste) return;

    titel.textContent = kunde.name;
    const ort = [kunde.plz, kunde.ort].filter(Boolean).join(' ');
    ortZeile.textContent = [ort, t('map.accuracyPlz')].filter(Boolean).join(' · ');

    liste.textContent = '';
    const maschinen = await getMachinesForCustomer(kunde.id);

    if (maschinen.length === 0) {
      const leer = document.createElement('p');
      leer.className = 'customer-sheet-empty';
      leer.textContent = t('map.noMachines');
      liste.appendChild(leer);
    }

    for (const maschine of maschinen) {
      const befund = await getLatestDiagnosis(maschine.id);
      const zeile = document.createElement('button');
      zeile.type = 'button';
      zeile.className = 'customer-machine-row';

      const punkt = document.createElement('span');
      punkt.className = 'machine-status-dot';
      if (befund) {
        punkt.classList.add(
          befund.healthScore >= 75
            ? 'status-dot-healthy'
            : befund.healthScore >= 50
              ? 'status-dot-warning'
              : 'status-dot-critical'
        );
      } else {
        punkt.classList.add('status-dot-unknown');
      }

      const name = document.createElement('span');
      name.className = 'customer-machine-name';
      name.textContent = maschine.name;

      const wert = document.createElement('span');
      wert.className = 'customer-machine-score';
      if (befund) {
        wert.textContent = `${Math.round(befund.healthScore)} %`;
      } else if (maschine.referenceModels?.length) {
        wert.textContent = t('status.ready');
      } else {
        wert.textContent = t('map.noReference');
      }

      const pfeil = document.createElement('span');
      pfeil.className = 'customer-machine-arrow';
      pfeil.textContent = '›';

      zeile.append(punkt, name, wert, pfeil);
      zeile.addEventListener('click', () => {
        this.schliesseBlatt();
        this.schliesse();
        this.deps.zeigeMaschine(maschine);
      });
      liste.appendChild(zeile);
    }

    blatt.style.display = 'flex';
  }

  public schliesseBlatt(): void {
    const blatt = document.getElementById('customer-sheet');
    if (blatt) blatt.style.display = 'none';
  }
}
