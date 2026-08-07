import { AppDataSource } from '../../config/database';
import { MedicineShop } from '../../entities/MedicineShop';
import { MedicineShopSale } from '../../entities/MedicineShopSale';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import { AppError } from '../../utils/app-error';

// NOTE on scope: the original plan was to mine the platform's existing
// MedicineOrder (prescription-marketplace) history for this. On inspection,
// MedicineOrder has no shopId/shop link at all — there's no way to
// attribute a past marketplace order to the shop that fulfilled it. So
// this instead runs on MedicineShopSale (the counter-billing feature built
// alongside this) — real, per-shop, per-medicine sales history, but it
// only starts accumulating from when a shop begins using Billing. A brand
// new shop will legitimately get few/no suggestions at first — see the
// city-pooled fallback below for that cold-start case.

export type SuggestionBasis = 'own-recent-sales' | 'city-pooled' | 'seasonal-last-year';

export interface RestockSuggestion {
  medicineName: string;
  currentQuantity: number;
  recentDailyRunRate: number;
  daysOfStockLeft: number | null;
  suggestedReorderQuantity: number;
  basis: SuggestionBasis;
  confidence: 'low' | 'medium' | 'high';
}

const LOOKBACK_DAYS = 30;
const PROJECTION_DAYS = 30;
// Below this many total units sold in the lookback window, a shop's own
// data is too thin to trust — fall back to pooling nearby shops instead.
const MIN_OWN_UNITS_FOR_CONFIDENCE = 5;

async function quantitySoldByMedicine(shopId: string, since: Date): Promise<Map<string, number>> {
  const sales = await AppDataSource.getRepository(MedicineShopSale)
    .createQueryBuilder('sale')
    .where('sale.shop_id = :shopId', { shopId })
    .andWhere('sale.created_at >= :since', { since })
    .getMany();

  const totals = new Map<string, number>();
  for (const sale of sales) {
    for (const item of sale.items) {
      totals.set(item.name, (totals.get(item.name) ?? 0) + item.quantity);
    }
  }
  return totals;
}

export async function computeRestockSuggestions(shopId: string): Promise<RestockSuggestion[]> {
  const shop = await AppDataSource.getRepository(MedicineShop).findOne({ where: { id: shopId } });
  if (!shop) throw AppError.notFound('Medicine shop');

  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const oneYearAgo = new Date(since);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoEnd = new Date(oneYearAgo);
  oneYearAgoEnd.setDate(oneYearAgoEnd.getDate() + LOOKBACK_DAYS);

  const ownRecent = await quantitySoldByMedicine(shopId, since);
  const ownLastYear = await AppDataSource.getRepository(MedicineShopSale)
    .createQueryBuilder('sale')
    .where('sale.shop_id = :shopId', { shopId })
    .andWhere('sale.created_at BETWEEN :start AND :end', { start: oneYearAgo, end: oneYearAgoEnd })
    .getMany();
  const seasonalTotals = new Map<string, number>();
  for (const sale of ownLastYear) {
    for (const item of sale.items) {
      seasonalTotals.set(item.name, (seasonalTotals.get(item.name) ?? 0) + item.quantity);
    }
  }

  const totalOwnUnits = Array.from(ownRecent.values()).reduce((a, b) => a + b, 0);
  const needsPooling = totalOwnUnits < MIN_OWN_UNITS_FOR_CONFIDENCE && shop.city;

  let pooledTotals = new Map<string, number>();
  let pooledShopCount = 0;
  if (needsPooling) {
    const nearbyShops = await AppDataSource.getRepository(MedicineShop).find({
      where: { city: shop.city },
    });
    const otherShopIds = nearbyShops.map((s) => s.id).filter((id) => id !== shopId);
    pooledShopCount = otherShopIds.length;
    for (const otherId of otherShopIds) {
      const totals = await quantitySoldByMedicine(otherId, since);
      for (const [name, qty] of totals) {
        pooledTotals.set(name, (pooledTotals.get(name) ?? 0) + qty);
      }
    }
  }

  const catalogItems = await AppDataSource.getRepository(MedicineShopCatalogItem).find({
    where: { shopId, isActive: true },
  });

  const suggestions: RestockSuggestion[] = [];
  for (const item of catalogItems) {
    const ownQty = ownRecent.get(item.name) ?? 0;
    const seasonalQty = seasonalTotals.get(item.name) ?? 0;
    const pooledQty = pooledTotals.get(item.name) ?? 0;

    let projectedDemand: number;
    let basis: SuggestionBasis;
    let confidence: RestockSuggestion['confidence'];

    if (seasonalQty > 0 && seasonalQty > ownQty * 1.3) {
      // Same period last year sold meaningfully more than the current
      // run rate suggests — a real seasonal signal worth surfacing even
      // if this month's own sales look quiet so far.
      projectedDemand = seasonalQty;
      basis = 'seasonal-last-year';
      confidence = totalOwnUnits >= MIN_OWN_UNITS_FOR_CONFIDENCE ? 'medium' : 'low';
    } else if (ownQty > 0) {
      projectedDemand = Math.round((ownQty / LOOKBACK_DAYS) * PROJECTION_DAYS);
      basis = 'own-recent-sales';
      confidence = totalOwnUnits >= MIN_OWN_UNITS_FOR_CONFIDENCE ? 'high' : 'low';
    } else if (pooledQty > 0 && pooledShopCount > 0) {
      // Cold start — borrow the pattern from other shops in the same
      // city, scaled down since this shop hasn't proven it sells at the
      // same volume yet.
      projectedDemand = Math.round(((pooledQty / pooledShopCount) / LOOKBACK_DAYS) * PROJECTION_DAYS);
      basis = 'city-pooled';
      confidence = 'low';
    } else {
      continue; // no signal at all for this medicine — nothing to suggest
    }

    const dailyRunRate = ownQty > 0 ? ownQty / LOOKBACK_DAYS : projectedDemand / PROJECTION_DAYS;
    const daysOfStockLeft = dailyRunRate > 0 ? Math.round(item.quantity / dailyRunRate) : null;

    // Only worth surfacing if projected demand would outrun current stock
    // within the projection window — otherwise there's nothing to act on.
    if (item.quantity >= projectedDemand) continue;

    suggestions.push({
      medicineName: item.name,
      currentQuantity: item.quantity,
      recentDailyRunRate: Math.round(dailyRunRate * 10) / 10,
      daysOfStockLeft,
      suggestedReorderQuantity: Math.max(projectedDemand - item.quantity, 1),
      basis,
      confidence,
    });
  }

  return suggestions.sort((a, b) => (a.daysOfStockLeft ?? Infinity) - (b.daysOfStockLeft ?? Infinity));
}
