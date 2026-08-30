import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/style.css'), 'utf8');
const main = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');

describe('Anlageformulare im Dunkelmodus', () => {
  it('setzt Feld, Platzhalter, Optionsliste und Autofill ausdrücklich dunkel', () => {
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\)[\s\S]*?#site-create-modal \.machine-input\s*\{[\s\S]*?background: var\(--bg-secondary\);[\s\S]*?color: var\(--text-primary\);/
    );
    expect(css).toMatch(
      /#site-create-modal \.machine-input::placeholder\s*\{[\s\S]*?color: var\(--text-muted\);[\s\S]*?opacity: 1;/
    );
    expect(css).toContain('#site-create-modal select.machine-input option');
    expect(css).toContain('#site-create-modal .machine-input:-webkit-autofill');
    expect(css).toContain('color-scheme: dark');
  });

  it('hält die Zusatzangaben beim Einstieg aus einem Standort geschlossen', () => {
    expect(main).toMatch(
      /const optionen = document\.getElementById\([\s\S]*?'machine-optional-details'[\s\S]*?if \(optionen\) optionen\.open = false;/
    );
  });
});
