/**
 * ZANOBOT — PRÜFERGEBNIS ALS BILD TEILEN
 *
 * Werker kommunizieren mit dem Meister über Messenger, nicht über
 * CSV-Exporte: Diese Helfer rendern eine kompakte Ergebnis-Karte
 * (Maschine, Datum, Score, Status-Ampel) als PNG und teilen sie über die
 * Web Share API (Datei-Share aufs Teilen-Sheet des Systems); wo die API
 * fehlt (Desktop), wird das Bild stattdessen heruntergeladen.
 *
 * Rein additiv, keine Abhängigkeiten — ein Canvas, ein Blob.
 */

import type { DiagnosisResult } from '@data/types.js';
import { logger } from '@utils/logger.js';

const CARD_W = 1080;
const CARD_H = 1080;

const STATUS_COLORS: Record<DiagnosisResult['status'], string> = {
  healthy: '#1db954',
  uncertain: '#ff9800',
  faulty: '#f44336',
};

export interface ResultCardData {
  machineName: string;
  healthScore: number;
  status: DiagnosisResult['status'];
  /** Lokalisiertes Status-Wort (z. B. „Normal" / „Abweichung"). */
  statusLabel: string;
  timestamp: number;
  /** Lokalisierte Fußzeile (z. B. „Zanobot Klang-Prüfung"). */
  footerLabel: string;
}

/** Ergebnis-Karte als PNG-Blob rendern (1080×1080, Messenger-tauglich). */
export async function buildResultCardBlob(data: ResultCardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D nicht verfügbar');

  const color = STATUS_COLORS[data.status];

  // Hintergrund + Karte
  ctx.fillStyle = '#f4f7fa';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 60, 60, CARD_W - 120, CARD_H - 120, 48);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  roundRect(ctx, 60, 60, CARD_W - 120, CARD_H - 120, 48);
  ctx.stroke();

  ctx.textAlign = 'center';

  // Maschine + Datum
  ctx.fillStyle = '#12263a';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText(fitText(ctx, data.machineName, CARD_W - 220), CARD_W / 2, 210);
  ctx.fillStyle = '#7a8a98';
  ctx.font = '40px system-ui, sans-serif';
  ctx.fillText(new Date(data.timestamp).toLocaleString(), CARD_W / 2, 280);

  // Score-Ring + Zahl
  const cx = CARD_W / 2;
  const cy = 580;
  const r = 210;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = '#e3edf3';
  ctx.lineWidth = 34;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * Math.min(100, data.healthScore)) / 100);
  ctx.strokeStyle = color;
  ctx.lineWidth = 34;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = 'bold 140px system-ui, sans-serif';
  ctx.fillText(`${Math.round(data.healthScore)}%`, cx, cy + 48);

  // Status-Wort
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.fillText(data.statusLabel.toUpperCase(), cx, cy + r + 130);

  // Fußzeile
  ctx.fillStyle = '#7a8a98';
  ctx.font = '36px system-ui, sans-serif';
  ctx.fillText(data.footerLabel, cx, CARD_H - 110);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob fehlgeschlagen'))),
      'image/png'
    );
  });
}

/**
 * Bild teilen: Web Share API mit Datei (mobiles Teilen-Sheet), sonst
 * Download-Fallback. Wirft nicht — Abbruch durch den Nutzer ist ok.
 */
export async function shareResultImage(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return;
    } catch (error) {
      // AbortError = Nutzer hat das Teilen-Sheet geschlossen — kein Fehler
      if ((error as Error).name === 'AbortError') return;
      logger.warn('Web Share fehlgeschlagen, Fallback auf Download:', error);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Text auf Kartenbreite kürzen (mit Ellipse), damit lange Namen passen. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}
