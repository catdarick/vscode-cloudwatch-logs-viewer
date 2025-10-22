/**
 * Encapsulates the region input field behavior.
 */
export class RegionInput {
  private element: HTMLInputElement | null;

  constructor() {
    this.element = document.getElementById('region') as HTMLInputElement | null;
  }

  /**
   * Get the current region value (trimmed).
   */
  getValue(): string {
    return this.element?.value.trim() ?? 'us-east-2';
  }

  /**
   * Set the region value.
   */
  setValue(value: string): void {
    if (this.element) {
      this.element.value = value;
    }
  }

  /**
   * Attach a change event handler.
   */
  onChange(handler: (value: string) => void): void {
    this.element?.addEventListener('change', (e) => {
      handler((e.target as HTMLInputElement).value);
    });
  }

  /**
   * Check if element exists in DOM.
   */
  exists(): boolean {
    return this.element !== null;
  }
}
