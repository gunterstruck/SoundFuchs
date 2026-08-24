/**
 * ABOUT MODAL CONTROLLER
 *
 * Dynamically renders the "About Zanobo" modal content
 * based on the current language using i18n translations.
 */

import { t, onLanguageChange } from '../../i18n/index.js';

export class AboutModalController {
  private modalBody: HTMLElement | null = null;

  constructor() {
    this.modalBody = document.querySelector('#about-modal .modal-body');

    if (this.modalBody) {
      // Initial render
      this.render();

      // Re-render when language changes
      onLanguageChange(() => {
        this.render();
      });
    }
  }

  /**
   * Render the About modal content dynamically
   */
  private render(): void {
    if (!this.modalBody) return;

    // Build HTML content
    const html = `
      <div class="about-hero">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2">
          <circle cx="12" cy="12" r="9"/>
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v6m0 6v10M1 12h6m6 0h10"/>
        </svg>
        <h4>ZANOBO 2.0</h4>
        <p class="about-subtitle">${t('about.subtitle')}</p>
      </div>

      <p>${t('about.intro')}</p>

      <h4>${t('about.coreFeaturesTitle')}</h4>
      <ul>
        <li>${t('about.coreFeatures.offlineFirst')}</li>
        <li>${t('about.coreFeatures.similarityScore')}</li>
        <li>${t('about.coreFeatures.userThreshold')}</li>
        <li>${t('about.coreFeatures.visualFeedback')}</li>
        <li>${t('about.coreFeatures.noDataLeaks')}</li>
      </ul>

      <h4>${t('about.useCasesTitle')}</h4>
      <p>${t('about.useCasesIntro')}</p>

      <h5>${t('about.serialComparisonTitle')}</h5>
      <p>${t('about.serialComparisonPrinciple')}</p>
      <p>${t('about.serialComparisonGoal')}</p>
      <p>${t('about.serialComparisonApplication')}</p>
      <p>${t('about.serialComparisonHint')}</p>

      <h5>${t('about.parallelComparisonTitle')}</h5>
      <p>${t('about.parallelComparisonPrinciple')}</p>
      <p>${t('about.parallelComparisonGoal')}</p>
      <p>${t('about.parallelComparisonApplication')}</p>
      <p>${t('about.parallelComparisonSpecial')}</p>
      <p>${t('about.parallelComparisonHint')}</p>

      <h4>${t('about.nfcTitle')}</h4>
      <p>${t('about.nfcIntro')}</p>

      <h5>${t('about.nfcFunctionalityTitle')}</h5>
      <p>${t('about.nfcTagDescription')}</p>
      <p>${t('about.nfcInstantAccess')}</p>

      <h5>${t('about.nfcReferenceDataTitle')}</h5>
      <p>${t('about.nfcReferenceDataDescription')}</p>

      <h5>${t('about.nfcAdvantageTitle')}</h5>
      <p>${t('about.nfcAdvantageDescription')}</p>

      <h5>${t('about.nfcDataPrivacyTitle')}</h5>
      <p>${t('about.nfcDataPrivacyImportant')}</p>
      <p>${t('about.nfcDataPrivacyStorage')}</p>

      <h5>${t('about.nfcFocusTitle')}</h5>
      <p>${t('about.nfcFocusDescription')}</p>
      <p>${t('about.nfcNoFeatures')}</p>
      <p>${t('about.nfcInterpretation')}</p>

      <h4>${t('about.legalTitle')}</h4>
      <p>${t('about.legalIntro')}</p>

      <h5>${t('about.ipTableTitle')}</h5>
      ${this.renderIPTable()}

      <h4>${t('about.transparencyTitle')}</h4>
      <p>${t('about.transparencyText1')}</p>
      <p>${t('about.transparencyText2')}</p>

      <p style="margin-top: 1.5rem;">
        <strong>${t('about.publicInstance')}</strong>
        <a href="${t('about.publicInstanceUrl')}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color);">
          ${t('about.publicInstanceUrl')}
        </a>
      </p>

      <div class="about-version">
        <p><strong>${t('about.version')}</strong> ${t('about.versionNumber')}</p>
        <p><strong>${t('about.buildLabel')}</strong> <span id="about-build">—</span></p>
        <p><strong>${t('about.developedBy')}</strong> ${t('about.developerName')}</p>
        <p><strong>${t('about.license')}</strong> ${t('about.licenseType')}</p>
        <p><strong>${t('about.stack')}</strong> ${t('about.stackTech')}</p>
        <button type="button" class="action-btn secondary-btn" id="check-update-btn">
          <span>${t('about.checkUpdate')}</span>
        </button>
        <p class="setting-status-line" id="check-update-status"></p>
        <!-- Der Weg aus dem Fund heraus.

             Bis zum 24.08.2026 stand hier nur die Statuszeile. „Neue Fassung
             gefunden" war damit eine Auskunft ohne Handlung — der Nutzer stand
             im Dialog und konnte nichts tun. Der Hinweis, auf den der Satz
             verwies, kam obendrein nie, weil die Prüfung ihn gar nicht
             auslösen konnte (pwaUpdate.ts).

             Jetzt steht die Handlung dort, wo die Auskunft steht. Verborgen,
             solange es nichts anzuwenden gibt: Ein Knopf „Jetzt aktualisieren"
             ohne wartende Fassung wäre ein Knopf, der nichts tut. -->
        <button type="button" class="action-btn primary-btn" id="apply-update-btn" hidden>
          <span>${t('about.applyUpdate')}</span>
        </button>
      </div>

      ${this.renderDatenherkunft()}
    `;

    this.modalBody.innerHTML = html;
    this.zeigeStand();
  }

