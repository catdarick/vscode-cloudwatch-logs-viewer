// Core domain entities for CloudWatch Logs data structures.
// These are business logic types, independent of UI state.

export interface QueryField {
  field: string;
  value: string;
}

export interface QueryRow {
  // CloudWatch Logs returns an array of { field, value }
  fields: QueryField[];
}

export interface QueryResults {
  fieldOrder: string[];          // Order for columns
  rows: QueryRow[];              // Data rows
  hiddenFields?: string[];       // Fields to hide from column rendering but still available for detail expansion
}

export interface TimeRange {
  start: number; // epoch ms
  end: number;   // epoch ms
}

export type TimeMode = 'relative' | 'absolute';
export type RelativeUnit = 'minutes' | 'hours' | 'days';

export interface RelativeTimeSpec {
  value: number;      // numeric input or quick preset
  unit: RelativeUnit; // unit for value
}
