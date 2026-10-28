import { request } from '../host';

/** RFC 4180 CSV: every field quoted when it holds a comma, quote or line break. */
export function toCsv(columns: string[], rows: Array<Record<string, string | undefined>>): string {
  const line = (values: Array<string | undefined>) => values.map((v) => escapeField(v ?? '')).join(',');
  return [line(columns), ...rows.map((row) => line(columns.map((c) => row[c])))].join('\r\n');
}

function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Asks where to save the file and writes it. The BOM lets Excel read UTF-8 correctly. */
export function downloadCsv(filename: string, csv: string): Promise<boolean> {
  return request('saveFile', { filename, content: `\ufeff${csv}` });
}
