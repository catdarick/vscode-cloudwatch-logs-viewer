/**
 * Binds events to table elements using event delegation.
 * Separated from DOM construction for clarity.
 */
import { getState } from '../../../core/state';
import { toggleRowDetails } from '../details';
import { showColumnFilter } from '../filters';
import { initColumnResize } from '../columnResize';

export class TableEventBinder {
  constructor(private container: HTMLElement) {}

  /**
   * Bind all table events (expand, filter, resize).
   */
  bindAll(): void {
    this.bindExpandButtons();
    this.bindFilterButtons();
    this.bindColumnResizers();
  }

  /**
   * Bind expand button clicks using event delegation.
   */
  private bindExpandButtons(): void {
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('expand-btn')) {
        const row = target.closest('tr') as HTMLTableRowElement;
        if (row) {
          this.handleExpandClick(row);
        }
      }
    });
  }

  /**
   * Bind filter button clicks using event delegation.
   */
  private bindFilterButtons(): void {
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('column-filter-btn')) {
        e.stopPropagation();
        const field = target.dataset.field;
        if (field) {
          this.handleFilterClick(field, target);
        }
      }
    });
  }

  /**
   * Bind column resizer mousedown using event delegation.
   */
  private bindColumnResizers(): void {
    this.container.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('column-resizer')) {
        const th = target.closest('th') as HTMLTableHeaderCellElement;
        if (th) {
          this.handleResizerMouseDown(e as MouseEvent, th);
        }
      }
    });
  }

  /**
   * Handle expand button click to toggle row details.
   */
  private handleExpandClick(row: HTMLTableRowElement): void {
    const rowIndex = parseInt(row.dataset.rowIndex || '0', 10);
    const s = getState();
    const tab = s.tabs.find(t => t.id === s.activeTabId);
    if (tab?.results) {
      const rowData = tab.results.rows[rowIndex];
      toggleRowDetails(row, rowData);
    }
  }

  /**
   * Handle filter button click to show column filter menu.
   */
  private handleFilterClick(field: string, button: HTMLElement): void {
    showColumnFilter(field, button);
  }

  /**
   * Handle column resizer mousedown to start resize operation.
   */
  private handleResizerMouseDown(e: MouseEvent, th: HTMLElement): void {
    initColumnResize(e, th);
  }
}
