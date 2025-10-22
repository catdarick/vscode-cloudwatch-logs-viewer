/**
 * Encapsulates search input field behavior.
 */
export class SearchInput {
  private element: HTMLInputElement | null;

  constructor() {
    this.element = document.getElementById('searchInput') as HTMLInputElement | null;
  }

  /**
   * Get the current input value (trimmed).
   */
  getValue(): string {
    return this.element?.value.trim() ?? '';
  }

  /**
   * Set the input value.
   */
  setValue(value: string): void {
    if (this.element) {
      this.element.value = value;
    }
  }

  /**
   * Clear the input.
   */
  clear(): void {
    this.setValue('');
  }

  /**
   * Focus the input element.
   */
  focus(): void {
    this.element?.focus();
  }

  /**
   * Attach an input event handler.
   */
  onInput(handler: (value: string) => void): void {
    this.element?.addEventListener('input', (e) => {
      handler((e.target as HTMLInputElement).value);
    });
  }

  /**
   * Attach a keydown event handler.
   */
  onKeyDown(handler: (e: KeyboardEvent) => void): void {
    this.element?.addEventListener('keydown', handler);
  }

  /**
   * Check if element exists in DOM.
   */
  exists(): boolean {
    return this.element !== null;
  }
}