  /**
   * Die Herkunft der fremden Daten — Namensnennung, nicht Höflichkeit.
   *
   * ── WARUM DAS HIER STEHT UND NICHT IN index.html ──────────────────────
   *
   * Genau dort stand es bis zum 15.08.2026, und genau dort war es wirkungslos:
   * Dieser Controller ersetzt beim Start `modalBody.innerHTML` vollständig.
   * Alles, was im Markup innerhalb des Dialogrumpfs steht, ist damit weg,
   * bevor es je jemand sieht — gemessen war `.about-data` schon vor dem
   * Öffnen null Mal im Dokument.
   *
   * Das ist die unangenehmste Sorte Fehler dieser Sitzung: Der Block war da,
   * er war richtig geschrieben, er wurde in zwei Zusammenführungen als
   * „vorhanden" gemeldet — und er erschien nie. Bei einer Lizenzbedingung ist
   * das kein Schönheitsfehler.
   *
   * CC BY 4.0 (GeoNames) und ODbL (OpenStreetMap) verlangen die Nennung. Sie
   * steht zusätzlich in NOTICE; Kacheln und Flächen nennen sich außerdem
   * unten rechts auf der Karte selbst.
   */
  private renderDatenherkunft(): string {
    const link = (url: string, text: string) =>
      `<a href="${url}" target="_blank" rel="noopener" style="color: var(--primary-color)">${text}</a>`;
    const osm = link('https://www.openstreetmap.org/copyright', 'OpenStreetMap-Mitwirkende');

    return `
      <div class="about-data">
        <p class="about-data-title">${t('about.dataTitle')}</p>
        <p>${t('about.dataPlzPlaces')}: &copy; ${link('https://www.geonames.org/', 'GeoNames')},
          ${link('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0')}</p>
        <p>${t('about.dataPlzCoords')}: &copy; ${osm}, ODbL</p>
        <p>${t('about.dataPlzAreas')}: &copy; ${osm}, ODbL, via Esri Deutschland</p>
        <p>${t('about.dataMapTiles')}: &copy; ${osm} (ODbL),
          ${link('https://carto.com/attributions', 'CARTO')},
          ${link('https://www.esri.com/', 'Esri')} (Maxar, Earthstar Geographics)</p>
      </div>
    `;
  }

