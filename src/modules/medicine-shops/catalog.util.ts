import { ILike } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import {
  MedicineShopStockMovement,
  StockMovementReason,
} from '../../entities/MedicineShopStockMovement';
import { ParsedCatalogRow } from './catalog-import.util';
import { AppError } from '../../utils/app-error';

// Shared field-merge shape used by manual create/update (shop.service.ts +
// admin.service.ts) AND the bulk-import upsert path — one place defining
// what a "catalog item edit" can touch, so all three entry points
// (portal form, admin-on-behalf-of form, spreadsheet row) stay consistent.
export interface CatalogItemInput {
  name?: string;
  priceCents?: number;
  isActive?: boolean;
  quantity?: number;
  unit?: string;
  rackLocation?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  manufacturer?: string | null;
  sku?: string | null;
  lowStockThreshold?: number | null;
  preferredSupplierId?: string | null;
  gstRatePercent?: number;
  isControlledDrug?: boolean;
  packSize?: number | null;
  subUnit?: string | null;
}

// Pulls the optional inventory fields out of a request body — shared by
// both shop.controller.ts and admin.controller.ts so the accepted field
// list only needs to be maintained in one place.
export function extractCatalogFieldsFromBody(
  body: Record<string, unknown>,
): CatalogItemInput {
  const fields: CatalogItemInput = {};
  if (typeof body.isActive === 'boolean') fields.isActive = body.isActive;
  if (typeof body.quantity === 'number') fields.quantity = body.quantity;
  if (typeof body.unit === 'string') fields.unit = body.unit;
  if ('rackLocation' in body)
    fields.rackLocation = (body.rackLocation as string | null) ?? null;
  if ('batchNumber' in body)
    fields.batchNumber = (body.batchNumber as string | null) ?? null;
  if ('expiryDate' in body)
    fields.expiryDate = (body.expiryDate as string | null) ?? null;
  if ('manufacturer' in body)
    fields.manufacturer = (body.manufacturer as string | null) ?? null;
  if ('sku' in body) fields.sku = (body.sku as string | null) ?? null;
  if ('lowStockThreshold' in body)
    fields.lowStockThreshold =
      (body.lowStockThreshold as number | null) ?? null;
  if ('preferredSupplierId' in body)
    fields.preferredSupplierId =
      (body.preferredSupplierId as string | null) ?? null;
  if (typeof body.gstRatePercent === 'number') fields.gstRatePercent = body.gstRatePercent;
  if (typeof body.isControlledDrug === 'boolean') fields.isControlledDrug = body.isControlledDrug;
  if ('packSize' in body) fields.packSize = (body.packSize as number | null) ?? null;
  if ('subUnit' in body) fields.subUnit = (body.subUnit as string | null) ?? null;
  return fields;
}

export function applyCatalogFields(
  item: MedicineShopCatalogItem,
  data: CatalogItemInput,
): void {
  if (data.name !== undefined) item.name = data.name;
  if (data.priceCents !== undefined) item.priceCents = data.priceCents;
  if (data.isActive !== undefined) item.isActive = data.isActive;
  if (data.quantity !== undefined) item.quantity = data.quantity;
  if (data.unit !== undefined) item.unit = data.unit;
  if (data.rackLocation !== undefined) item.rackLocation = data.rackLocation;
  if (data.batchNumber !== undefined) item.batchNumber = data.batchNumber;
  if (data.expiryDate !== undefined) item.expiryDate = data.expiryDate;
  if (data.manufacturer !== undefined) item.manufacturer = data.manufacturer;
  if (data.sku !== undefined) item.sku = data.sku;
  if (data.lowStockThreshold !== undefined)
    item.lowStockThreshold = data.lowStockThreshold;
  if (data.preferredSupplierId !== undefined)
    item.preferredSupplierId = data.preferredSupplierId;
  if (data.gstRatePercent !== undefined) item.gstRatePercent = data.gstRatePercent;
  if (data.isControlledDrug !== undefined) item.isControlledDrug = data.isControlledDrug;
  if (data.packSize !== undefined) item.packSize = data.packSize;
  if (data.subUnit !== undefined) item.subUnit = data.subUnit;
}

