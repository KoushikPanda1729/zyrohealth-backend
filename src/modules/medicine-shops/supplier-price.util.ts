import { AppDataSource } from '../../config/database';
import { MedicineShopSupplierPrice } from '../../entities/MedicineShopSupplierPrice';
import { MedicineShopSupplier } from '../../entities/MedicineShopSupplier';
import { AppError } from '../../utils/app-error';

export interface SupplierQuote {
  supplierId: string;
  supplierName: string;
  priceCents: number;
}

// One supplier's quoted buying-price for one medicine — upserted (a
// supplier only ever has ONE current quote per medicine here, not a
// price history) since the goal is "who's cheapest right now," not a
// price-trend chart.
export async function setSupplierPrice(
  shopId: string,
  tenantId: string,
  supplierId: string,
  catalogItemId: string,
  priceCents: number,
): Promise<MedicineShopSupplierPrice> {
  if (!priceCents || priceCents <= 0) {
    throw AppError.badRequest('priceCents must be greater than 0');
  }
  const repo = AppDataSource.getRepository(MedicineShopSupplierPrice);
  const existing = await repo.findOne({ where: { shopId, supplierId, catalogItemId } });
  if (existing) {
    existing.priceCents = priceCents;
    return repo.save(existing);
  }
  return repo.save(repo.create({ shopId, tenantId, supplierId, catalogItemId, priceCents }));
}

export async function deleteSupplierPrice(shopId: string, priceId: string): Promise<void> {
  const result = await AppDataSource.getRepository(MedicineShopSupplierPrice).delete({
    id: priceId,
    shopId,
  });
  if (!result.affected) throw AppError.notFound('Supplier price');
}

// Every supplier's quote for one medicine, cheapest first — the actual
// "compare before you order" view. A supplier with no quote on file for
// this medicine simply doesn't appear (there's nothing to compare).
export async function compareSuppliersForItem(
  shopId: string,
  catalogItemId: string,
): Promise<SupplierQuote[]> {
  const prices = await AppDataSource.getRepository(MedicineShopSupplierPrice).find({
    where: { shopId, catalogItemId },
  });
  if (prices.length === 0) return [];

  const supplierRepo = AppDataSource.getRepository(MedicineShopSupplier);
  const quotes: SupplierQuote[] = [];
  for (const price of prices) {
    const supplier = await supplierRepo.findOne({ where: { id: price.supplierId, shopId } });
    if (!supplier) continue;
    quotes.push({ supplierId: supplier.id, supplierName: supplier.name, priceCents: price.priceCents });
  }
  return quotes.sort((a, b) => a.priceCents - b.priceCents);
}

export async function listSupplierPricesForShop(
  shopId: string,
): Promise<MedicineShopSupplierPrice[]> {
  return AppDataSource.getRepository(MedicineShopSupplierPrice).find({ where: { shopId } });
}
