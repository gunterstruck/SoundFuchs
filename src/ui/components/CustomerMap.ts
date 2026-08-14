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

import type { Map as LeafletMap, TileLayer, Marker } from 'leaflet';
import { getAllCustomers, getMachinesForCustomer, getLatestDiagnosis } from '@data/db.js';
import { logger } from '@utils/logger.js';
import { t } from '../../i18n/index.js';
import {
  KACHELGRUENDE,
  KARTENSICHT,
  gemerkterKachelgrund,
  merkeKachelgrund,
  type Kachelwahl,
} from '../../services/mapTiles.js';
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

  constructor(private readonly deps: KundenkarteDeps) {}

  /**
   * Gibt es überhaupt etwas zu zeigen?
   *
   * Ein Menüeintrag, der auf eine leere Karte führt, ist genau die Sorte
   * Knopf, die wir hier schon mehrfach ausgemerzt haben: sichtbar,
   * beschriftet, reagiert — und führt nirgendwohin. Solange kein Kunde
   * verortet ist, bleibt die Zeile weg.
   */
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
      logger.warn('Kundenkarte: das Fenster fehlt im Markup');
      return;
    }
    this.fenster.style.display = 'flex';

    const behaelter = document.getElementById('customer-map');
    if (!behaelter) return;

    if (!this.karte) {
      await this.baueKarte(behaelter);
    }
    await this.zeichneKunden();

    // Leaflet misst beim Anlegen die Größe des Behälters. Der war eben noch
    // verborgen — ohne diesen Anstoß bliebe die Karte ein graues Viertel.
    requestAnimationFrame(() => this.karte?.invalidateSize());
  }

  public schliesse(): void {
    if (this.fenster) this.fenster.style.display = 'none';
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

    await this.setzeGrund(this.wahl);
    this.baueGrundwahl();
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

  private async zeichneKunden(): Promise<void> {
    if (!this.karte) return;
    const L = (await import('leaflet')).default;

    for (const m of this.marker) m.remove();
    this.marker = [];

    const kunden = await getAllCustomers();
    const verortet = kunden.filter((k) => k.geo === 'plz' && k.lat != null && k.lng != null);

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
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        title: kunde.name,
      }).addTo(this.karte);

      marker.on('click', () => void this.zeigeKundenblatt(kunde));
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

    // Alle Kunden ins Bild holen — aber nicht näher als der Startzoom, sonst
    // klebt man bei einem einzigen Kunden auf Straßenebene.
    if (verortet.length > 0) {
      const punkte = verortet.map((k) => [k.lat!, k.lng!] as [number, number]);
      this.karte.fitBounds(L.latLngBounds(punkte).pad(0.25), { maxZoom: 11 });
    }
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