// ── Stock ledger — an append-only record of every quantity change, so a
// shop can answer "why did my count drop" instead of a silent overwrite ──

async function recordStockMovement(
  item: MedicineShopCatalogItem,
  delta: number,
  reason: StockMovementReason,
  note?: string,
): Promise<void> {
  if (delta === 0) return;
  const repo = AppDataSource.getRepository(MedicineShopStockMovement);
  await repo.save(
    repo.create({
      shopId: item.shopId,
      tenantId: item.tenantId,
      catalogItemId: item.id,
      itemName: item.name,
      delta,
      quantityAfter: item.quantity,
      reason,
      note,
    }),
  );
}

// Saves a catalog item and logs the resulting quantity delta (if any) to
// the stock ledger in one place — every mutation path (manual create/
// update, bulk upload, order-fulfillment decrement) should go through this
// rather than calling repo.save() directly, so the ledger never misses one.
export async function saveCatalogItemWithLedger(
  item: MedicineShopCatalogItem,
  previousQuantity: number,
  reason: StockMovementReason,
  note?: string,
): Promise<MedicineShopCatalogItem> {
  const repo = AppDataSource.getRepository(MedicineShopCatalogItem);
  const saved = await repo.save(item);
  await recordStockMovement(
    saved,
    saved.quantity - previousQuantity,
    reason,
    note,
  );
  return saved;
}

export async function listStockMovements(
  shopId: string,
  catalogItemId?: string,
  limit = 50,
): Promise<MedicineShopStockMovement[]> {
  return AppDataSource.getRepository(MedicineShopStockMovement).find({
    where: catalogItemId ? { shopId, catalogItemId } : { shopId },
    order: { createdAt: 'DESC' },
    take: limit,
  });
}

// Called when a prescription quote turns into a real confirmed order —
// decrements the matching catalog item(s) by the ordered quantity (never
// below zero) and reports which items just crossed their low-stock
// threshold, so the caller (whatsapp-bot.service.ts) can notify the shop.
// Items not found in the catalog (not every shop maintains one) are
// silently skipped — there's nothing to decrement.
export async function decrementStockForOrder(
  shopId: string,
  orderedItems: { name: string; quantity: number }[],
): Promise<{ crossedLowStock: MedicineShopCatalogItem[] }> {
  const repo = AppDataSource.getRepository(MedicineShopCatalogItem);
  const crossedLowStock: MedicineShopCatalogItem[] = [];

  for (const ordered of orderedItems) {
    const item = await repo.findOne({
      where: { shopId, name: ILike(ordered.name) },
    });
    if (!item) continue;

    const previousQuantity = item.quantity;
    item.quantity = Math.max(0, previousQuantity - (ordered.quantity || 1));
    const saved = await saveCatalogItemWithLedger(
      item,
      previousQuantity,
      StockMovementReason.SALE,
    );

    const wasAboveThreshold =
      saved.lowStockThreshold != null &&
      previousQuantity > saved.lowStockThreshold;
    const isAtOrBelowNow =
      saved.lowStockThreshold != null &&
      saved.quantity <= saved.lowStockThreshold;
    if (wasAboveThreshold && isAtOrBelowNow) crossedLowStock.push(saved);
  }

  return { crossedLowStock };
}

export interface BulkUploadResult {
  createdCount: number;
  updatedCount: number;
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
}

const PRICE_JUMP_FACTOR = 3;

