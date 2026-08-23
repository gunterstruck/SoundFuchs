/**
 * ZANOBOT - MAIN APPLICATION ENTRY POINT
 *
 * Initializes the entire app:
 * - Database
 * - Router (3-phase flow)
 * - UI interactions
 * - PWA service worker
 */

// Import CSS styles (processed by Vite for proper bundling)
import './styles/style.css';
import './styles/toast.css';
import './styles/pipeline-status.css';
import './styles/drift-panel.css';
import './styles/event-timeline.css';
import './styles/spectrogram-3d.css';

// Der Stamm. Datei für Datei unverändert aus TourFuchs übernommen — nicht
// abgeschrieben, kopiert (siehe docs/nutzerreise-wie-tourfuchs.md §0h).
//
// Er steht bewusst NACH `style.css`. Acht Klassennamen kommen in beiden vor:
// topbar, depth-switch, search-results, sheet-grip, status-badge und die drei
// customer-marker-*. Das ist kein Zufall und kein Versehen — es sind genau die
// Stellen, an denen ich den Stamm vorher nachgebaut habe. Wo beide dasselbe
// meinen, soll der Stamm gelten, nicht meine Kopie davon. Die Kopien
// verschwinden, sobald ihre Besitzer hinter das Scharnier gezogen sind.
import './styles/stamm/variables.css';
import './styles/stamm/base.css';
import './styles/stamm/layout.css';
import './styles/stamm/components.css';
import './styles/stamm/map.css';
import './styles/stamm/responsive.css';
import './styles/stamm/tiefe.css';

// Kein Stamm: das Scharnier im Standort-Popup, in seiner Formensprache.
import './styles/scharnier.css';

import { initDB, getDBStats } from '@data/db.js';
import { toast } from '@ui/components/Toast.js';
import { AboutModalController } from '@ui/components/AboutModalController.js';
import { nfcImportService } from '@data/NfcImportService.js';
import { Router } from '@ui/router.js';
import { HashRouter } from '@ui/HashRouter.js';
import { ReferenceLoadingOverlay } from '@ui/components/ReferenceLoadingOverlay.js';
import { notify } from '@utils/notifications.js';
import { logger } from '@utils/logger.js';
import { GlobalSearch } from '@ui/GlobalSearch.js';
import { InfoBottomSheet } from '@ui/components/InfoBottomSheet.js';
import { CustomerMap } from '@ui/components/CustomerMap.js';
import { schaleAufbauen, zeigeKarte } from './stamm/ui/schale.js';
import { releaseInheritedOrientationLock } from './stamm/core/viewport.js';
import {
  scharnierAufbauen,
  schliesseTiefe,
  oeffneTiefe,
  eineStufeZurueck,
  offeneEbene,
  offenerStandortId,
  TIEFE_GESCHLOSSEN,
} from './stamm/ui/scharnier.js';
import { MASCHINENFENSTER_ABGEBROCHEN } from '@ui/phases/MachineDetailModal.js';
import { beispieldatenAnbieten } from './stamm/ui/beispieldaten.js';
import { standortansichtAufbauen } from './stamm/ui/standortansicht.js';
import { standortblattAufbauen } from './stamm/ui/standortblatt.js';
import { maschinenansichtAufbauen } from './stamm/ui/maschinenansicht.js';
import type { Machine } from '@data/types.js';
import { escapeHtml } from '@utils/sanitize.js';
import { initErrorBoundary } from '@utils/errorBoundary.js';
import { initPwaUpdate } from '@utils/pwaUpdate.js';
import {
  applyViewLevel,
  setViewLevel,
  checkFirstLaunch,
  type ViewLevel,
} from '@utils/viewLevelSettings.js';
import { initI18n, t, translateDOM } from './i18n/index.js';
import {
  getDiagnosisAudioMode,
  setDiagnosisAudioMode,
  type DiagnosisAudioMode,
} from '@utils/diagnosisAudioSettings.js';

/**
 * Globale Typdeklarationen für das Inline-Bootstrap in index.html
 */
declare global {
  interface Window {
    ZANOBOT_CONFIG?: Record<string, unknown>;
  }
}

class ZanobotApp {
  private router: Router | null = null;
  /**
   * Die Kundenkarte (docs/kunden-und-karte.md). Leaflet steckt dahinter und
   * wird erst beim ersten Öffnen geholt — das Feld hier kostet nichts.
   */
  private kundenkarte = new CustomerMap({
    /**
     * Das Scharnier in Betrieb: Ein Tipp auf eine Maschine führt in ihre
     * Arbeitsebene — direkt, ohne ein Fenster, das dieselbe Maschine noch
     * einmal auswählen lässt.
     */
    zeigeMaschine: (machine) => this.oeffneMaschine(machine),
    /**
     * Das Scharnier: der angetippte Maschinenstandortname.
     *
     * Dahinter liegt noch die bisherige Oberfläche — die Standortansicht wird
     * im nächsten Schnitt gebaut. Die Tür steht aber schon an ihrem Platz,
     * und was hinter ihr steht, kann getauscht werden, ohne sie anzufassen.
     */
    zeigeStandort: (standortId) => {
      oeffneTiefe(standortId);
    },
  });

  constructor() {
    this.init();
  }

  /**
   * Initialize application
   */
  private async init(): Promise<void> {
    // Initialize error boundary first to catch any errors during initialization
    initErrorBoundary({
      showDetails: import.meta.env.DEV || import.meta.env.MODE === 'development',
    });

    // Initialize i18n FIRST (before any UI text is displayed)
    const detectedLang = initI18n();
    logger.info(`🌐 Language: ${detectedLang}`);

    // First-launch check: apply defaults if the app has never been initialized
    checkFirstLaunch();

    logger.info('🤖 Zanobo AI Assistant starting...');
    logger.info('   Version: 2.0.0 (GMIA Algorithm)');

    // CRITICAL FIX: Wait for DOM with enhanced race condition protection
    // Double-check pattern prevents edge case where event fires between check and listener registration
    if (document.readyState === 'loading') {
      await new Promise<void>((resolve) => {
        let resolved = false;

        // Handler to resolve promise (with guard against multiple calls)
        const handler = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };

        // Set up listener with once: true to ensure it only fires once
        document.addEventListener('DOMContentLoaded', handler, { once: true });

        // RACE CONDITION FIX: Re-check state after adding listener
        // If DOM loaded between initial check and listener registration, manually resolve
        if (document.readyState !== 'loading') {
          document.removeEventListener('DOMContentLoaded', handler);
          handler();
        }

        // SAFETY NET: Timeout to ensure promise resolves even in edge cases
        // If DOM is ready but event somehow didn't fire, resolve after 100ms
        setTimeout(() => {
          if (!resolved && document.readyState !== 'loading') {
            logger.warn('⚠️ DOM ready but DOMContentLoaded did not fire, proceeding anyway');
            handler();
          }
        }, 100);
      });
    }