  /**
   * Bauzeit eintragen und den Knopf verdrahten, der von Hand nachfragt.
   *
   * Muss nach jedem Rendern erneut geschehen: Der Rumpf wird ersetzt, und mit
   * ihm verschwinden Element und Zuhörer.
   */
  private zeigeStand(): void {
    const stand = this.modalBody?.querySelector('#about-build');
    if (stand) {
      try {
        stand.textContent = new Date(__BAUZEIT__).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
      } catch {
        stand.textContent = __BAUZEIT__;
      }
    }

    const knopf = this.modalBody?.querySelector<HTMLButtonElement>('#check-update-btn');
    const zeile = this.modalBody?.querySelector('#check-update-status');
    const anwenden = this.modalBody?.querySelector<HTMLButtonElement>('#apply-update-btn');

    anwenden?.addEventListener('click', () => {
      void (async () => {
        anwenden.disabled = true;
        const { wendeUpdateAn } = await import('@utils/pwaUpdate.js');
        wendeUpdateAn();
      })();
    });

    /**
     * Wartet schon etwas, bevor überhaupt jemand tippt?
     *
     * Wer den Dialog aufmacht, weil er die neue Fassung sucht, soll sie hier
     * vorfinden — nicht erst nach einem Tipp auf „Nach Update suchen", der ihm
     * dasselbe noch einmal sagt.
     */
    void (async () => {
      const { updateWartet } = await import('@utils/pwaUpdate.js');
      if (updateWartet() && anwenden) {
        anwenden.hidden = false;
        if (zeile) zeile.textContent = t('about.checkFound');
      }
    })();

    knopf?.addEventListener('click', () => {
      void (async () => {
        knopf.disabled = true;
        if (zeile) zeile.textContent = t('about.checkRunning');
        const { pruefeAufUpdate } = await import('@utils/pwaUpdate.js');
        const ergebnis = await pruefeAufUpdate();
        if (zeile) {
          zeile.textContent = t(
            ergebnis === 'update-bereit'
              ? 'about.checkFound'
              : ergebnis === 'aktuell'
                ? 'about.checkCurrent'
                : 'about.checkUnavailable'
          );
        }
        // Der Fund bekommt seinen Ausgang. Ohne diese Zeile bliebe „gefunden"
        // ein Satz, und der Nutzer stünde wieder da, wo der Befund ihn fand.
        if (anwenden) anwenden.hidden = ergebnis !== 'update-bereit';
        knopf.disabled = false;
      })();
    });
  }

  /**
   * Render the IP comparison table
   */
  private renderIPTable(): string {
    const headers = {
      reference: t('about.ipTable.headers.reference'),
      source: t('about.ipTable.headers.source'),
      protectedScope: t('about.ipTable.headers.protectedScope'),
      soundfuchsDiff: t('about.ipTable.headers.soundfuchsDiff'),
    };

    // We have 6 rows (0-5) stored as object keys in i18n
    const rowIndices = ['0', '1', '2', '3', '4', '5'];

    return `
      <div class="about-ip-table-scroll" tabindex="0" role="region" aria-label="${headers.reference} – ${headers.soundfuchsDiff}">
        <table style="width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9em;">
          <thead>
            <tr style="background: var(--surface-color); border-bottom: 2px solid var(--border-color);">
              <th style="padding: 0.75rem; text-align: left; border: 1px solid var(--border-color);">${headers.reference}</th>
              <th style="padding: 0.75rem; text-align: left; border: 1px solid var(--border-color);">${headers.source}</th>
              <th style="padding: 0.75rem; text-align: left; border: 1px solid var(--border-color);">${headers.protectedScope}</th>
              <th style="padding: 0.75rem; text-align: left; border: 1px solid var(--border-color);">${headers.soundfuchsDiff}</th>
            </tr>
          </thead>
          <tbody>
            ${rowIndices
              .map(
                (index) => `
              <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 0.75rem; border: 1px solid var(--border-color);">${t(`about.ipTable.rows.${index}.reference`)}</td>
                <td style="padding: 0.75rem; border: 1px solid var(--border-color);">${t(`about.ipTable.rows.${index}.source`)}</td>
                <td style="padding: 0.75rem; border: 1px solid var(--border-color);">${t(`about.ipTable.rows.${index}.protectedScope`)}</td>
                <td style="padding: 0.75rem; border: 1px solid var(--border-color);">${t(`about.ipTable.rows.${index}.soundfuchsDiff`)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}
