import { getAppSetting, saveAppSetting, deleteAppSetting } from '@data/db.js';
import { getLanguage, t } from '../i18n/index.js';
import { notify } from '@utils/notifications.js';
import { logger } from '@utils/logger.js';

const VALID_BANNER_WIDTHS = new Set([1024]);
const VALID_BANNER_HEIGHTS = new Set([400, 500]);
const DEFAULT_BANNER_PATH = './icons/zanobo_banner_1024x500.png';
const CHINESE_MOBILE_BANNER_PATH = './icons/zanobo_cn_1024x400.png';

/**
 * Theme-to-banner mapping for automatic banner selection
 * Each theme gets a visually appropriate default banner
 */
const THEME_BANNER_PATHS: Record<string, string> = {
  // Dark Theme (neon): technical, professional, high contrast - dark banner with neon blue head
  neon: './icons/dark_1024x500.png',
  // Zanobo Theme (brand): brand identity, emotional, creative - colorful banner
  brand: './icons/colorful_1024x500.png',
  // Light Theme: factual, calm, neutral - light blue/whitish banner
  light: './icons/lightblue_1024x500.png',
  // Focus Theme (Steve Jobs): maximum clarity, focus on action - same light banner as Light Theme
  focus: './icons/lightblue_1024x500.png',
};

/**
 * Get the storage key for a theme-specific custom banner
 */
function getThemeBannerKey(theme: string): string {
  return `hero_banner_${theme}`;
}

// Global instance for access from Settings
let bannerManagerInstance: BannerManager | null = null;

/**
 * Get the global BannerManager instance
 */
export function getBannerManager(): BannerManager | null {
  return bannerManagerInstance;
}

export class BannerManager {
  private heroHeader: HTMLElement | null;
  private heroImage: HTMLImageElement | null;
  private currentObjectUrl: string | null = null;
  private hasCustomBanner: boolean = false;
  private currentTheme: string = 'brand';

  static registerInstance(instance: BannerManager): void {
    bannerManagerInstance = instance;
  }

  constructor() {
    this.heroHeader = document.querySelector('.hero-header');
    this.heroImage = document.querySelector('.hero-header img');

    if (!this.heroImage) {
      logger.warn('⚠️ Hero banner image not found, skipping BannerManager setup');
      return;
    }

    // Store global instance for Settings access
    BannerManager.registerInstance(this);

    void this.restoreBannerFromStorage();
  }

  /**
   * Get current theme from DOM
   */
  private getCurrentTheme(): string {
    return document.documentElement.getAttribute('data-theme') || 'brand';
  }

