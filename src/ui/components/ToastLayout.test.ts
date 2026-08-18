import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lies = (datei: string): string => readFileSync(resolve(process.cwd(), datei), 'utf8');

const toastCss = lies('src/styles/toast.css');
const appCss = lies('src/styles/style.css');
const stammLayout = lies('src/styles/stamm/layout.css');

describe('Hinweise vor der festen Kopfzone', () => {
  it('legt Hinweise über die Topbar', () => {
    const toastEbene = Number(/--z-toast:\s*(\d+)/.exec(appCss)?.[1]);
    const topbarEbene = Number(/\.topbar\s*\{[\s\S]*?z-index:\s*(\d+)/.exec(stammLayout)?.[1]);

    expect(toastEbene).toBeGreaterThan(topbarEbene);
    expect(toastCss).toContain('z-index: var(--z-toast, 4000)');
  });

  it('beginnt am Schreibtisch unter der Topbar', () => {
    expect(toastCss).toContain('top: calc(var(--topbar-height, 52px) + 12px)');
  });

  it('beginnt im Phone-Gesicht unter Topbar und Kopfstreifen', () => {
    expect(toastCss).toContain('top: calc(var(--topbar-height, 52px) + 55px + 10px)');
    expect(toastCss).toContain('(max-width: 1200px) and (orientation: portrait)');
  });

  it('bleibt auf schmalen Bildschirmen zwischen beiden Seitenrändern', () => {
    expect(toastCss).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.toast-container\s*\{[\s\S]*?left:\s*10px;[\s\S]*?right:\s*10px;[\s\S]*?width:\s*auto;/
    );
  });
});
