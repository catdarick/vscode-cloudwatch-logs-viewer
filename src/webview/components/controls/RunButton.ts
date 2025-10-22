/**
 * Encapsulates the Run Query button behavior.
 * Centralizes all button state management in one place.
 */
export class RunButton {
  private element: HTMLButtonElement | null;
  private labelElement: HTMLElement | null;

  constructor() {
    this.element = document.getElementById('runBtn') as HTMLButtonElement | null;
    this.labelElement = this.element?.querySelector('.run-btn-label') as HTMLElement | null ?? null;
  }

  /**
   * Set button to running state (shows "Cancel Query").
   */
  setRunning(): void {
    if (!this.element) return;
    this.element.setAttribute('data-state', 'running');
    this.element.disabled = false;
    if (this.labelElement) {
      this.labelElement.textContent = 'Cancel Query';
    }
  }

  /**
   * Set button to idle state (shows "Run Query").
   */
  setIdle(): void {
    if (!this.element) return;
    this.element.setAttribute('data-state', '');
    this.element.disabled = false;
    if (this.labelElement) {
      this.labelElement.textContent = 'Run Query';
    }
  }

  /**
   * Set button to aborting state (disabled, shows "Cancelling Query...").
   */
  setAborting(): void {
    if (!this.element) return;
    this.element.setAttribute('data-state', 'aborting');
    this.element.disabled = true;
    if (this.labelElement) {
      this.labelElement.textContent = 'Cancelling Query...';
    }
  }

  /**
   * Attach a click handler.
   */
  onClick(handler: () => void): void {
    this.element?.addEventListener('click', handler);
  }

  /**
   * Get the current state of the button.
   */
  getState(): 'running' | 'idle' | 'aborting' | null {
    if (!this.element) return null;
    const state = this.element.getAttribute('data-state');
    if (state === 'running') return 'running';
    if (state === 'aborting') return 'aborting';
    return 'idle';
  }

  /**
   * Check if element exists in DOM.
   */
  exists(): boolean {
    return this.element !== null;
  }
}
