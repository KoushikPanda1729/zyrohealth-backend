import ExcelJS from 'exceljs';
import { Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { MedicineShopStockMovement } from '../../entities/MedicineShopStockMovement';

export interface StockHistoryExportFilter {
  from?: string;
  to?: string;
  catalogItemId?: string;
}

// Caps the export at a generous but bounded size — a shop with years of
// history shouldn't be able to trigger an unbounded query/export; if this
// is ever hit in practice, narrowing the date range is the fix, not
// raising this number.
const EXPORT_ROW_LIMIT = 20000;

export async function listStockMovementsForExport(
  shopId: string,
  filter: StockHistoryExportFilter,
): Promise<MedicineShopStockMovement[]> {
  const where: Record<string, unknown> = { shopId };
  if (filter.catalogItemId) where.catalogItemId = filter.catalogItemId;

  if (filter.from && filter.to) {
    where.createdAt = Between(new Date(filter.from), endOfDay(filter.to));
  } else if (filter.from) {
    where.createdAt = MoreThanOrEqual(new Date(filter.from));
  } else if (filter.to) {
    where.createdAt = LessThanOrEqual(endOfDay(filter.to));
  }

  return AppDataSource.getRepository(MedicineShopStockMovement).find({
    where,
    // Ascending — an exported ledger reads like a report, oldest entry
    // first, unlike the in-app drawer which shows most-recent-first.
    order: { createdAt: 'ASC' },
    take: EXPORT_ROW_LIMIT,
  });
}

// A bare "YYYY-MM-DD" string parses as UTC midnight — end-of-day must be
// computed in UTC too (setUTCHours, not setHours), otherwise this boundary
// silently shifts by the server process's local UTC offset while the
// start boundary doesn't, cutting off however many hours of that gap from
// the start of the range. (Caveat this doesn't fully solve: "today" still
// means the UTC calendar day, not the shop's own local calendar day —
// there's no per-shop timezone stored to do better than that here.)
function endOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function formatRow(m: MedicineShopStockMovement): (string | number)[] {
  return [
    new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    m.itemName,
    m.reason,
    m.delta,
    m.quantityAfter,
    m.note ?? '',
  ];
}

const HEADER = ['Date', 'Medicine', 'Reason', 'Change', 'Quantity After', 'Note'];

export function buildStockHistoryCsv(movements: MedicineShopStockMovement[]): string {
  const rows = movements.map((m) =>
    formatRow(m)
      .map((v) => {
        const s = String(v);
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(','),
  );
  return [HEADER.join(','), ...rows].join('\n');
}

export async function buildStockHistoryXlsx(movements: MedicineShopStockMovement[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Stock History');
  sheet.columns = HEADER.map((header) => ({ header, key: header, width: header === 'Note' ? 30 : 18 }));
  sheet.getRow(1).font = { bold: true };
  for (const m of movements) {
    sheet.addRow(formatRow(m));
  }
  // exceljs's own Buffer-like return type predates the newer @types/node
  // Buffer<ArrayBufferLike> generic — a type-defs mismatch, not a real
  // runtime concern (same class of cast as catalog-import.util.ts's read side).
  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}
