import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { CatalogItemInput } from './catalog.util';

export interface ParsedCatalogRow {
  rowNumber: number; // 1-indexed, matching what a spreadsheet user sees (header = row 1)
  data?: CatalogItemInput & { name: string; priceCents: number };
  error?: string;
}

// Flexible header aliases — a shop's own spreadsheet won't use our exact
// field names, so match on common real-world column headers instead of
// forcing an exact template (a template is still offered for convenience,
// see buildCatalogTemplateCsv below).
const HEADER_ALIASES: Record<keyof RawRow, string[]> = {
  name: [
    'name',
    'medicine',
    'medicine name',
    'product',
    'product name',
    'item',
    'item name',
  ],
  price: [
    'price',
    'price rs',
    'price (rs)',
    'mrp',
    'unit price',
    'rate',
    'price per unit',
  ],
  quantity: ['quantity', 'qty', 'stock', 'stock qty', 'in stock'],
  unit: ['unit', 'uom', 'pack unit'],
  rackLocation: [
    'rack',
    'rack location',
    'shelf',
    'location',
    'bin',
    'rack no',
  ],
  batchNumber: ['batch', 'batch no', 'batch number', 'batchno'],
  expiryDate: ['expiry', 'expiry date', 'exp', 'exp date', 'expirydate'],
  manufacturer: ['manufacturer', 'brand', 'company', 'mfg'],
  sku: ['sku', 'code', 'barcode', 'product code'],
};

interface RawRow {
  name?: string;
  price?: string;
  quantity?: string;
  unit?: string;
  rackLocation?: string;
  batchNumber?: string;
  expiryDate?: string;
  manufacturer?: string;
  sku?: string;
}

// ExcelJS cell values aren't always plain strings/numbers — rich text,
// formula results, and hyperlinks are objects — so a blind String(value)
// can produce "[object Object]". Handle the shapes we actually expect from
// a catalog spreadsheet and fall back to '' for anything unrecognized.
function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join('');
    }
    if ('result' in value) return cellToString(value.result);
    if ('text' in value && typeof value.text === 'string') return value.text;
  }
  return '';
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_.]/g, ' ').replace(/\s+/g, ' ');
}

// Maps a spreadsheet's actual header row to our known field keys.
function buildHeaderMap(headers: string[]): Map<number, keyof RawRow> {
  const map = new Map<number, keyof RawRow>();
  headers.forEach((raw, index) => {
    const normalized = normalizeHeader(raw ?? '');
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [
      keyof RawRow,
      string[],
    ][]) {
      if (aliases.includes(normalized)) {
        map.set(index, field);
        break;
      }
    }
  });
  return map;
}

function parsePriceToCents(raw?: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\d.]/g, '');
  const value = parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value * 100);
}

function parseIntOrUndefined(raw?: string): number | undefined {
  if (!raw) return undefined;
  const value = parseInt(raw.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(value) ? value : undefined;
}

// The DB column is a strict Postgres `date`, so anything that isn't a real
// calendar date (a placeholder like "TBD", a typo, free text) must be
// rejected here — otherwise it reaches the DB as an invalid `date` literal
// and blows up the whole request with an unhandled query error.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseExpiryDate(raw?: string): string | null | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (!ISO_DATE_RE.test(trimmed)) return undefined;
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return trimmed;
}

function normalizeRow(raw: RawRow, rowNumber: number): ParsedCatalogRow {
  const name = raw.name?.trim();
  if (!name) return { rowNumber, error: 'Missing medicine name' };

  const priceCents = parsePriceToCents(raw.price);
  if (priceCents === undefined)
    return { rowNumber, error: 'Missing or invalid price' };

  const expiryDate = parseExpiryDate(raw.expiryDate);
  if (expiryDate === undefined)
    return {
      rowNumber,
      error: `Invalid expiry date "${raw.expiryDate}" (expected YYYY-MM-DD)`,
    };

  return {
    rowNumber,
    data: {
      name,
      priceCents,
      quantity: parseIntOrUndefined(raw.quantity),
      unit: raw.unit?.trim() || undefined,
      rackLocation: raw.rackLocation?.trim() || null,
      batchNumber: raw.batchNumber?.trim() || null,
      expiryDate,
      manufacturer: raw.manufacturer?.trim() || null,
      sku: raw.sku?.trim() || null,
    },
  };
}

async function parseXlsx(buffer: Buffer): Promise<ParsedCatalogRow[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's bundled types predate the newer @types/node Buffer<ArrayBufferLike>
  // generic — this is a type-defs mismatch, not a real runtime concern.
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cellToString(cell.value);
  });
  const headerMap = buildHeaderMap(headers);

  const rows: ParsedCatalogRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: RawRow = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const field = headerMap.get(colNumber - 1);
      if (!field) return;
      raw[field] = cellToString(cell.value);
    });
    if (Object.values(raw).every((v) => !v)) return; // skip fully blank rows
    rows.push(normalizeRow(raw, rowNumber));
  });
  return rows;
}

function parseCsvFile(buffer: Buffer): ParsedCatalogRow[] {
  const records: string[][] = parseCsv(buffer, {
    columns: false,
    skip_empty_lines: true,
    trim: true,
  });
  if (records.length === 0) return [];

  const headerMap = buildHeaderMap(records[0]);
  const rows: ParsedCatalogRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const record = records[i];
    const raw: RawRow = {};
    record.forEach((value, colIndex) => {
      const field = headerMap.get(colIndex);
      if (field) raw[field] = value;
    });
    if (Object.values(raw).every((v) => !v)) continue;
    rows.push(normalizeRow(raw, i + 1));
  }
  return rows;
}

export async function parseCatalogFile(
  buffer: Buffer,
  filename: string,
): Promise<ParsedCatalogRow[]> {
  const isXlsx = /\.xlsx?$/i.test(filename);
  return isXlsx ? parseXlsx(buffer) : parseCsvFile(buffer);
}

export function buildCatalogTemplateCsv(): string {
  const header =
    'Name,Price,Quantity,Unit,Rack Location,Batch Number,Expiry Date,Manufacturer,SKU';
  const example =
    'Paracetamol 500mg,50,100,strip,Rack A-3,B2024118,2027-06-30,Cipla,PARA500';
  return `${header}\n${example}\n`;
}
