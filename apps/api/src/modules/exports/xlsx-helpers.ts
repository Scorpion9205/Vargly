import ExcelJS from 'exceljs';

export type CellFormat = 'text' | 'money' | 'number' | 'date' | 'percent' | 'center';

export interface Column<T> {
  readonly header: string;
  /** The cell value; dates may be a Date or YYYY-MM-DD text */
  readonly value: (row: T) => string | number | Date | null | undefined;
  readonly format?: CellFormat;
  /** Column width in characters; sized to the content when left out */
  readonly width?: number;
}

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF26B3A' } };
const MONEY_FORMAT = '"₹"#,##0.00';
const DATE_FORMAT = 'dd-mmm-yyyy';

export function newWorkbook(title: string): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Vargly';
  workbook.created = new Date();
  workbook.title = title;
  return workbook;
}

/** Sheet names: at most 31 characters, none of  \ / ? * [ ] : */
export function safeSheetName(name: string, taken: ReadonlySet<string> = new Set()): string {
  const base = name.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

/**
 * A titled table: an optional heading line, a bold coloured header row that stays in view, the
 * rows, and widths that fit. Returns the sheet so totals or notes can follow.
 */
export function addTableSheet<T>(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: ReadonlyArray<Column<T>>,
  rows: readonly T[],
  options: { heading?: string } = {},
): ExcelJS.Worksheet {
  const taken = new Set(workbook.worksheets.map((s) => s.name.toLowerCase()));
  const sheet = workbook.addWorksheet(safeSheetName(name, taken));

  let headerRowNumber = 1;
  if (options.heading) {
    sheet.addRow([options.heading]).font = { bold: true, size: 14 };
    sheet.addRow([]);
    headerRowNumber = 3;
  }

  const header = sheet.addRow(columns.map((column) => column.header));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
  });
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];

  const longest = columns.map((column) => column.header.length);
  for (const row of rows) {
    const values = columns.map((column) => {
      const value = column.value(row);
      if (value === null || value === undefined) return null;
      return column.format === 'date' ? toDate(value as string | Date) : value;
    });
    const added = sheet.addRow(values);
    columns.forEach((column, index) => {
      const cell = added.getCell(index + 1);
      if (column.format === 'money') cell.numFmt = MONEY_FORMAT;
      else if (column.format === 'date') cell.numFmt = DATE_FORMAT;
      else if (column.format === 'percent') cell.numFmt = '0.0"%"';
      else if (column.format === 'number') cell.numFmt = '#,##0.##';
      if (column.format === 'center') cell.alignment = { horizontal: 'center' };
      const raw = values[index];
      const length = raw instanceof Date ? 11 : String(raw ?? '').length;
      longest[index] = Math.max(longest[index]!, length);
    });
  }

  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width ?? Math.min(Math.max(longest[index]! + 2, 8), 48);
  });
  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: columns.length } };
  }
  return sheet;
}

/** A two-column sheet of label and value, for report totals */
export function addSummarySheet(
  workbook: ExcelJS.Workbook,
  name: string,
  heading: string,
  items: ReadonlyArray<{ label: string; value: string | number | null; format?: CellFormat }>,
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(safeSheetName(name));
  sheet.addRow([heading]).font = { bold: true, size: 14 };
  sheet.addRow([]);
  for (const item of items) {
    const row = sheet.addRow([item.label, item.value]);
    row.getCell(1).font = { bold: true };
    const cell = row.getCell(2);
    cell.alignment = { horizontal: 'right' };
    if (item.format === 'money') cell.numFmt = MONEY_FORMAT;
    else if (item.format === 'percent') cell.numFmt = '0.0"%"';
    else if (item.format === 'number') cell.numFmt = '#,##0.##';
  }
  sheet.getColumn(1).width = 36;
  sheet.getColumn(2).width = 22;
  return sheet;
}

export async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
