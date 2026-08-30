import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const css = readFileSync(resolve(process.cwd(), 'src/styles/style.css'), 'utf8');
const suche = readFileSync(resolve(process.cwd(), 'src/ui/GlobalSearch.ts'), 'utf8');

describe('Standortanlage in der Suche', () => {
  it('entfernt die dritte Karten-Pille und lässt die zwei Geräuschwege stehen', () => {
    expect(html).not.toContain('id="btn-new-site"');
    expect(html).toContain('id="btn-sound-detect"');
    expect(html).toContain('id="btn-schnellcheck"');
  });

  it('verknüpft das Suchfeld zugänglich mit seiner Klappliste', () => {
    expect(html).toContain('aria-controls="search-results"');
    expect(html).toContain('aria-expanded="false"');
    expect(suche).toContain("this.feld.setAttribute('aria-expanded', 'true')");
    expect(suche).toContain("this.feld.setAttribute('aria-expanded', 'false')");
  });

  it('zeichnet die Standortaktion als vollständiges Fingerziel', () => {
    expect(suche).toContain("knopf.className = 'search-create-site'");
    expect(css).toMatch(/\.search-create-site\s*\{[\s\S]*?min-height: 48px;/);
    expect(css).toMatch(/\.search-results\.search-results-intro\s*\{[\s\S]*?pointer-events: none;/);
  });
});
