#!/usr/bin/env node
/**
 * Translation Consistency Checker
 * Validates that all language files have identical structure
 *
 * Supports both expanded and compact (inline) object notation
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '../src/i18n/locales');

/**
 * Extract all key paths from a TypeScript translation file
 * Handles both expanded and inline object notation
 */
function extractKeyPaths(filePath) {
  const content = readFileSync(filePath, 'utf-8');

  // Match the exported translation object literal (up to the final `};`).
  const match = content.match(/export const \w+: TranslationDict = (\{[\s\S]*\});\s*$/);
  if (!match) {
    throw new Error('Could not find TranslationDict export');
  }

  // The locale objects are pure data (strings and nested objects, no function
  // calls or template literals), so evaluating the literal is safe and far more
  // accurate than the previous line/regex parser, which produced phantom
  // missing/extra keys for inline vs. expanded notation.
  const obj = eval('(' + match[1] + ')');

  const keys = new Set();
  const walk = (node, prefix) => {
    for (const key of Object.keys(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const value = node[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        walk(value, path);
      } else {
        keys.add(path);
      }
    }
  };
  walk(obj, '');

  return Array.from(keys).sort();
}

/**
 * Main consistency check
 */
function main() {
  const languages = {
    en: 'English',
    de: 'German',
    es: 'Spanish',
    fr: 'French',
    zh: 'Chinese'
  };

  console.log('═'.repeat(80));
  console.log('🌍 i18n Translation Consistency Check');
  console.log('═'.repeat(80));
  console.log();

  // Extract keys from all language files
  const allKeys = {};
  let parseErrors = false;

  for (const [code, name] of Object.entries(languages)) {
    const filePath = join(LOCALES_DIR, `${code}.ts`);

    try {
      console.log(`📄 Parsing ${name} (${code})...`);
      const keys = extractKeyPaths(filePath);
      allKeys[code] = keys;
      console.log(`   ✅ ${keys.length} translation keys found`);
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      allKeys[code] = [];
      parseErrors = true;
    }
  }

  if (parseErrors) {
    console.log();
    console.log('❌ Some files could not be parsed. Please check the errors above.');
    process.exit(1);
  }

  console.log();
  console.log('═'.repeat(80));
  console.log('🔍 Consistency Analysis');
  console.log('═'.repeat(80));
  console.log();

  // Use English as reference
  const referenceKeys = new Set(allKeys.en || []);
  const referenceCount = referenceKeys.size;

  console.log(`📌 Using English as reference: ${referenceCount} keys`);
  console.log();

  let hasIssues = false;
  const results = [];

  // Check each language against reference
  for (const [code, name] of Object.entries(languages)) {
    if (code === 'en') {
      results.push({ code, name, status: '✅', keys: allKeys[code].length, missing: 0, extra: 0 });
      continue;
    }

    const langKeys = new Set(allKeys[code] || []);
    const missing = [...referenceKeys].filter(k => !langKeys.has(k)).sort();
    const extra = [...langKeys].filter(k => !referenceKeys.has(k)).sort();

    if (missing.length === 0 && extra.length === 0) {
      results.push({ code, name, status: '✅', keys: langKeys.size, missing: 0, extra: 0 });
      console.log(`✅ ${name} (${code}): Perfect match! All ${langKeys.size} keys present.`);
    } else {
      hasIssues = true;
      results.push({ code, name, status: '❌', keys: langKeys.size, missing: missing.length, extra: extra.length });

      console.log(`❌ ${name} (${code}): Inconsistencies detected!`);

      if (missing.length > 0) {
        console.log(`   📉 Missing ${missing.length} keys:`);
        missing.forEach(key => console.log(`      - ${key}`));
      }

      if (extra.length > 0) {
        console.log(`   📈 Extra ${extra.length} keys (not in English):`);
        extra.forEach(key => console.log(`      + ${key}`));
      }
    }
    console.log();
  }

  // Summary table
  console.log('═'.repeat(80));
  console.log('📊 Summary');
  console.log('═'.repeat(80));
  console.log();
  console.log('Language        | Status | Total Keys | Missing | Extra');
  console.log('----------------|--------|------------|---------|-------');

  for (const result of results) {
    console.log(
      `${result.name.padEnd(15)} | ${result.status}     | ${String(result.keys).padStart(10)} | ${String(result.missing).padStart(7)} | ${String(result.extra).padStart(5)}`
    );
  }

  console.log();
  console.log('═'.repeat(80));

  if (hasIssues) {
    console.log('❌ FAILED: Translation inconsistencies detected!');
    console.log('   Please add missing translations or remove extra keys.');
    console.log('═'.repeat(80));
    process.exit(1);
  } else {
    console.log('✅ SUCCESS: All translations are consistent!');
    console.log(`   All ${referenceCount} translation keys are present in every language.`);
    console.log('═'.repeat(80));
    process.exit(0);
  }
}

// Run the check
main();