    // Always call setup after DOM is ready
    await this.setup();
  }

  /**
   * Check browser compatibility before app initialization
   *
   * CRITICAL FIX: Check all required features upfront instead of discovering
   * incompatibility when user tries to use them
   *
   * @returns Compatibility check result with missing features list
   */
  private checkBrowserCompatibility(): { isCompatible: boolean; missing: string[] } {
    const missing: string[] = [];

    // Check Web Audio API
    const hasAudioContext =
      typeof AudioContext !== 'undefined' ||
      typeof (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext !== 'undefined';
    if (!hasAudioContext) {
      missing.push('- Web Audio API (required for audio processing)');
    }

    // Check MediaRecorder API
    if (typeof MediaRecorder === 'undefined') {
      missing.push('- MediaRecorder API (required for audio recording)');
    }

    // Check IndexedDB
    if (typeof indexedDB === 'undefined') {
      missing.push('- IndexedDB (required for data storage)');
    }

    // Check AudioWorklet support (needed for real-time diagnosis)
    try {
      if (typeof AudioContext !== 'undefined' && !('audioWorklet' in AudioContext.prototype)) {
        missing.push('- AudioWorklet (required for real-time diagnosis)');
      }
    } catch {
      // AudioContext might not be available, already caught above
    }

    return {
      isCompatible: missing.length === 0,
      missing,
    };
  }

  /**
   * Setup application after DOM is ready
   *
   * CRITICAL FIX: Graceful degradation - UI initializes even if database fails
   * This ensures buttons and event listeners are set up regardless of DB status
   */
  private async setup(): Promise<void> {
    // CRITICAL FIX: Check browser compatibility FIRST before any initialization
    const compatibility = this.checkBrowserCompatibility();

    if (!compatibility.isCompatible) {
      logger.error('❌ Browser compatibility check failed');
      logger.error('   Missing features:');
      compatibility.missing.forEach((feature) => logger.error(`   ${feature}`));

      notify.error(
        t('app.browserNotSupported', { features: compatibility.missing.join('\n') }),
        new Error('Browser incompatible'),
        { title: t('app.browserNotSupportedTitle'), duration: 0 }
      );

      // Don't initialize app if incompatible
      return;
    }

    logger.info('✅ Browser compatibility check passed');

    let dbAvailable = false;

    // Initialize database (with graceful degradation)
    try {
      logger.info('📦 Initializing database...');
      await initDB();

      const stats = await getDBStats();
      logger.info(`   Machines: ${stats.machines}`);
      logger.info(`   Recordings: ${stats.recordings}`);
      logger.info(`   Diagnoses: ${stats.diagnoses}`);
      dbAvailable = true;

      // UX (geführter Erst-Lauf): Ohne Maschinen stehen die Startkarten in
      // Workflow-Reihenfolge (①②③ mit Schritt-Badges) statt „Prüfen zuerst".
      // Schon beim App-Start setzen — der Dashboard-Renderer hält die Klasse
      // danach aktuell (DashboardRenderer.update()).
      document.body.classList.toggle('zb-first-run', stats.machines === 0);

      // UPDATE-/DATEN-SICHERHEIT (Betreiber-Anforderung): Persistenten
      // Speicher anfordern. Ohne "persistent" darf der Browser die
      // IndexedDB bei Speicherdruck STILL löschen (Best-Effort-Eviction) —
      // das ist im Feld die reale Datenverlust-Ursache, nicht App-Updates
      // (Migrationen sind ab v3 additiv, s. Policy in data/db.ts).
      // Fire-and-forget: Ablehnung ist kein Fehler, nur ein Log.
      if (navigator.storage?.persist) {
        void navigator.storage
          .persisted()
          .then(async (already) => {
            const granted = already || (await navigator.storage.persist());
            logger.info(
              granted
                ? '🔒 Persistenter Speicher aktiv – Datenbank ist vor Browser-Eviction geschützt'
                : 'ℹ️ Persistenter Speicher nicht gewährt (Browser-Heuristik) – Daten bleiben Best-Effort'
            );
          })
          .catch(() => {
            /* Storage-API nicht verfügbar – ignorieren */
          });
      }

      // Check for database migration notification
      this.checkMigrationNotification();
    } catch (error) {
      logger.error('❌ Database initialization failed:', error);
      logger.warn('⚠️ Continuing without database - functionality will be limited');
      notify.error(t('settings.databaseNotAvailable'), error as Error, {
        title: t('modals.databaseError'),
        duration: 0,
      });
    }

    // NFC IMPORT CHECK: Handle ?importUrl= parameter from NFC deep links
    // Must run BEFORE router initialization to show import dialog first
    if (dbAvailable) {
      await this.handleNfcImport();
    }

    // URL IMPORT CHECK: Handle #/import?url=<url> deep links from NFC tags / QR codes
    // Must run BEFORE router initialization to process import first
    if (dbAvailable) {
      const urlImportHandled = await this.handleUrlImport();
      if (urlImportHandled) {
        // Import was processed - page will reload, skip further init
        return;
      }
    }

    // CRITICAL FIX: Always initialize UI components (even without database)
    // This ensures buttons have event listeners and the app is interactive
    try {
      // Initialize router (3-phase flow)
      logger.info('🔀 Initializing router...');
      this.router = new Router();

      // Setup UI interactions
      this.setupCollapsibleSections();
      this.setupViewLevelSelector();
      this.setupDiagnosisAudioSelector();
      this.setupFooterLinks();
      this.setupGlobalSearch();
      this.setupInfoButton();
      this.setupStamm();

      // Initialize About Modal with dynamic i18n content
      new AboutModalController();

      // Translate static DOM elements based on detected language
      translateDOM();

      // Service Worker registration + active update handling (discreet prompt,
      // measurement-safe reload, once-daily re-prompt). See utils/pwaUpdate.ts.
      initPwaUpdate();

      if (dbAvailable) {
        logger.info('✅ Zanobo initialized successfully!');
      } else {
        logger.warn('⚠️ Zanobo initialized with limited functionality (no database)');
        logger.warn('   Some features may not work correctly without database access');
      }
    } catch (error) {
      logger.error('❌ UI initialization failed:', error);
      notify.error(t('app.uiLoadFailed'), error as Error, {
        title: t('app.fatalError'),
        duration: 0,
      });
    }
  }

  /**
   * Check for database migration notification
   *
   * If a breaking migration occurred (v3), show a warning toast to inform
   * the user that their data was cleared.
   */
  private checkMigrationNotification(): void {
    const MIGRATION_KEY = 'zanobot-migration-v3-occurred';

    try {
      const migrationInfo = localStorage.getItem(MIGRATION_KEY);
      if (!migrationInfo) {
        return;
      }

      // Parse and validate migration info
      const info = JSON.parse(migrationInfo) as {
        timestamp: number;
        oldVersion: number;
        newVersion: number;
        dataCleared: boolean;
      };

      // Clear the flag so we don't show the notification again
      localStorage.removeItem(MIGRATION_KEY);

      if (info.dataCleared) {
        logger.warn('⚠️ Database migration v3 notification shown to user');

        // Show warning toast (persistent until dismissed)
        toast.warning(
          t('migration.dataCleared'),
          t('migration.title'),
          0 // 0 = permanent, requires manual close
        );
      }
    } catch (error) {
      // If we can't parse the migration info, just clear it
      logger.warn('⚠️ Could not parse migration info:', error);
      try {
        localStorage.removeItem(MIGRATION_KEY);
      } catch {
        // Ignore localStorage errors
      }
    }
  }

  /**
   * Handle NFC deep link import
   *
   * Checks for ?importUrl= parameter and handles the import workflow:
   * 1. Fetch and validate import data
   * 2. Show confirmation dialog
   * 3. Import data if confirmed
   *
   * Security: Never auto-imports - always requires user confirmation
   */
  private async handleNfcImport(): Promise<void> {
    // Check if URL contains import parameter
    const check = nfcImportService.checkForImportUrl();

    if (!check.hasImportUrl) {
      return;
    }

    logger.info('🔗 NFC import URL detected, starting import workflow...');

    // Fetch and validate the import data
    const fetchResult = await nfcImportService.fetchAndValidate();

    if (!fetchResult.success) {
      logger.error(`❌ NFC import validation failed: ${fetchResult.error}`);
      nfcImportService.showErrorModal(fetchResult.errorMessage || t('nfcImport.error'));
      return;
    }

    // Show confirmation dialog and handle import
    try {
      const imported = await nfcImportService.showConfirmationAndImport();

      if (imported) {
        logger.info('✅ NFC import completed successfully');
        notify.success(t('nfcImport.success'), { title: t('nfcImport.successTitle') });

        // Reload the page to reflect imported data
        // Small delay to show success notification
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (error) {
      logger.error('❌ NFC import failed:', error);
      notify.error(t('nfcImport.error'), error as Error, { title: t('nfcImport.errorTitle') });
    }
  }

  /**
   * Handle URL-based database import via deep link
   *
   * Checks for #/import?url=<url> hash route and handles the import workflow:
   * 1. Parse hash to detect import route
   * 2. Show loading overlay
   * 3. Fetch, validate, and import database from URL
   * 4. Show success/error feedback
   * 5. Reload to IdentifyPhase on success
   *
   * Security:
   * - Only JSON data is processed (HTML/scripts rejected)
   * - GitHub blob URLs are auto-converted to raw URLs
   * - Size limit enforced (50 MB)
   *
   * @returns true if an import route was detected and handled
   */
  private async handleUrlImport(): Promise<boolean> {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#/import')) {
      return false;
    }

    // Parse the hash to extract import URL
    const hashRouter = new HashRouter();
    const match = hashRouter.parseHash(hash);

    if (match.type !== 'import' || !match.importUrl) {
      return false;
    }

    logger.info(`🔗 URL import deep link detected: ${match.importUrl}`);

    // Show loading overlay
    const overlay = new ReferenceLoadingOverlay();
    overlay.show();
    overlay.updateStatus(t('urlImport.statusFetching') || 'Datenbank wird geladen...', 10);

    // Perform import
    const result = await nfcImportService.importFromExternalUrl(match.importUrl, {
      onProgress: (status) => {
        // Advance progress bar based on status
        const progressMap: Record<string, number> = {
          [t('urlImport.statusFetching') || 'fetching']: 30,
          [t('urlImport.statusValidating') || 'validating']: 60,
          [t('urlImport.statusImporting') || 'importing']: 85,
        };
        const progress = progressMap[status] || 50;
        overlay.updateStatus(status, progress);
      },
      onError: (errorMessage) => {
        overlay.showError(errorMessage);
      },
    });

    if (result.success) {
      // Show success on overlay
      overlay.showSuccess();

      // Show success toast
      const meta = result.metadata;
      const details = meta
        ? `${meta.machineCount} Maschinen, ${meta.recordingCount} Aufnahmen, ${meta.diagnosisCount} Prüfungen`
        : '';

      notify.success(
        details
          ? `${t('urlImport.success') || 'Datenbank erfolgreich importiert!'}\n\n${details}`
          : t('urlImport.success') || 'Datenbank erfolgreich importiert!',
        { title: t('urlImport.successTitle') || 'Import abgeschlossen' }
      );

      // Reload to IdentifyPhase (Phase 1) to show imported machines
      setTimeout(() => {
        window.location.reload();
      }, 1800);

      return true;
    } else {
      // Error was already shown on overlay via onError callback
      // Also show as notification for persistence
      notify.error(
        result.errorMessage || t('urlImport.errorGeneric') || 'Import fehlgeschlagen.',
        undefined,
        { title: t('urlImport.errorTitle') || 'Import fehlgeschlagen' }
      );

      // Hide overlay after showing error
      setTimeout(() => overlay.hide(), 3000);

      // Clean hash so user doesn't get stuck in a loop
      window.history.replaceState(null, '', window.location.pathname + window.location.search);

      return true;
    }
  }

  /**
   * Setup collapsible sections
   *
   * CRITICAL FIX: Preserve original display mode (flex, grid, etc.)
   * instead of hardcoding 'block'. Also check computed style instead
   * of only inline style to handle CSS-defined visibility.
   *
   * CRITICAL FIX: Added debouncing to prevent issues from rapid clicks
   *
   * ENHANCEMENT: Secondary cards expand to full width when opened
   * Applies to: "Maschine auswählen" & "Referenz aufnehmen"
   */
  private setupCollapsibleSections(): void {
    const headers = document.querySelectorAll('.section-header');
    let isAnimating = false;

    // Helper: Check if a card is a secondary card (first two in main-actions)
    const isSecondaryCard = (element: Element | null): boolean => {
      if (!element) return false;
      const container = element.closest('.main-container');
      if (!container) return false;
      const parent = container.parentElement;
      if (!parent?.classList.contains('main-actions')) return false;
      const children = Array.from(parent.children).filter((el) =>
        el.classList.contains('main-container')
      );
      const index = children.indexOf(container);
      // Only first two cards are secondary (index 0 and 1)
      return index === 0 || index === 1;
    };

    // Helper: Update expanded class on secondary cards
    const updateExpandedClass = (container: Element | null, shouldExpand: boolean): void => {
      if (!container || !isSecondaryCard(container)) return;
      if (shouldExpand) {
        container.classList.add('expanded');
      } else {
        container.classList.remove('expanded');
      }
    };

    const updateCompactExpandedState = () => {
      const contents = Array.from(document.querySelectorAll<HTMLElement>('.collapsible-content'));
      const hasOpenSection = contents.some(
        (content) => window.getComputedStyle(content).display !== 'none'
      );
      document.body.classList.toggle('compact-expanded', hasOpenSection);
    };

    headers.forEach((header) => {
      header.addEventListener('click', () => {
        // CRITICAL FIX: Debounce to prevent double-clicks causing UI issues
        if (isAnimating) {
          return;
        }
        isAnimating = true;

        const target = header.getAttribute('data-target');
        if (!target) {
          isAnimating = false;
          return;
        }

        const content = document.getElementById(target);
        if (!content) {
          isAnimating = false;
          return;
        }

        // Get the container for expanded class management
        const container = header.closest('.main-container');

        // CRITICAL FIX: Store original display mode on first interaction
        // This preserves flex, grid, or any other display value
        if (!content.dataset.originalDisplay) {
          const computedStyle = window.getComputedStyle(content);
          content.dataset.originalDisplay = computedStyle.display;
        }

        // CRITICAL FIX: Check computed style instead of inline style
        // This correctly handles CSS-defined visibility
        const computedDisplay = window.getComputedStyle(content).display;
        const isVisible = computedDisplay !== 'none';

        // Toggle visibility while preserving original display mode
        if (isVisible) {
          content.style.display = 'none';
          // Remove expanded class when closing
          updateExpandedClass(container, false);
        } else {
          headers.forEach((otherHeader) => {
            if (otherHeader === header) {
              return;
            }

            const otherTarget = otherHeader.getAttribute('data-target');
            if (!otherTarget) {
              return;
            }

            const otherContent = document.getElementById(otherTarget);
            if (!otherContent) {
              return;
            }

            if (window.getComputedStyle(otherContent).display !== 'none') {
              otherContent.style.display = 'none';
              // Remove expanded class from other cards
              const otherContainer = otherHeader.closest('.main-container');
              updateExpandedClass(otherContainer, false);
            }

            const otherIcon = otherHeader.querySelector('.collapse-icon');
            if (otherIcon) {
              otherIcon.classList.remove('rotated');
            }
          });

          // CRITICAL FIX: Restore original display mode instead of hardcoding 'block'
          const originalDisplay = content.dataset.originalDisplay;
          content.style.display =
            originalDisplay && originalDisplay !== 'none' ? originalDisplay : '';
          // Add expanded class when opening
          updateExpandedClass(container, true);
        }

        // Rotate icon
        const icon = header.querySelector('.collapse-icon');
        if (icon) {
          icon.classList.toggle('rotated');
        }

        updateCompactExpandedState();

        // CRITICAL FIX: Reset debounce flag after animation completes (300ms matches CSS transition)
        // Using requestAnimationFrame ensures the timeout executes reliably even under heavy load
        setTimeout(() => {
          requestAnimationFrame(() => {
            isAnimating = false;
          });
        }, 300);
      });
    });

    updateCompactExpandedState();
  }

  /**
   * Farbe der Browserleiste an den Seitengrund angleichen, damit sie nicht als
   * Fremdkörper über der App steht. Liest --bg-primary, das je nach
   * prefers-color-scheme hell oder dunkel ist.
   */
  private updateThemeColorMeta(): void {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim();
    if (bg) meta.setAttribute('content', bg);
  }

  /**
   * Den Stamm in Betrieb nehmen.
   *
   * Bis zum 16.08.2026 stand hier ein Schalter zwischen alter und neuer
   * Schale. Er ist ersatzlos entfernt: Es gibt keine zwei Schalen mehr, an
   * denen man sich entscheiden könnte. Der Stamm ist die Oberfläche
   * (docs/nutzerreise-wie-tourfuchs.md §0h).
   */
  private setupStamm(): void {
    /**
     * Eine geerbte Hochformatsperre lösen — einmal, beim Start.
     *
     * Eine **installierte** PWA behält das Manifest ihres
     * Installationszeitpunkts. Stand darin einmal `orientation: 'portrait'`,
     * hängt das Gerät bis heute im Hochformat fest, auch wenn im Quelltext
     * längst nichts mehr davon steht — und im Manifest steht nichts, geprüft.
     *
     * Auf einem Tablet ist das der Unterschied zwischen „Schreibtisch per
     * Drehung" und „geht gar nicht": Ohne diese Zeile bekäme das Gerät nie das
     * zweite Gesicht zu sehen, und die ganze Arbeit an der Gesichtsgrenze wäre
     * dort unsichtbar. Eine Neuinstallation räumt die Sperre endgültig weg;
     * das hier hilft allen, die nicht neu installieren.
     */
    releaseInheritedOrientationLock();
    schaleAufbauen();
    scharnierAufbauen();
    standortansichtAufbauen({
      zeigeMaschine: (machine) => this.oeffneMaschine(machine),
      neueMaschine: (standortId) => this.neueMaschineAmStandort(standortId),
      starteReihe: (ids, name) => this.starteReihe(ids, name),
    });

    // Das Blatt der Standortebene: Verlauf und Reihenbefund. Es öffnet
    // Maschinen über denselben Weg wie die Liste darüber.
    standortblattAufbauen({ zeigeMaschine: (machine) => this.oeffneMaschine(machine) });

    maschinenansichtAufbauen({
      aktuelleMaschine: () => this.offeneMaschine,
      starteNaechstenSchritt: (machine) => this.starteArbeit(machine),
      zeigeVerlauf: (machine) => this.router?.zeigeVerlauf(machine),
      zeigeMaschine: (machine) => this.oeffneMaschine(machine),
      uebernimmMaschine: (machine) => {
        this.offeneMaschine = machine;
      },
    });

    /**
     * Beim Zurückkommen die Karte auffrischen.
     *
     * Hinter dem Scharnier wird angelegt, geprüft und gelöscht — die Karte
     * weiß davon nichts. Solange sie ein Fenster war, zeichnete sie bei jedem
     * Öffnen neu; als Grund wird sie nie geöffnet, also auch nie neu
     * gezeichnet. Gemessen im Aufmerksamkeitstest: ein frisch angelegter
     * Standort mit gültigen Koordinaten stand nicht auf der Karte, und nichts
     * meldete das — die Karte war einfach von vorhin.
     */
    document.addEventListener(TIEFE_GESCHLOSSEN, () => {
      void this.kundenkarte.zeigeImGrund();
    });

    /**
     * Das Maschinenfenster abgebrochen — also eine Stufe zurück.
     *
     * Ohne das landete man auf der bisherigen Maschinenliste: der Ebene, aus
     * der man gar nicht gekommen ist. Der Weg herein führte über den Standort,
     * und der Weg hinaus soll derselbe sein.
     */
    document.addEventListener(MASCHINENFENSTER_ABGEBROCHEN, () => {
      if (offeneEbene() === 'maschine') eineStufeZurueck();
    });
    void (async () => {
      await this.kundenkarte.zeigeImGrund();
      // Erst die Karte, dann die Punkte. Andersherum stünde beim ersten
      // Besuch kurz ein leerer Umriss, in den dann etwas hineinspringt.
      await beispieldatenAnbieten({
        zeichneNeu: () => this.kundenkarte.zeigeImGrund(),
      });
    })();
  }

  /**
   * Die Maschine, an der gerade gearbeitet wird.
   *
   * Sie steht hier und nicht in der Ansicht: Der Router kennt sie ohnehin, und
   * zwei Stellen, die sich dasselbe merken, laufen auseinander, sobald nur
   * eine davon aufgeräumt wird.
   */
  private offeneMaschine: Machine | null = null;

  /**
   * Eine Maschine öffnen — der Weg durch das Scharnier.
   *
   * Hier stand bis zum 17.08.2026 `router.showMachineView()`. Das öffnete ein
   * Fenster, in dem man die Maschine auswählen konnte, die man gerade
   * angetippt hatte, und dahinter lag der ganze Bestand: 130 Zeilen, 178
   * fokussierbare Elemente, 10 174 px. Der Inhalt IST die Navigation — eine
   * Maschinenzeile führt in die Maschine, nicht in eine zweite Frage danach.
   */
  private oeffneMaschine(machine: Machine): void {
    this.offeneMaschine = machine;
    oeffneTiefe(machine.customerId ?? null, 'maschine');
  }

  /**
   * Den nächsten Schritt auslösen — Aufnahme oder Prüfung.
   *
   * Was genau, entscheidet der Router: Er trifft dieselbe Entscheidung schon
   * für `MASCHINE_GEWAEHLT` (Normalzustand vorhanden → prüfen, sonst
   * aufnehmen). Sie hier zu wiederholen wäre eine zweite Stelle, an der sie
   * falsch sein kann.
   *
   * Die Arbeitsebene ist bis auf Weiteres die bisherige Oberfläche. Sie trägt
   * Aufnahme, Prüfung, Kamerabild, Abspielen und das 3D-Gebirge; sie wird in
   * den nächsten Schnitten ersetzt, nicht in diesem.
   */
  private starteArbeit(machine: Machine): void {
    this.offeneMaschine = machine;
    oeffneTiefe(machine.customerId ?? null, 'arbeit');
    this.router?.waehleMaschine(machine);
  }

  /**
   * Eine Reihe gleichartiger Maschinen nacheinander prüfen.
   *
   * Der Flottenlauf lebt in der bisherigen Oberfläche: Er sagt an, zu welcher
   * Maschine man gehen soll, löst dort die Prüfung aus und zählt mit. Deshalb
   * geht zuerst die Arbeitsebene auf — läge die Standortansicht noch davor,
   * würde er auf Knöpfe tippen, die hinter ihr stehen.
   *
   * Die Reihenfolge und wer überhaupt dazugehört, entscheidet die
   * Standortansicht; hier wird nur der Weg freigemacht und übergeben.
   */
  private starteReihe(maschinenIds: string[], flottenname: string): void {
    if (maschinenIds.length < 2) return;
    oeffneTiefe(offenerStandortId(), 'arbeit');
    this.router?.startFleetQueue(maschinenIds, flottenname);
  }

  /**
   * „Neue Maschine anlegen" aus einem Standort heraus.
   *
   * Der Weg führt in das Anlegen-Formular der bisherigen Oberfläche — es steht,
   * es ist geprüft, und es gehört zur Maschinenebene. Neu ist nur, dass der
   * Standort dort schon eingetragen ist: Wer aus einem Standort heraus anlegt,
   * hat gerade gesagt, welcher gemeint ist. Ihn danach aus einer Liste zu
   * wählen wäre eine Frage nach etwas Bekanntem.
   *
   * Das Auswahlfeld wird von `CustomerField` gefüllt, und das geschieht beim
   * Aufklappen des Formulars — also asynchron. Deshalb wird nach dem Klick
   * gewartet, bis der Eintrag da ist, statt sofort zu setzen und zu hoffen.
   */
  private neueMaschineAmStandort(standortId: string): void {
    // Die Bestandsebene, nicht die Arbeitsebene: Das Anlegen-Formular liegt in
    // der Bestandskarte, und die ist überall sonst mit Absicht draußen.
    oeffneTiefe(standortId, 'bestand');
    document.getElementById('add-new-machine-btn')?.click();

    const frist = Date.now() + 3000;
    const versuche = (): void => {
      const feld = document.getElementById('machine-customer-select') as HTMLSelectElement | null;
      const treffer = feld && [...feld.options].some((o) => o.value === standortId);
      if (treffer && feld) {
        feld.value = standortId;
        feld.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      if (Date.now() < frist) {
        window.setTimeout(versuche, 120);
        return;
      }
      // Kein Grund zum Abbrechen: Das Formular steht, nur die Vorbelegung
      // fehlt. Der Nutzer wählt den Standort dann selbst — unschön, nicht
      // kaputt. Gemeldet wird es trotzdem, sonst sucht man den Fehler später
      // an der falschen Stelle.
      logger.warn(`Standort ${standortId} war im Auswahlfeld nicht zu finden`);
    };
    versuche();
  }

  /**
   * Setup view level selector (Basic / Advanced / Expert)
   *
   * This controls the UI complexity based on user preference.
   * The view level is persisted in localStorage.
   */
  private setupViewLevelSelector(): void {
    // Apply saved view level on startup
    const savedLevel = applyViewLevel();
    logger.info(`👁️ View level set to: ${savedLevel}`);

    // Get all view level buttons
    const viewLevelBtns = document.querySelectorAll<HTMLButtonElement>(
      '.view-level-btn[data-level]'
    );

    // Set initial active state
    viewLevelBtns.forEach((btn) => {
      const level = btn.getAttribute('data-level') as ViewLevel;
      if (level === savedLevel) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Add click handlers
    viewLevelBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const level = btn.getAttribute('data-level') as ViewLevel;
        if (!level) return;

        // Apply the new view level
        setViewLevel(level);
        logger.debug(`👁️ View level changed to: ${level}`);

        // Update active state on all buttons
        viewLevelBtns.forEach((b) => {
          if (b.getAttribute('data-level') === level) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });
      });
    });
  }

  /**
   * Setup the diagnosis-audio retention selector (None / Latest / All).
   * Controls whether measurement audio is kept so a past check can later be
   * re-opened with A/B listening.
   */
  private setupDiagnosisAudioSelector(): void {
    const btns = document.querySelectorAll<HTMLButtonElement>('.view-level-btn[data-audio-mode]');
    if (btns.length === 0) return;

    const current = getDiagnosisAudioMode();
    const applyActive = (mode: DiagnosisAudioMode) => {
      btns.forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-audio-mode') === mode);
      });
    };
    applyActive(current);

    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-audio-mode') as DiagnosisAudioMode | null;
        if (!mode) return;
        try {
          const saved = setDiagnosisAudioMode(mode);
          applyActive(saved);
        } catch (error) {
          logger.warn('Could not save diagnosis audio setting:', error);
        }
      });
    });
  }

  /**
   * Setup footer links (Impressum, Datenschutz, Über Zanobot)
   */
  /**
   * Suche in der Kopfleiste einhängen.
   *
   * Ein Treffer öffnet die Maschinenansicht — denselben Weg, den auch ein Tipp
   * auf eine Zeile der Übersicht nimmt. Wer sucht, will zuerst sehen; geprüft
   * wird von dort aus mit einem zweiten, bewussten Tipp.
   *
   * Der Aufruf geht über den Router, weil `main` die Phasen nicht kennt. Bis
   * zum 14.08.2026 stand hier stattdessen ein `location.hash = '#/identify?…'`
   * — eine Route, die es nie gab: Der Treffer änderte nur die Adresszeile und
   * sonst nichts. Ein Aufruf, der ins Leere zeigt, fällt still aus; ein
   * Methodenaufruf tut das nicht.
   */
  private setupGlobalSearch(): void {
    const suche = new GlobalSearch((machine) => {
      this.router?.showMachineView(machine);
    });
    if (!suche.istVerfuegbar) return;
    suche.init();
    logger.debug('🔍 Suche in der Kopfleiste bereit');
  }

  /**
   * Das Schiebefenster „Einstellungen & mehr" öffnen.
   *
   * ── DIE FEHLENDE ZOOMSTUFE ──────────────────────────────────────────────
   *
   * Bis zum 14.08.2026 standen hier vier Zeilen, und hinter der ersten lag
   * alles: sechs Einstellungs-Kategorien unter Basis, dreizehn unter Profi,
   * 28 Bedienelemente. Zwischen „ich will etwas einstellen" und „hier ist
   * alles" gab es keine Stufe — man sprang von vier Wörtern in eine Wand.
   *
   * Jetzt führt das Fenster die Themen selbst auf, in drei Gruppen. Ein Tipp
   * öffnet den Einstellungen-Dialog **nur mit diesem Thema** (der Dialog
   * bekommt `data-filter`, s. style.css). Von dort führt ein Rückweg auf alle
   * Einstellungen. Das ist der Semantische Zoom: Jede Stufe zeigt so viel,
   * wie man auf ihr entscheiden muss, und nicht mehr.
   *
   * Die Fußzeile bleibt im Markup — verborgen, aber vollständig verdrahtet.
   * Über SoundFuchs, Datenschutz und Impressum lösen weiterhin ihre Knöpfe
   * dort aus, statt deren Logik nachzubauen.
   */
  private async oeffneEinstellungsfenster(): Promise<void> {
    /**
     * Zeigt dieses Thema auf der aktuellen Stufe überhaupt etwas?
     *
     * Ohne diese Frage stünde unter Basis eine Zeile „Raum & Störgeräusche",
     * hinter der zwei von drei Kategorien verborgen wären — oder schlimmer,
     * gar keine. Ein Knopf gehört dorthin, wo er hinführt; dieselbe Regel wie
     * bei „Details" im Prüfergebnis, nur hier zur Laufzeit statt in CSS.
     */
    const themaHatInhalt = (thema: string): boolean =>
      Array.from(
        document.querySelectorAll<HTMLElement>(`.setting-category[data-thema~="${thema}"]`)
      ).some((kat) => window.getComputedStyle(kat).display !== 'none');

    // Die Karte steht immer im Menü.
    //
    // Bis zum 15.08.2026 erschien die Zeile nur, wenn schon ein Kunde verortet
    // war — mit der Begründung, ein Knopf dürfe nicht auf ein leeres graues
    // Feld führen. Die Regel stimmt, ihre Anwendung war hier falsch und
    // ergab eine Falle: Ohne Kunden keine Karte, und der einzige bequeme Weg
    // zu Kunden (die Beispieldaten) lag hinter derselben verborgenen Tür.
    // Gemessen in der Lage des Auftraggebers — Basis-Stufe, eine Maschine,
    // kein Kunde — war beides unerreichbar, auf Profi immer noch die Karte.
    //
    // Das graue Feld gehört gefüllt, nicht die Tür zugemauert: Die Karte
    // zeigt jetzt auch ohne Kunden Deutschland mit seinen
    // Postleitzahlgebieten und bietet darin den Schritt an, der sie füllt.

    type Zeile =
      | { art: 'thema'; thema: string; icon: string; key: string }
      | { art: 'knopf'; id: string; icon: string; key: string }
      | { art: 'karte'; icon: string; key: string }
      | { art: 'bald'; icon: string; key: string };

    const gruppen: Array<{ titel: string; zeilen: Zeile[] }> = [
      {
        titel: t('sheet.groupCheck'),
        zeilen: [
          { art: 'thema', thema: 'pruefen', icon: '🎚', key: 'sheet.recording' },
          { art: 'thema', thema: 'raum', icon: '📐', key: 'sheet.room' },
          // Wohin das Geräusch-Briefing geht. Eine eigene Zeile und nicht unter
          // „Aufnahme & Prüfung": Das ist keine Einstellung der Messung,
          // sondern die Entscheidung, an wen man das Ergebnis weitergibt.
          { art: 'thema', thema: 'werkzeug', icon: '🤖', key: 'sheet.tool' },
        ],
      },
      {
        titel: t('sheet.groupMachines'),
        zeilen: [
          { art: 'thema', thema: 'etiketten', icon: '🏷', key: 'sheet.labels' },
          { art: 'thema', thema: 'standorte', icon: '🧾', key: 'sheet.customerData' },
          { art: 'thema', thema: 'daten', icon: '💾', key: 'sheet.data' },
          { art: 'karte', icon: '🗺', key: 'sheet.map' },
          { art: 'bald', icon: '🔐', key: 'sheet.vault' },
        ],
      },
      {
        titel: t('sheet.groupApp'),
        zeilen: [
          { art: 'thema', thema: 'ansicht', icon: '🌱', key: 'sheet.view' },
          { art: 'knopf', id: 'about-btn', icon: '🦊', key: 'footer.about' },
          { art: 'knopf', id: 'datenschutz-btn', icon: '🛡️', key: 'footer.privacy' },
          { art: 'knopf', id: 'impressum-btn', icon: '§', key: 'footer.impressum' },
        ],
      },
    ];

    const zeileHtml = (z: Zeile): string => {
      const kopf = `<span class="info-sheet-icon">${z.icon}</span><span class="info-sheet-label">${escapeHtml(t(z.key))}</span>`;
      if (z.art === 'bald') {
        // Kein Knopf, sondern eine Ankündigung: Sie sagt, dass es kommt, und
        // täuscht nicht vor, dass man schon darauf tippen könnte.
        return `<div class="info-sheet-row info-sheet-row-soon">${kopf}<span class="info-sheet-soon">${escapeHtml(t('sheet.soon'))}</span></div>`;
      }
      const ziel =
        z.art === 'thema'
          ? `data-thema="${z.thema}" data-label="${escapeHtml(t(z.key))}"`
          : z.art === 'karte'
            ? 'data-karte="1"'
            : `data-target="${escapeHtml(z.id)}"`;
      return `<button type="button" class="info-sheet-row" ${ziel}>${kopf}<span class="info-sheet-arrow">›</span></button>`;
    };

    const inhalt = gruppen
      .map((g) => {
        const zeilen = g.zeilen.filter((z) => {
          if (z.art === 'thema') return themaHatInhalt(z.thema);
          if (z.art === 'knopf') return Boolean(document.getElementById(z.id));
          return true;
        });
        if (zeilen.length === 0) return '';
        return (
          `<p class="info-sheet-group">${escapeHtml(g.titel)}</p>` + zeilen.map(zeileHtml).join('')
        );
      })
      .join('');

    InfoBottomSheet.show({ title: t('search.sheetTitle'), icon: '⚙️', content: inhalt });

    requestAnimationFrame(() => {
      // Der Weg über die verborgene Fußzeile: Der Klick reicht durch.
      document.querySelectorAll<HTMLElement>('.info-sheet-row[data-target]').forEach((zeile) => {
        zeile.addEventListener('click', () => {
          const ziel = document.getElementById(zeile.dataset.target ?? '');
          InfoBottomSheet.close();
          ziel?.click();
        });
      });

      // Der Weg auf die Karte.
      document.querySelectorAll<HTMLElement>('.info-sheet-row[data-karte]').forEach((zeile) => {
        zeile.addEventListener('click', () => {
          InfoBottomSheet.close();
          // Die Karte ist der Grund, kein Fenster. Ein Fenster zu öffnen wäre
          // eine Sackgasse: Es stünde leer da, weil die Karte längst darunter
          // liegt. Stattdessen zurück aus der Tiefe und auf den Karten-Reiter —
          // das ist derselbe Wunsch.
          schliesseTiefe();
          // Einen Karten-Reiter gibt es nicht mehr (siehe `REITER` in
          // stamm/ui/schale.ts). Die Karte wird frei, indem das Blatt zugeht —
          // am Schreibtisch ist dafür nichts zu tun, dort steht sie neben der
          // Seitenleiste.
          zeigeKarte();
        });
      });

      // Der Weg in ein Thema: Einstellungen öffnen und auf das Thema stellen.
      document.querySelectorAll<HTMLElement>('.info-sheet-row[data-thema]').forEach((zeile) => {
        zeile.addEventListener('click', () => {
          // Die Beschriftung kommt aus `data-label`, nicht aus dem Text der
          // Zeile: Der enthält auch das Symbol und den Pfeil, und die stünden
          // sonst in der Überschrift des Dialogs.
          const thema = zeile.dataset.thema ?? '';
          InfoBottomSheet.close();
          this.oeffneEinstellungenMitThema(thema, zeile.dataset.label ?? '');
        });
      });
    });
  }

  /**
   * Den Einstellungen-Dialog öffnen und auf ein Thema stellen.
   *
   * Gefiltert wird über ein Attribut am Container, nicht durch Umbauen des
   * Markups: Die Kategorien bleiben, wo sie sind, samt ihrer Verdrahtung und
   * ihrer Stufen-Regeln. Beim Weg über die verborgene Fußzeile fehlt das
   * Attribut, und der Dialog zeigt wie bisher alles.
   */
  private oeffneEinstellungenMitThema(thema: string, beschriftung: string): void {
    const liste = document.querySelector<HTMLElement>('.settings-list');
    const titel = document.getElementById('settings-title');
    if (liste) liste.dataset.filter = thema;
    if (titel && beschriftung) titel.textContent = beschriftung;

    // Rückweg auf alle Einstellungen — einmal anlegen, danach wiederverwenden.
    if (liste && !liste.querySelector('.settings-back')) {
      const zurueck = document.createElement('button');
      zurueck.type = 'button';
      zurueck.className = 'settings-back';
      zurueck.innerHTML = `<span aria-hidden="true">‹</span><span></span>`;
      zurueck.addEventListener('click', () => {
        delete liste.dataset.filter;
        if (titel) titel.textContent = t('settingsUI.title');
        zurueck.remove();
      });
      liste.insertBefore(zurueck, liste.firstChild);
    }
    const beschriftungEl = liste?.querySelector('.settings-back span:last-child');
    if (beschriftungEl) beschriftungEl.textContent = t('settingsUI.allSettings');

    document.getElementById('settings-btn')?.click();
  }

  /**
   * Die zwei Auslöser für das Schiebefenster verdrahten.
   *
   * Oben rechts der ⓘ-Knopf, unten der Griff am Bildschirmrand. Das ist kein
   * zweiter Weg zum selben Ziel, sondern derselbe Weg für eine andere Hand: Wer
   * das Gerät hält und mit der freien Hand an einer Maschine steht, erreicht
   * oben rechts nichts. Unten schon. Beide Punkte stehen so im Entwurf der
   * Startseite (docs/startseite-entwurf.md, Bild A).
   *
   * `#btn-info` ist der ⓘ-Knopf des Stamms — er hieß bis zum 16.08.2026
   * `#app-info-btn` und sitzt in der Kopfleiste, die über der Tiefe stehen
   * bleibt. Genau deshalb steht sie dort: Ohne sie wären die Einstellungen
   * hinter dem Scharnier unerreichbar, und „Einstellungen" in der Fußzeile
   * steht nur auf Profi — also auf der Stufe, die man dort erst einschalten
   * wollte.
   */
  private setupInfoButton(): void {
    const ausloeser = [
      document.getElementById('btn-info'),
      document.getElementById('tiefe-grip'),
    ].filter((el): el is HTMLElement => el !== null);

    for (const knopf of ausloeser) {
      knopf.addEventListener('click', () => void this.oeffneEinstellungsfenster());
    }

    this.griffZiehbarMachen();
    this.setupPillen();
    this.setupKarte();
  }

  /**
   * Die Ausgänge der Kundenkarte verdrahten.
   *
   * Zwei Ebenen, zwei Schließen-Knöpfe: Das Blatt eines Kunden liegt über der
   * Karte, die Karte über der Liste. Wer das Blatt schließt, will die Karte
   * behalten — deshalb schließt der obere nicht gleich beides.
   */
  private setupKarte(): void {
    document
      .getElementById('close-customer-map')
      ?.addEventListener('click', () => this.kundenkarte.schliesse());
  }

  /**
   * Die zwei schwebenden Pillen verdrahten.
   *
   * Sie decken die beiden Fälle ab, in denen die Liste nicht weiterhilft:
   *
   *   „Erkennen"      — hinhalten, die App hört hin und sagt, welche Maschine
   *                     das ist. Das kann sie längst (AutoDetectionPhase); der
   *                     Weg dorthin lag bisher in der eingeklappten Prüf-Karte.
   *   „Neue Maschine" — die gibt es noch gar nicht.
   *
   * Beide lösen den vorhandenen Knopf aus, statt dessen Logik nachzubauen —
   * derselbe Weg wie beim Schiebefenster. Der Erkennen-Knopf liegt seit dem
   * 14.08.2026 in einer Karte, die ohne geladene Maschine verborgen ist; ein
   * Klick per Skript erreicht ihn trotzdem, denn `display:none` nimmt einem
   * Element nicht seine Ereignisse.
   */
  private setupPillen(): void {
    const paare: Array<[string, string]> = [
      ['fab-detect', 'diagnose-auto-detect-btn'],
      ['fab-new-machine', 'add-new-machine-btn'],
    ];

    for (const [pille, ziel] of paare) {
      const knopf = document.getElementById(pille);
      const zielKnopf = document.getElementById(ziel);
      // Kein Ziel, keine Pille: Ein Knopf gehört dorthin, wo er hinführt.
      if (!knopf) continue;
      if (!zielKnopf) {
        knopf.remove();
        logger.warn(`Pille ${pille} entfernt — Ziel ${ziel} fehlt`);
        continue;
      }
      knopf.addEventListener('click', () => zielKnopf.click());
    }
  }

  /**
   * Den Griff am unteren Rand zum Hochziehen machen.
   *
   * Vorbild ist TourFuchs (`initSheetGrip` in src/ui/sidebar.js): Ein Zeiger
   * geht runter, ab vier Pixeln Bewegung gilt es als Ziehen, und das Blatt
   * folgt dem Finger, statt zu springen. Beim Loslassen entscheidet der Weg,
   * ob es offen bleibt oder zurückfällt.
   *
   * Ein Unterschied zum Vorbild, mit Absicht: Dort tut ein reiner Tipp am
   * Handy nichts, weil das Blatt ohnehin auf Guckhöhe steht und der Griff nur
   * seine Größe ändert. Hier ist der Griff der Weg ins Fenster — ein Tipp
   * muss es öffnen, sonst wäre der Streifen ein Knopf, der nichts tut. Beides
   * geht: ziehen für die, die es kennen, tippen für alle anderen.
   */
  private griffZiehbarMachen(): void {
    const griff = document.getElementById('tiefe-grip');
    if (!griff) return;

    /** Ab hier ist es ein Ziehen und kein Tipp mehr. */
    const SCHWELLE = 4;
    /** So weit muss gezogen sein, damit das Blatt offen bleibt. */
    const HALTEWEG = 80;

    let startY = 0;
    let zieht = false;
    let bewegt = false;
    let weg = 0;

    griff.addEventListener('pointerdown', (ev) => {
      startY = ev.clientY;
      zieht = true;
      bewegt = false;
      weg = 0;
      griff.setPointerCapture?.(ev.pointerId);
    });

    griff.addEventListener('pointermove', (ev) => {
      if (!zieht) return;
      // Nach oben ziehen ist ein negatives dy — der Weg zählt positiv.
      weg = startY - ev.clientY;
      if (!bewegt) {
        if (Math.abs(weg) < SCHWELLE) return;
        bewegt = true;
        // Erst jetzt öffnen, und zwar unsichtbar am unteren Rand: Von dort
        // folgt das Blatt dem Finger, statt aufzuspringen.
        if (!InfoBottomSheet.istOffen) {
          void this.oeffneEinstellungsfenster();
          InfoBottomSheet.setzeZugAnteil(0);
        }
      }
      const hoehe = document.querySelector('.bottomsheet')?.getBoundingClientRect().height || 1;
      InfoBottomSheet.setzeZugAnteil(weg / hoehe);
    });

    const loslassen = () => {
      if (!zieht) return;
      zieht = false;
      if (!bewegt) return; // reiner Tipp — den erledigt der click-Listener
      InfoBottomSheet.beendeZug();
      if (weg < HALTEWEG) InfoBottomSheet.close();
    };

    griff.addEventListener('pointerup', loslassen);
    griff.addEventListener('pointercancel', loslassen);

    // Der Tipp wird hier behandelt und nicht über die allgemeine Schleife
    // oben: Nach einem Ziehen feuert der Browser trotzdem noch `click`, und
    // der würde das Fenster ein zweites Mal aufbauen — sichtbar als Zucken,
    // weil `show()` das offene Blatt vorher wegräumt. `bewegt` unterscheidet
    // die beiden Fälle.
    griff.addEventListener('click', () => {
      if (bewegt) {
        bewegt = false;
        return;
      }
      void this.oeffneEinstellungsfenster();
    });
  }

  private setupFooterLinks(): void {
    // Helper function to close a modal
    const closeModal = (modal: HTMLElement) => {
      modal.style.display = 'none';
    };

    // Helper function to open a modal
    const openModal = (modal: HTMLElement) => {
      modal.style.display = 'flex';
    };

    // Impressum modal
    const impressumBtn = document.getElementById('impressum-btn');
    const impressumModal = document.getElementById('impressum-modal');
    const closeImpressumModal = document.getElementById('close-impressum-modal');
    const closeImpressumBtn = document.getElementById('close-impressum-btn');

    if (impressumBtn && impressumModal) {
      impressumBtn.addEventListener('click', () => openModal(impressumModal));
    }

    if (closeImpressumModal && impressumModal) {
      closeImpressumModal.addEventListener('click', () => closeModal(impressumModal));
    }

    if (closeImpressumBtn && impressumModal) {
      closeImpressumBtn.addEventListener('click', () => closeModal(impressumModal));
    }

    // Datenschutz modal
    const datenschutzBtn = document.getElementById('datenschutz-btn');
    const datenschutzModal = document.getElementById('datenschutz-modal');
    const closeDatenschutzModal = document.getElementById('close-datenschutz-modal');
    const closeDatenschutzBtn = document.getElementById('close-datenschutz-btn');

    if (datenschutzBtn && datenschutzModal) {
      datenschutzBtn.addEventListener('click', () => openModal(datenschutzModal));
    }

    if (closeDatenschutzModal && datenschutzModal) {
      closeDatenschutzModal.addEventListener('click', () => closeModal(datenschutzModal));
    }

    if (closeDatenschutzBtn && datenschutzModal) {
      closeDatenschutzBtn.addEventListener('click', () => closeModal(datenschutzModal));
    }

    // Über Zanobot modal
    const aboutBtn = document.getElementById('about-btn');
    const aboutModal = document.getElementById('about-modal');
    const closeAboutModal = document.getElementById('close-about-modal');
    const closeAboutBtn = document.getElementById('close-about-btn');

    if (aboutBtn && aboutModal) {
      aboutBtn.addEventListener('click', () => openModal(aboutModal));
    }

    if (closeAboutModal && aboutModal) {
      closeAboutModal.addEventListener('click', () => closeModal(aboutModal));
    }

    if (closeAboutBtn && aboutModal) {
      closeAboutBtn.addEventListener('click', () => closeModal(aboutModal));
    }

    // Settings modal
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsModal = document.getElementById('close-settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');

    if (settingsBtn && settingsModal) {
      settingsBtn.addEventListener('click', () => openModal(settingsModal));
    }

    if (closeSettingsModal && settingsModal) {
      closeSettingsModal.addEventListener('click', () => closeModal(settingsModal));
    }

    if (closeSettingsBtn && settingsModal) {
      closeSettingsBtn.addEventListener('click', () => closeModal(settingsModal));
    }

    // Close modals on background click
    [impressumModal, datenschutzModal, aboutModal, settingsModal].forEach((modal) => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            closeModal(modal);
          }
        });
      }
    });

    // Close modals with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        [impressumModal, datenschutzModal, aboutModal, settingsModal].forEach((modal) => {
          if (modal && window.getComputedStyle(modal).display !== 'none') {
            closeModal(modal);
          }
        });
      }
    });
  }

  /**
   * Note: Service Worker registration is handled automatically by VitePWA plugin
   *
   * The VitePWA plugin (vite.config.ts) automatically:
   * - Generates service-worker.js with Workbox
   * - Creates registerSW.js registration script
   * - Injects the script tag into index.html
   * - Handles correct base path (/Zanobot/) and scope
   *
   * No manual registration needed here to avoid conflicts.
   */
}

// Start the app
new ZanobotApp();
