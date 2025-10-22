/**
 * Builds the results table DOM structure.
 * Pure DOM construction - no state mutations, no event handling.
 */
import { QueryResults, QueryRow } from '../../../types/domain';

export class TableBuilder {
  private table: HTMLTableElement;
  
  constructor(
    private results: QueryResults,
    private hiddenFields: string[] = ['@ptr']
  ) {
    this.table = document.createElement('table') as HTMLTableElement;
  }
  
  /**
   * Build the complete table structure.
   */
  build(): HTMLTableElement {
    this.buildHeader();
    this.buildBody();
    return this.table;
  }
  
  /**
   * Build table header with column names and filter buttons.
   */
  private buildHeader(): void {
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // Expand column
    headerRow.appendChild(this.createExpandHeader());
    
    // Data columns
    const visibleFields = this.getVisibleFields();
    visibleFields.forEach((field, index) => {
      const th = this.createColumnHeader(field, index, visibleFields.length);
      headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    this.table.appendChild(thead);
  }
  
  /**
   * Build table body with data rows.
   */
  private buildBody(): void {
    const tbody = document.createElement('tbody');
    const visibleFields = this.getVisibleFields();
    
    this.results.rows.forEach((row, rowIndex) => {
      const tr = this.createRow(row, rowIndex, visibleFields);
      tbody.appendChild(tr);
    });
    
    this.table.appendChild(tbody);
  }
  
  /**
   * Get list of fields that should be displayed (not hidden).
   */
  private getVisibleFields(): string[] {
    return this.results.fieldOrder.filter(
      f => !this.hiddenFields.includes(f)
    );
  }
  
  /**
   * Create the expand column header.
   */
  private createExpandHeader(): HTMLTableHeaderCellElement {
    const th = document.createElement('th') as HTMLTableHeaderCellElement;
    th.className = 'expand-col-header';
    th.style.width = '34px';
    return th;
  }
  
  /**
   * Create a column header with field name, filter button, and resizer.
   */
  private createColumnHeader(
    field: string,
    index: number,
    totalColumns: number
  ): HTMLTableHeaderCellElement {
    const th = document.createElement('th') as HTMLTableHeaderCellElement;
    th.style.position = 'relative';
    th.dataset.field = field;
    
    const headerContent = document.createElement('div');
    headerContent.className = 'th-content';
    
    const span = document.createElement('span');
    span.textContent = field;
    headerContent.appendChild(span);
    
    const filterBtn = this.createFilterButton(field);
    headerContent.appendChild(filterBtn);
    
    th.appendChild(headerContent);
    
    // Add resizer for all columns except the last
    if (index < totalColumns - 1) {
      const resizer = this.createResizer();
      th.appendChild(resizer);
    }
    
    return th;
  }
  
  /**
   * Create a filter button for a column.
   */
  private createFilterButton(field: string): HTMLButtonElement {
    const btn = document.createElement('button') as HTMLButtonElement;
    btn.type = 'button';
    btn.className = 'column-filter-btn';
    btn.title = `Filter ${field}`;
    btn.innerHTML = '⋮';
    btn.dataset.field = field; // For event delegation
    return btn;
  }
  
  /**
   * Create a column resizer element.
   */
  private createResizer(): HTMLDivElement {
    const resizer = document.createElement('div') as HTMLDivElement;
    resizer.className = 'column-resizer';
    return resizer;
  }
  
  /**
   * Create a data row with expand button and cells.
   */
  private createRow(
    row: QueryRow,
    rowIndex: number,
    visibleFields: string[]
  ): HTMLTableRowElement {
    const tr = document.createElement('tr') as HTMLTableRowElement;
    tr.dataset.rowIndex = String(rowIndex);
    
    // Expand cell
    const expandCell = this.createExpandCell();
    tr.appendChild(expandCell);
    
    // Data cells
    visibleFields.forEach(field => {
      const cell = this.createDataCell(row, field);
      tr.appendChild(cell);
    });
    
    return tr;
  }
  
  /**
   * Create expand/collapse cell for row details.
   */
  private createExpandCell(): HTMLTableCellElement {
    const td = document.createElement('td') as HTMLTableCellElement;
    td.className = 'expand-cell';
    
    const btn = document.createElement('button') as HTMLButtonElement;
    btn.type = 'button';
    btn.className = 'expand-btn';
    btn.title = 'Show details';
    btn.textContent = '›';
    
    td.appendChild(btn);
    return td;
  }
  
  /**
   * Create a data cell for a specific field.
   */
  private createDataCell(row: QueryRow, field: string): HTMLTableCellElement {
    const td = document.createElement('td') as HTMLTableCellElement;
    const valObj = row.fields.find(x => x.field === field);
    const val = valObj ? valObj.value : '';
    td.textContent = val;
    td.dataset.field = field;
    return td;
  }
}
