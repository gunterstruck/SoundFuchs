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

import { initDB, getDBStats } from '@data/db.js';
import { toast } from '@ui/components/Toast.js';
import { AboutModalController } from '@ui/components/AboutModalController.js';
import { nfcImportService } from '@data/NfcImportService.js';
import { Router } from '@ui/router.js';
import { HashRouter } from '@ui/HashRouter.js';
import { ReferenceLoadingOverlay } from '@ui/components/ReferenceLoadingOverlay.js';
import { BannerManager } from '@ui/BannerManager.js';
import { notify } from '@utils/notifications.js';
import { logger } from '@utils/logger.js';
import { initErrorBoundary } from '@utils/errorBoundary.js';
import {
  applyViewLevel,
  setViewLevel,
  checkFirstLaunch,
  type ViewLevel,
} from '@utils/viewLevelSettings.js';
import { initI18n, t, translateDOM } from './i18n/index.js';

/**
 * Global type declarations for theme-bootstrap.js API
 */
declare global {
  interface Window {
    ZanobotTheme?: {
      setTheme: (theme: string) => void;
      getTheme: () => string;
      toggleTheme: () => string;
      getAvailableThemes: () => string[];
      getThemeDisplayName: (theme: string) => string;
      getThemeDescription: (theme: string) => string;
      applyCustomColors: (colors: Record<string, string>) => void;
      reset: () => void;
    };
    ZANOBOT_CONFIG?: Record<string, unknown>;
  }
}

class ZanobotApp {
  private router: Router | null = null;
  private bannerManager: BannerManager | null = null;

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
    const hasAudioContext = typeof AudioContext !== 'undefined' ||
      typeof (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext !== 'undefined';
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
      missing
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
      compatibility.missing.forEach(feature => logger.error(`   ${feature}`));

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

      // Check for database migration notification
      this.checkMigrationNotification();
    } catch (error) {
      logger.error('❌ Database initialization failed:', error);
      logger.warn('⚠️ Continuing without database - functionality will be limited');
      notify.error(
        t('settings.databaseNotAvailable'),
        error as Error,
        {
          title: t('modals.databaseError'),
          duration: 0,
        }
      );
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
      this.setupThemeSwitcher();
      this.setupQuickThemeToggle();
      this.setupViewLevelSelector();
      this.setupFooterLinks();

      // Initialize About Modal with dynamic i18n content
      new AboutModalController();

      // Translate static DOM elements based on detected language
      translateDOM();

      if (dbAvailable) {
        this.bannerManager = new BannerManager();
      }

      // Note: Service Worker is automatically registered by VitePWA plugin
      // See vite.config.ts and the auto-generated registerSW.js script

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
        notify.success(
          t('nfcImport.success'),
          { title: t('nfcImport.successTitle') }
        );

        // Reload the page to reflect imported data
        // Small delay to show success notification
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (error) {
      logger.error('❌ NFC import failed:', error);
      notify.error(
        t('nfcImport.error'),
        error as Error,
        { title: t('nfcImport.errorTitle') }
      );
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
        ? `${meta.machineCount} Maschinen, ${meta.recordingCount} Aufnahmen, ${meta.diagnosisCount} Diagnosen`
        : '';

      notify.success(
        details
          ? `${t('urlImport.success') || 'Datenbank erfolgreich importiert!'}\n\n${details}`
          : (t('urlImport.success') || 'Datenbank erfolgreich importiert!'),
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
        result.errorMessage || (t('urlImport.errorGeneric') || 'Import fehlgeschlagen.'),
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
    const updateExpandedClass = (
      container: Element | null,
      shouldExpand: boolean
    ): void => {
      if (!container || !isSecondaryCard(container)) return;
      if (shouldExpand) {
        container.classList.add('expanded');
      } else {
        container.classList.remove('expanded');
      }
    };

    const updateCompactExpandedState = () => {
      const contents = Array.from(
        document.querySelectorAll<HTMLElement>('.collapsible-content')
      );
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
   * Setup theme switcher
   */
  private setupThemeSwitcher(): void {
    const themeBtns = document.querySelectorAll('.theme-card');

    themeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.getAttribute('data-theme');
        if (!theme) return;

        // Apply theme
        document.documentElement.setAttribute('data-theme', theme);

        // Save to localStorage
        localStorage.setItem('zanobot-theme', theme);

        // Update active state
        themeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        // Apply theme-appropriate banner (if no custom banner)
        this.bannerManager?.applyThemeBanner();
      });
    });

    // Load saved theme
    const savedTheme = localStorage.getItem('zanobot-theme') || 'brand';
    document.documentElement.setAttribute('data-theme', savedTheme);

    themeBtns.forEach((btn) => {
      if (btn.getAttribute('data-theme') === savedTheme) {
        btn.classList.add('active');
      }
    });
  }

  /**
   * Setup quick theme toggle button (header)
   */
  private setupQuickThemeToggle(): void {
    const quickToggleBtns = Array.from(
      document.querySelectorAll<HTMLElement>('.quick-theme-toggle')
    );
    const legacyToggleBtn = document.getElementById('quick-theme-toggle');
    if (legacyToggleBtn && !quickToggleBtns.includes(legacyToggleBtn)) {
      quickToggleBtns.push(legacyToggleBtn);
    }

    quickToggleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        // Use the global ZanobotTheme API from theme-bootstrap.js
        if (window.ZanobotTheme?.toggleTheme) {
          window.ZanobotTheme.toggleTheme();
          logger.debug('🎨 Theme toggled via quick toggle button');

          // Apply theme-appropriate banner (if no custom banner)
          this.bannerManager?.applyThemeBanner();
        }
      });
    });
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
   * Setup footer links (Impressum, Datenschutz, Über Zanobot)
   */
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