  /**
   * Public method to handle file upload from Settings
   * Returns true if upload was successful
   */
  public async uploadBanner(file: File): Promise<boolean> {
    if (file.type !== 'image/png') {
      notify.error(t('settingsUI.bannerFormatError'));
      return false;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    return new Promise((resolve) => {
      img.onload = async () => {
        const isValidSize =
          VALID_BANNER_WIDTHS.has(img.width) && VALID_BANNER_HEIGHTS.has(img.height);

        if (!isValidSize) {
          URL.revokeObjectURL(objectUrl);
          notify.error(t('settingsUI.bannerFormatError'));
          resolve(false);
          return;
        }

        try {
          const theme = this.getCurrentTheme();
          const key = getThemeBannerKey(theme);
          await saveAppSetting(key, file);
          this.setHeroImage(objectUrl);
          this.hasCustomBanner = true;
          notify.success(t('settingsUI.bannerUpdated'));
          resolve(true);
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          logger.error('❌ Failed to save hero banner', error);
          notify.error(t('settingsUI.bannerSaveError'), error as Error);
          resolve(false);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        notify.error(t('settingsUI.bannerFormatError'));
        resolve(false);
      };

      img.src = objectUrl;
    });
  }

  /**
   * Public method to reset banner to theme default
   * Called from Settings
   */
  public async resetBanner(): Promise<void> {
    try {
      const theme = this.getCurrentTheme();
      const key = getThemeBannerKey(theme);

      // Delete custom banner for current theme
      await deleteAppSetting(key);

      // Apply default banner
      this.hasCustomBanner = false;
      this.applyDefaultBanner();

      notify.success(t('settingsUI.bannerResetSuccess'));
      logger.info(`✅ Reset banner for theme: ${theme}`);
    } catch (error) {
      logger.error('❌ Failed to reset banner', error);
      notify.error(t('settingsUI.bannerResetError'), error as Error);
    }
  }

  /**
   * Check if current theme has a custom banner
   */
  public async hasCustomBannerForCurrentTheme(): Promise<boolean> {
    try {
      const theme = this.getCurrentTheme();
      const key = getThemeBannerKey(theme);
      const stored = await getAppSetting<Blob>(key);
      return !!stored?.value;
    } catch {
      return false;
    }
  }

  /**
   * Get the current banner image source (for preview in Settings)
   */
  public getCurrentBannerSrc(): string | null {
    return this.heroImage?.src || null;
  }

  private setHeroImage(objectUrl: string): void {
    if (!this.heroImage) {
      return;
    }

    if (this.currentObjectUrl && this.currentObjectUrl !== objectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
    }

    this.heroImage.onload = () => {
      this.updateHeroHeight();
    };
    this.heroImage.src = objectUrl;
    this.currentObjectUrl = objectUrl;

    if (this.heroImage.complete) {
      this.updateHeroHeight();
    }
  }

  private async restoreBannerFromStorage(): Promise<void> {
    if (!this.heroImage) {
      return;
    }

    try {
      const theme = this.getCurrentTheme();
      const key = getThemeBannerKey(theme);
      const stored = await getAppSetting<Blob>(key);

      if (!stored?.value) {
        this.hasCustomBanner = false;
        this.applyDefaultBanner();
        return;
      }

      const objectUrl = URL.createObjectURL(stored.value);
      this.setHeroImage(objectUrl);
      this.hasCustomBanner = true;
    } catch (error) {
      logger.warn('⚠️ Failed to restore hero banner from storage', error);
      this.hasCustomBanner = false;
      this.applyDefaultBanner();
    }
  }

  private applyDefaultBanner(): void {
    if (!this.heroImage) {
      return;
    }

    const language = getLanguage();
    const isMobile = this.isMobileDevice();

    // Chinese mobile users get a localized banner
    if (language === 'zh' && isMobile) {
      this.setHeroImage(CHINESE_MOBILE_BANNER_PATH);
      return;
    }

    // Apply theme-specific default banner
    const currentTheme = this.getCurrentTheme();
    const themeBannerPath = THEME_BANNER_PATHS[currentTheme] || DEFAULT_BANNER_PATH;

    this.setHeroImage(themeBannerPath);
  }

  private updateHeroHeight(): void {
    if (!this.heroImage || !this.heroHeader) {
      return;
    }

    const height = this.heroImage.naturalHeight || this.heroImage.height;

    if (height) {
      this.heroHeader.style.setProperty('--hero-banner-height', `${height}px`);
    } else {
      this.heroHeader.style.removeProperty('--hero-banner-height');
    }
  }

  private isMobileDevice(): boolean {
    const userAgentData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;

    if (userAgentData?.mobile) {
      return true;
    }

    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  /**
   * Apply theme-appropriate banner when theme changes.
   * Only updates the banner if no custom banner has been uploaded by the user for this theme.
   */
  public async applyThemeBanner(): Promise<void> {
    const theme = this.getCurrentTheme();

    // Check if this theme has a custom banner
    const key = getThemeBannerKey(theme);
    try {
      const stored = await getAppSetting<Blob>(key);
      if (stored?.value) {
        const objectUrl = URL.createObjectURL(stored.value);
        this.setHeroImage(objectUrl);
        this.hasCustomBanner = true;
        return;
      }
    } catch (error) {
      logger.warn('⚠️ Failed to check for custom banner', error);
    }

    // No custom banner for this theme, apply default
    this.hasCustomBanner = false;
    this.applyDefaultBanner();
  }
}
