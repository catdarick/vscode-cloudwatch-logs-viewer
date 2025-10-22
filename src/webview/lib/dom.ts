/**
 * Type-safe DOM utilities to eliminate unsafe type assertions.
 * These functions provide compile-time type safety when accessing DOM elements.
 */

/**
 * Get an element by ID with type safety.
 * Verifies that the element exists and has the expected tag name.
 * 
 * @example
 * const input = getElement('searchInput', 'input'); // Type: HTMLInputElement | null
 * const button = getElement('runBtn', 'button'); // Type: HTMLButtonElement | null
 */
export function getElement<K extends keyof HTMLElementTagNameMap>(
  id: string,
  tagName: K
): HTMLElementTagNameMap[K] | null {
  const element = document.getElementById(id);
  if (!element) return null;
  return element.tagName.toLowerCase() === tagName.toLowerCase()
    ? (element as HTMLElementTagNameMap[K])
    : null;
}

/**
 * Query selector with type safety.
 * Verifies that the element has the expected tag name.
 */
export function querySelector<K extends keyof HTMLElementTagNameMap>(
  selector: string,
  tagName: K
): HTMLElementTagNameMap[K] | null {
  const element = document.querySelector(selector);
  if (!element) return null;
  return element.tagName.toLowerCase() === tagName.toLowerCase()
    ? (element as HTMLElementTagNameMap[K])
    : null;
}

/**
 * Query selector all with type safety.
 * Returns only elements matching the expected tag name.
 */
export function querySelectorAll<K extends keyof HTMLElementTagNameMap>(
  selector: string,
  tagName: K
): HTMLElementTagNameMap[K][] {
  const elements = Array.from(document.querySelectorAll(selector));
  return elements.filter(
    (el): el is HTMLElementTagNameMap[K] => 
      el instanceof Element && el.tagName.toLowerCase() === tagName.toLowerCase()
  ) as HTMLElementTagNameMap[K][];
}

/**
 * Get an element by ID without tag verification (less safe).
 * Use this when you're certain of the element type but it doesn't have a specific tag.
 */
export function getElementById(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/**
 * Safe querySelector that returns HTMLElement.
 */
export function queryElement(selector: string): HTMLElement | null {
  const el = document.querySelector(selector);
  return el as HTMLElement | null;
}
