import { AppDataSource } from '../../config/database';
import { MedicineShopCatalogItemBatch } from '../../entities/MedicineShopCatalogItemBatch';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import { saveCatalogItemWithLedger } from './catalog.util';
import { StockMovementReason } from '../../entities/MedicineShopStockMovement';
import { AppError } from '../../utils/app-error';

export interface BatchInput {
  batchNumber?: string | null;
  expiryDate?: string | null;
  quantity: number;
}

export async function listBatches(
  shopId: string,
  catalogItemId: string,
): Promise<MedicineShopCatalogItemBatch[]> {
  const item = await AppDataSource.getRepository(MedicineShopCatalogItem).findOne({
    where: { id: catalogItemId, shopId },
  });
  if (!item) throw AppError.notFound('Catalog item');
  return AppDataSource.getRepository(MedicineShopCatalogItemBatch).find({
    where: { shopId, catalogItemId },
    order: { expiryDate: 'ASC' },
  });
}

// Recording a batch is additive stock — it also bumps the parent catalog
// item's total quantity (through the same ledger every other restock path
// uses) so the two stay in sync; see MedicineShopCatalogItemBatch's doc
// comment for why the parent quantity, not FEFO-per-batch, remains what
// order fulfillment actually decrements.
export async function addBatch(
  shopId: string,
  tenantId: string,
  catalogItemId: string,
  data: BatchInput,
): Promise<MedicineShopCatalogItemBatch> {
  if (!data.quantity || data.quantity <= 0) {
    throw AppError.badRequest('quantity must be greater than 0');
  }
  const itemRepo = AppDataSource.getRepository(MedicineShopCatalogItem);
  const item = await itemRepo.findOne({ where: { id: catalogItemId, shopId } });
  if (!item) throw AppError.notFound('Catalog item');

  const batchRepo = AppDataSource.getRepository(MedicineShopCatalogItemBatch);
  const batch = await batchRepo.save(
    batchRepo.create({
      catalogItemId,
      shopId,
      tenantId,
      batchNumber: data.batchNumber ?? undefined,
      expiryDate: data.expiryDate ?? undefined,
      quantity: data.quantity,
    }),
  );

  const previousQuantity = item.quantity;
  item.quantity = previousQuantity + data.quantity;
  await saveCatalogItemWithLedger(
    item,
    previousQuantity,
    StockMovementReason.RESTOCK,
    `Batch ${data.batchNumber ?? '—'} added`,
  );

  return batch;
}

// Deleting a batch record only removes the bookkeeping entry (e.g. a
// mis-entered batch number) — it deliberately does NOT reverse the parent
// item's quantity, since by the time someone notices a bad batch entry
// some of that stock may already have been sold. Use the catalog item's
// own quantity-correction path (shop.service.ts's update endpoint) for that.
export async function deleteBatch(shopId: string, batchId: string): Promise<void> {
  const repo = AppDataSource.getRepository(MedicineShopCatalogItemBatch);
  const result = await repo.delete({ id: batchId, shopId });
  if (!result.affected) throw AppError.notFound('Batch');
}
