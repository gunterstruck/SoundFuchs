/**
 * ZANOBOT - HTML SANITIZATION UTILITY
 *
 * Provides safe HTML escaping to prevent XSS when inserting
 * user-controlled data into innerHTML templates.
 *
 * Uses the browser's built-in text encoding via textContent/innerHTML
 * to reliably escape all HTML special characters.
 */

/**
 * Escape a string for safe insertion into HTML
 *
 * Converts HTML-special characters (&, <, >, ", ') to their
 * entity equivalents so the string is rendered as text, not markup.
 *
 * @param text - Untrusted string (e.g. machine name, error message)
 * @returns HTML-safe string
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