// Upserts parsed spreadsheet rows into a shop's catalog, matched by
// case-insensitive exact name — the simplest reasonable identity key given
// there's no barcode/SKU guaranteed to be present in every shop's own
// spreadsheet. A row with a parse error (missing name/price) is skipped
// and reported, never silently dropped. A price that jumps more than 3x
// (up or down) from the existing price is still applied — this is the
// shop's own inventory data, not ours to refuse — but flagged as a
// warning so a fat-fingered spreadsheet cell (e.g. an extra zero) gets
// caught by a human before it reaches a real quote.
export async function bulkUpsertCatalogRows(
  shopId: string,
  tenantId: string,
  rows: ParsedCatalogRow[],
): Promise<BulkUploadResult> {
  const repo = AppDataSource.getRepository(MedicineShopCatalogItem);
  const result: BulkUploadResult = {
    createdCount: 0,
    updatedCount: 0,
    errors: [],
    warnings: [],
  };

  for (const row of rows) {
    if (row.error || !row.data) {
      result.errors.push({
        row: row.rowNumber,
        message: row.error ?? 'Could not parse this row',
      });
      continue;
    }
    const existing = await repo.findOne({
      where: { shopId, name: ILike(row.data.name) },
    });
    if (existing) {
      const oldPrice = existing.priceCents;
      const newPrice = row.data.priceCents;
      if (
        oldPrice > 0 &&
        (newPrice > oldPrice * PRICE_JUMP_FACTOR ||
          newPrice * PRICE_JUMP_FACTOR < oldPrice)
      ) {
        result.warnings.push({
          row: row.rowNumber,
          message: `Price for "${row.data.name}" changed from Rs.${(oldPrice / 100).toFixed(2)} to Rs.${(newPrice / 100).toFixed(2)} — please double-check this wasn't a typo.`,
        });
      }
      const previousQuantity = existing.quantity;
      applyCatalogFields(existing, row.data);
      await saveCatalogItemWithLedger(
        existing,
        previousQuantity,
        StockMovementReason.RESTOCK,
        'Bulk upload',
      );
      result.updatedCount++;
    } else {
      const item = repo.create({
        shopId,
        tenantId,
        name: row.data.name,
        priceCents: row.data.priceCents,
      });
      applyCatalogFields(item, row.data);
      await saveCatalogItemWithLedger(
        item,
        0,
        StockMovementReason.INITIAL,
        'Bulk upload',
      );
      result.createdCount++;
    }
  }

  return result;
}

export type StockAdjustmentType = 'return' | 'damage';

// A customer return (stock physically comes back — adds it back) or
// damaged/expired stock being written off (removes it) — both go through
// the same ledger as every other quantity change, just with their own
// reason so "why did this drop/rise" stays answerable from the ledger
// alone instead of looking like an unexplained manual correction.
export async function adjustStock(
  shopId: string,
  itemId: string,
  type: StockAdjustmentType,
  quantity: number,
  note?: string,
): Promise<MedicineShopCatalogItem> {
  if (!quantity || quantity <= 0) {
    throw AppError.badRequest('quantity must be greater than 0');
  }
  const repo = AppDataSource.getRepository(MedicineShopCatalogItem);
  const item = await repo.findOne({ where: { id: itemId, shopId } });
  if (!item) throw AppError.notFound('Catalog item');

  const previousQuantity = item.quantity;
  item.quantity =
    type === 'return' ? previousQuantity + quantity : Math.max(0, previousQuantity - quantity);
  return saveCatalogItemWithLedger(
    item,
    previousQuantity,
    type === 'return' ? StockMovementReason.RETURN : StockMovementReason.DAMAGE,
    note,
  );
}

export function buildCatalogExportCsv(
  items: MedicineShopCatalogItem[],
): string {
  const header =
    'Name,Price,Quantity,Unit,Rack Location,Batch Number,Expiry Date,Manufacturer,SKU,Active';
  const rows = items.map((i) =>
    [
      i.name,
      (i.priceCents / 100).toFixed(2),
      i.quantity,
      i.unit,
      i.rackLocation ?? '',
      i.batchNumber ?? '',
      i.expiryDate ?? '',
      i.manufacturer ?? '',
      i.sku ?? '',
      i.isActive ? 'Yes' : 'No',
    ]
      .map((v) => {
        const s = String(v);
        return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(','),
  );
  return [header, ...rows].join('\n');
}
