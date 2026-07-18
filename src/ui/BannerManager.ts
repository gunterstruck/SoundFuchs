import { getAppSetting, saveAppSetting, deleteAppSetting } from '@data/db.js';
import { getLanguage, t } from '../i18n/index.js';
import { notify } from '@utils/notifications.js';
import { logger } from '@utils/logger.js';
import {
  getBannerText,
  getBannerTextPosition,
  setBannerText,
  resetBannerTextPosition,
  isBannerTextHidden,
  setBannerTextHidden,
} from '@utils/bannerTextSettings.js';

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
  // Two stacked <img> layers that crossfade, so banners never hard-cut.
  private layers: HTMLImageElement[] = [];
  private activeLayer = 0;
  private currentObjectUrl: string | null = null;
  private hasCustomBanner: boolean = false;

  static registerInstance(instance: BannerManager): void {
    bannerManagerInstance = instance;
  }

  constructor() {
    this.heroHeader = document.querySelector('.hero-header');
    const firstImage = this.heroHeader?.querySelector('img.hero-image') as HTMLImageElement | null;

    if (!this.heroHeader || !firstImage) {
      logger.warn('⚠️ Hero banner image not found, skipping BannerManager setup');
      return;
    }

    // Build the second crossfade layer from the existing one (same styling).
    const secondImage = firstImage.cloneNode(false) as HTMLImageElement;
    secondImage.removeAttribute('src');
    secondImage.alt = '';
    secondImage.classList.remove('is-loaded');
    this.heroHeader.appendChild(secondImage);
    this.layers = [firstImage, secondImage];

    // Store global instance for Settings access
    BannerManager.registerInstance(this);

    // Show the CORRECT themed default immediately (no IndexedDB round-trip, no
    // wrong placeholder), then asynchronously upgrade to a custom banner — which
    // crossfades in over the themed default instead of jumping.
    this.applyDefaultBanner();
    this.applyBannerText();
    void this.restoreBannerFromStorage();
  }

  /**
   * Apply the user's custom overlay text (headline / subline) to the hero
   * banner, falling back to the i18n default per field. When a field is
   * customized its data-i18n is removed so a later language switch can't
   * overwrite it; clearing it restores the translated default. Also flags the
   * header so the overlay can stay visible over a custom banner image.
   */
  public applyBannerText(): void {
    const theme = this.getCurrentTheme();
    const { headline, subline } = getBannerText(theme);
    const apply = (selector: string, custom: string, i18nKey: string) => {
      const el = this.heroHeader?.querySelector(selector) as HTMLElement | null;
      if (!el) return;
      if (custom) {
        el.removeAttribute('data-i18n');
        el.textContent = custom;
      } else {
        el.setAttribute('data-i18n', i18nKey);
        el.textContent = t(i18nKey);
      }
    };
    apply('.hero-headline', headline, 'banner.headline');
    apply('.hero-subline', subline, 'banner.subline');

    // Per-theme toggle to hide the overlay text entirely (image only).
    this.heroHeader?.classList.toggle('banner-text-hidden', isBannerTextHidden(theme));

    // Position (per theme) → CSS variables consumed by .hero-text-block.
    const pos = getBannerTextPosition(theme);
    this.heroHeader?.style.setProperty('--banner-text-x', `${pos.x}%`);
    this.heroHeader?.style.setProperty('--banner-text-y', `${pos.y}%`);
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
          this.showBanner(objectUrl, true);
          this.hasCustomBanner = true;
          this.updateOverlayVisibility();
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
   * Save an already-cropped banner image (from the crop modal). Unlike
   * uploadBanner there is no size check — the blob is produced at the exact
   * banner dimensions by the cropper.
   */
  public async saveBannerBlob(blob: Blob): Promise<boolean> {
    try {
      const theme = this.getCurrentTheme();
      const key = getThemeBannerKey(theme);
      await saveAppSetting(key, blob);
      const objectUrl = URL.createObjectURL(blob);
      this.showBanner(objectUrl, true);
      this.hasCustomBanner = true;
      this.updateOverlayVisibility();
      notify.success(t('settingsUI.bannerUpdated'));
      return true;
    } catch (error) {
      logger.error('❌ Failed to save cropped hero banner', error);
      notify.error(t('settingsUI.bannerSaveError'), error as Error);
      return false;
    }
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

      // Also clear the custom overlay text + position + hidden flag for this
      // theme, so a reset restores the original wording and placement (not just
      // the image).
      setBannerText(theme, { headline: '', subline: '' });
      resetBannerTextPosition(theme);
      setBannerTextHidden(theme, false);

      // Apply default banner
      this.hasCustomBanner = false;
      this.applyDefaultBanner();
      this.applyBannerText();
      this.updateOverlayVisibility();

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
    return this.layers[this.activeLayer]?.src || null;
  }

  /**
   * A URL to show in the settings preview for the CURRENT theme: the stored
   * custom banner as an object URL if one exists, otherwise the themed default
   * path. Reads the actual saved value (not the live crossfade layer, whose
   * activeLayer flips only after the new image has loaded), so the preview is
   * correct immediately after an upload. Caller revokes returned blob: URLs.
   */
  public async getCurrentBannerPreviewUrl(): Promise<string> {
    const theme = this.getCurrentTheme();
    try {
      const stored = await getAppSetting<Blob>(getThemeBannerKey(theme));
      if (stored?.value) return URL.createObjectURL(stored.value);
    } catch (error) {
      logger.warn('Could not read stored banner for preview', error);
    }
    return this.resolveDefaultBannerPath();
  }

  /**
   * Crossfade the banner to a new image. Loads it on the idle layer, then fades
   * that layer in and the previous one out — so default→custom (or theme
   * changes) glide instead of cutting. `isObjectUrl` marks blob URLs so the
   * previous one can be revoked once it is no longer visible.
   */
  private showBanner(url: string, isObjectUrl: boolean): void {
    if (this.layers.length < 2) {
      return;
    }
    const idle = this.layers[this.activeLayer ^ 1];
    const active = this.layers[this.activeLayer];
    const previousObjectUrl = this.currentObjectUrl;

    const reveal = () => {
      idle.classList.add('is-loaded');
      active.classList.remove('is-loaded');
      this.activeLayer ^= 1;
      // The previous blob URL is no longer the visible one — release it.
      if (previousObjectUrl && previousObjectUrl !== url) {
        URL.revokeObjectURL(previousObjectUrl);
      }
      this.currentObjectUrl = isObjectUrl ? url : null;
    };

    idle.onload = reveal;
    idle.onerror = () => {
      logger.warn('⚠️ Hero banner failed to load:', url);
      idle.onload = null;
    };
    idle.src = url;
    // Cached images may already be complete (onload won't fire) — reveal now.
    if (idle.complete && idle.naturalWidth > 0) {
      reveal();
    }
  }

  private async restoreBannerFromStorage(): Promise<void> {
    if (this.layers.length < 2) {
      return;
    }

    try {
      const theme = this.getCurrentTheme();
      const key = getThemeBannerKey(theme);
      const stored = await getAppSetting<Blob>(key);

      if (!stored?.value) {
        // No custom banner — the themed default is already shown from the
        // constructor, so just settle the overlay state (no reload/flash).
        this.hasCustomBanner = false;
        this.updateOverlayVisibility();
        return;
      }

      const objectUrl = URL.createObjectURL(stored.value);
      this.showBanner(objectUrl, true);
      this.hasCustomBanner = true;
      this.updateOverlayVisibility();
    } catch (error) {
      logger.warn('⚠️ Failed to restore hero banner from storage', error);
      this.hasCustomBanner = false;
      this.updateOverlayVisibility();
    }
  }

  private resolveDefaultBannerPath(): string {
    // Chinese mobile users get a localized banner.
    if (getLanguage() === 'zh' && this.isMobileDevice()) {
      return CHINESE_MOBILE_BANNER_PATH;
    }
    const currentTheme = this.getCurrentTheme();
    return THEME_BANNER_PATHS[currentTheme] || DEFAULT_BANNER_PATH;
  }

  private applyDefaultBanner(): void {
    if (this.layers.length < 2) {
      return;
    }
    this.showBanner(this.resolveDefaultBannerPath(), false);
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

    // Banner text is per-theme too — refresh the overlay for the new theme.
    this.applyBannerText();

    // Check if this theme has a custom banner
    const key = getThemeBannerKey(theme);
    try {
      const stored = await getAppSetting<Blob>(key);
      if (stored?.value) {
        const objectUrl = URL.createObjectURL(stored.value);
        this.showBanner(objectUrl, true);
        this.hasCustomBanner = true;
        this.updateOverlayVisibility();
        return;
      }
    } catch (error) {
      logger.warn('⚠️ Failed to check for custom banner', error);
    }

    // No custom banner for this theme, apply default
    this.hasCustomBanner = false;
    this.applyDefaultBanner();
    this.updateOverlayVisibility();
  }

  private updateOverlayVisibility(): void {
    this.heroHeader?.classList.toggle('has-custom-banner', this.hasCustomBanner);
  }
}
