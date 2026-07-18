/**
 * ZANOBOT - BANNER CROP MODAL
 *
 * Lets the user pick ANY image and position it inside a fixed banner-shaped
 * frame (1024×500) by dragging and zooming. Exactly the framed area is rendered
 * to a 1024×500 PNG, so the upload no longer has to be pre-sized.
 *
 * Self-contained: builds its own DOM + uses .banner-crop-* classes (style.css).
 * Resolves to the cropped PNG Blob, or null if cancelled.
 */

import { t } from '../../i18n/index.js';
import { logger } from '@utils/logger.js';

export interface BannerCropOptions {
  outWidth?: number;
  outHeight?: number;
}

const DEFAULT_OUT_W = 1024;
const DEFAULT_OUT_H = 500;
const MAX_ZOOM_FACTOR = 4; // up to 4× the cover scale

export function openBannerCropModal(file: File, options: BannerCropOptions = {}): Promise<Blob | null> {
  const outW = options.outWidth ?? DEFAULT_OUT_W;
  const outH = options.outHeight ?? DEFAULT_OUT_H;

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };

    img.onload = () => {
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      if (!natW || !natH) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
        return;
      }

      // --- Build modal DOM ---
      const overlay = document.createElement('div');
      overlay.className = 'banner-crop-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      const modal = document.createElement('div');
      modal.className = 'banner-crop-modal';

      const title = document.createElement('h3');
      title.className = 'banner-crop-title';
      title.textContent = t('settingsUI.bannerCropTitle');

      const hint = document.createElement('p');
      hint.className = 'banner-crop-hint';
      hint.textContent = t('settingsUI.bannerCropHint');

      // Viewport = the crop frame (what you see is what you get).
      const viewport = document.createElement('div');
      viewport.className = 'banner-crop-viewport';
      viewport.style.aspectRatio = `${outW} / ${outH}`;

      const imgEl = document.createElement('img');
      imgEl.className = 'banner-crop-image';
      imgEl.src = objectUrl;
      imgEl.draggable = false;
      imgEl.style.width = `${natW}px`;
      imgEl.style.height = `${natH}px`;
      viewport.appendChild(imgEl);

      // Left-third text-zone guide (the area kept free for the overlay text).
      const textZone = document.createElement('div');
      textZone.className = 'banner-crop-textzone';
      const textZoneLabel = document.createElement('span');
      textZoneLabel.textContent = t('settingsUI.bannerCropTextZone');
      textZone.appendChild(textZoneLabel);
      viewport.appendChild(textZone);

      // Zoom control
      const zoomRow = document.createElement('div');
      zoomRow.className = 'banner-crop-zoom-row';
      const zoomLabel = document.createElement('span');
      zoomLabel.textContent = t('settingsUI.bannerCropZoom');
      const zoom = document.createElement('input');
      zoom.type = 'range';
      zoom.className = 'banner-crop-zoom';
      zoom.min = '1';
      zoom.max = String(MAX_ZOOM_FACTOR);
      zoom.step = '0.01';
      zoom.value = '1';
      zoomRow.appendChild(zoomLabel);
      zoomRow.appendChild(zoom);

      const actions = document.createElement('div');
      actions.className = 'banner-crop-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'action-btn tertiary-btn';
      cancelBtn.textContent = t('buttons.cancel');
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'action-btn primary-btn';
      confirmBtn.textContent = t('settingsUI.bannerCropConfirm');
      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);

      modal.appendChild(title);
      modal.appendChild(hint);
      modal.appendChild(viewport);
      modal.appendChild(zoomRow);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // --- Crop transform state ---
      // A source pixel (sx, sy) maps to viewport pixel (offsetX + sx*scale, offsetY + sy*scale).
      let vw = viewport.clientWidth;
      let vh = viewport.clientHeight;
      let coverScale = Math.max(vw / natW, vh / natH);
      let scale = coverScale;
      let offsetX = (vw - natW * scale) / 2;
      let offsetY = (vh - natH * scale) / 2;

      const clampOffsets = () => {
        // Image must always cover the viewport (no empty gaps).
        const minX = vw - natW * scale;
        const minY = vh - natH * scale;
        offsetX = Math.min(0, Math.max(minX, offsetX));
        offsetY = Math.min(0, Math.max(minY, offsetY));
      };

      const render = () => {
        imgEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
      };

      const recomputeViewport = () => {
        vw = viewport.clientWidth;
        vh = viewport.clientHeight;
        coverScale = Math.max(vw / natW, vh / natH);
        if (scale < coverScale) scale = coverScale;
        clampOffsets();
        render();
      };

      // Initial layout may need a frame for clientWidth/Height to settle.
      requestAnimationFrame(() => {
        recomputeViewport();
      });

      // Scale around a viewport-local anchor point (keeps that point fixed).
      const setScaleAround = (newScale: number, ax: number, ay: number) => {
        const clamped = Math.max(coverScale, Math.min(coverScale * MAX_ZOOM_FACTOR, newScale));
        const sx = (ax - offsetX) / scale;
        const sy = (ay - offsetY) / scale;
        scale = clamped;
        offsetX = ax - sx * scale;
        offsetY = ay - sy * scale;
        clampOffsets();
        render();
      };
      const syncZoomSlider = () => {
        zoom.value = String(Math.max(1, Math.min(MAX_ZOOM_FACTOR, scale / coverScale)));
      };

      // --- Zoom slider (anchored on the viewport centre) ---
      zoom.addEventListener('input', () => {
        const factor = parseFloat(zoom.value) || 1;
        setScaleAround(coverScale * factor, vw / 2, vh / 2);
      });

      // --- Pointer interaction: 1 finger = pan, 2 fingers = pinch-zoom + pan ---
      const pointers = new Map<number, { x: number; y: number }>();
      let panLastX = 0;
      let panLastY = 0;
      let pinchDist = 0;
      let pinchMx = 0;
      let pinchMy = 0;

      const localPoint = (e: PointerEvent) => {
        const rect = viewport.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      };
      const twoPointerState = () => {
        const pts = [...pointers.values()];
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        return {
          dist: Math.hypot(dx, dy),
          mx: (pts[0].x + pts[1].x) / 2,
          my: (pts[0].y + pts[1].y) / 2,
        };
      };

      const onDown = (e: PointerEvent) => {
        const p = localPoint(e);
        pointers.set(e.pointerId, p);
        viewport.setPointerCapture(e.pointerId);
        if (pointers.size === 1) {
          panLastX = p.x;
          panLastY = p.y;
        } else if (pointers.size === 2) {
          const s = twoPointerState();
          pinchDist = s.dist;
          pinchMx = s.mx;
          pinchMy = s.my;
        }
      };
      const onMove = (e: PointerEvent) => {
        if (!pointers.has(e.pointerId)) return;
        const p = localPoint(e);
        pointers.set(e.pointerId, p);
        if (pointers.size >= 2) {
          const s = twoPointerState();
          if (pinchDist > 0) {
            // Zoom by the finger-distance ratio, anchored at the (moving)
            // midpoint — combines pinch-zoom and two-finger pan in one step.
            const sx = (pinchMx - offsetX) / scale;
            const sy = (pinchMy - offsetY) / scale;
            scale = Math.max(
              coverScale,
              Math.min(coverScale * MAX_ZOOM_FACTOR, scale * (s.dist / pinchDist))
            );
            offsetX = s.mx - sx * scale;
            offsetY = s.my - sy * scale;
            clampOffsets();
            render();
            syncZoomSlider();
          }
          pinchDist = s.dist;
          pinchMx = s.mx;
          pinchMy = s.my;
        } else {
          offsetX += p.x - panLastX;
          offsetY += p.y - panLastY;
          panLastX = p.x;
          panLastY = p.y;
          clampOffsets();
          render();
        }
      };
      const onUp = (e: PointerEvent) => {
        pointers.delete(e.pointerId);
        try {
          viewport.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        const remaining = [...pointers.values()];
        if (remaining.length === 1) {
          panLastX = remaining[0].x;
          panLastY = remaining[0].y;
        } else if (remaining.length >= 2) {
          const s = twoPointerState();
          pinchDist = s.dist;
          pinchMx = s.mx;
          pinchMy = s.my;
        }
      };
      viewport.addEventListener('pointerdown', onDown);
      viewport.addEventListener('pointermove', onMove);
      viewport.addEventListener('pointerup', onUp);
      viewport.addEventListener('pointercancel', onUp);

      const resizeListener = () => recomputeViewport();
      window.addEventListener('resize', resizeListener);

      // --- Teardown ---
      const cleanup = (result: Blob | null) => {
        window.removeEventListener('resize', resizeListener);
        overlay.remove();
        URL.revokeObjectURL(objectUrl);
        resolve(result);
      };

      cancelBtn.addEventListener('click', () => cleanup(null));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(null);
      });

      confirmBtn.addEventListener('click', () => {
        try {
          // Source rectangle currently shown in the viewport.
          const srcX = -offsetX / scale;
          const srcY = -offsetY / scale;
          const srcW = vw / scale;
          const srcH = vh / scale;

          const canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup(null);
            return;
          }
          ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
          canvas.toBlob((blob) => cleanup(blob), 'image/png');
        } catch (error) {
          logger.error('Banner crop failed:', error);
          cleanup(null);
        }
      });
    };

    img.src = objectUrl;
  });
}
