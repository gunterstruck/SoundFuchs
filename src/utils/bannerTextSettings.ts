/**
 * Custom banner overlay text (headline + subline), stored PER THEME.
 *
 * The hero banner shows a headline and a subline. By default these come from
 * i18n (banner.headline / banner.subline); this store lets the user override
 * them with their own wording. Like the banner IMAGE, the text is per-theme, so
 * each theme can carry its own headline/subline. Empty string = use the i18n
 * default for that field. Stored in localStorage.
 */

export interface BannerText {
  headline: string;
  subline: string;
}

function storageKey(field: 'headline' | 'subline', theme: string): string {
  return `zanobot.banner.${field}.${theme}`;
}

export function getBannerText(theme: string): BannerText {
  try {
    return {
      headline: localStorage.getItem(storageKey('headline', theme)) ?? '',
      subline: localStorage.getItem(storageKey('subline', theme)) ?? '',
    };
  } catch {
    return { headline: '', subline: '' };
  }
}

export function setBannerText(theme: string, text: Partial<BannerText>): void {
  try {
    if (text.headline !== undefined) {
      const v = text.headline.trim();
      if (v) localStorage.setItem(storageKey('headline', theme), v);
      else localStorage.removeItem(storageKey('headline', theme));
    }
    if (text.subline !== undefined) {
      const v = text.subline.trim();
      if (v) localStorage.setItem(storageKey('subline', theme), v);
      else localStorage.removeItem(storageKey('subline', theme));
    }
  } catch {
    /* localStorage unavailable (private mode) — non-fatal */
  }
}

/** True if the user has set any custom overlay text for this theme. */
export function hasCustomBannerText(theme: string): boolean {
  const { headline, subline } = getBannerText(theme);
  return Boolean(headline || subline);
}

/**
 * Whether the overlay text should be hidden entirely for this theme (per-theme
 * toggle). Lets the user show a banner image with no text at all.
 */
const HIDDEN_KEY = (theme: string) => `zanobot.banner.hidden.${theme}`;

export function isBannerTextHidden(theme: string): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY(theme)) === '1';
  } catch {
    return false;
  }
}

export function setBannerTextHidden(theme: string, hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HIDDEN_KEY(theme), '1');
    else localStorage.removeItem(HIDDEN_KEY(theme));
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

/**
 * Banner text position as percentages of the banner box (per theme). x is the
 * horizontal start of the text block, y its vertical centre. Defaults place the
 * text in the right two-thirds, vertically centred (the historical layout).
 */
export interface BannerTextPosition {
  x: number;
  y: number;
}

const DEFAULT_POSITION: BannerTextPosition = { x: 36, y: 50 };
const POS_X_KEY = (theme: string) => `zanobot.banner.posx.${theme}`;
const POS_Y_KEY = (theme: string) => `zanobot.banner.posy.${theme}`;

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = parseFloat(raw);
    return isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

export function getBannerTextPosition(theme: string): BannerTextPosition {
  return {
    x: readNumber(POS_X_KEY(theme), DEFAULT_POSITION.x),
    y: readNumber(POS_Y_KEY(theme), DEFAULT_POSITION.y),
  };
}

/**
 * True if the user has moved the overlay text away from its default position
 * for this theme (i.e. a custom x or y is stored). Used so "Reset" knows there
 * is a position to revert even when the text/image were never changed.
 */
export function hasCustomBannerTextPosition(theme: string): boolean {
  try {
    return (
      localStorage.getItem(POS_X_KEY(theme)) !== null ||
      localStorage.getItem(POS_Y_KEY(theme)) !== null
    );
  } catch {
    return false;
  }
}

export function setBannerTextPosition(theme: string, pos: Partial<BannerTextPosition>): void {
  try {
    if (pos.x !== undefined) localStorage.setItem(POS_X_KEY(theme), String(Math.round(pos.x)));
    if (pos.y !== undefined) localStorage.setItem(POS_Y_KEY(theme), String(Math.round(pos.y)));
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

/** Drop the stored position for this theme so it falls back to the default. */
export function resetBannerTextPosition(theme: string): void {
  try {
    localStorage.removeItem(POS_X_KEY(theme));
    localStorage.removeItem(POS_Y_KEY(theme));
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}
