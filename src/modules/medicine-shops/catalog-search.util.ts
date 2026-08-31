import { ILike, In } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import { MedicineShop } from '../../entities/MedicineShop';

export interface CatalogSearchMatch {
  catalogItemId: string;
  shopId: string;
  shopName: string;
  medicineName: string;
  priceCents: number;
  inStock: boolean;
}

// Backs the WhatsApp/app "Search Medicine" option (an alternative to
// prescription upload) — a simple substring match across every active shop
// under the tenant, no fuzzy/typo tolerance. Good enough for a patient
// typing a real medicine name; the AI response layer (see
// prescription-classify.util.ts's sibling, answerMedicineAvailabilityQuery)
// is what turns this raw list into a natural reply, not this function.
export async function searchMedicineCatalog(
  tenantId: string,
  query: string,
): Promise<CatalogSearchMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const items = await AppDataSource.getRepository(MedicineShopCatalogItem).find({
    where: { tenantId, isActive: true, name: ILike(`%${trimmed}%`) },
    take: 20,
    order: { quantity: 'DESC' },
  });
  if (items.length === 0) return [];

  const shopIds = [...new Set(items.map((i) => i.shopId))];
  const shops = await AppDataSource.getRepository(MedicineShop).find({
    where: { id: In(shopIds) },
  });
  const shopNameById = new Map(shops.map((s) => [s.id, s.name]));

  return items.map((item) => ({
    catalogItemId: item.id,
    shopId: item.shopId,
    shopName: shopNameById.get(item.shopId) ?? 'a nearby pharmacy',
    medicineName: item.name,
    priceCents: item.priceCents,
    inStock: item.quantity > 0,
  }));
}

export interface CatalogListingItem {
  catalogItemId: string;
  shopId: string;
  shopName: string;
  name: string;
  priceCents: number;
  quantity: number;
  unit: string;
  manufacturer?: string | null;
  // Raw (unsigned) storage URLs — the catalog-images bucket prefix is
  // private, so a caller serving these to a browser must sign them first
  // (see patient-catalog.service.ts#browse) rather than using them as-is.
  imageUrls: string[];
}

// Backs the patient-facing catalog browsing page (health-frontend's
// Medicines listing, health-mobile's equivalent) — a real e-commerce-style
// paginated list, as opposed to searchMedicineCatalog's few-best-matches
// shape built for feeding an AI reply. Empty query = browse everything.
export async function browseMedicineCatalog(
  tenantId: string,
  params: { query?: string; page?: number; limit?: number },
): Promise<{ items: CatalogListingItem[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(60, Math.max(1, params.limit ?? 24));
  const trimmed = (params.query ?? '').trim();

  const [items, total] = await AppDataSource.getRepository(MedicineShopCatalogItem).findAndCount({
    where: {
      tenantId,
      isActive: true,
      ...(trimmed ? { name: ILike(`%${trimmed}%`) } : {}),
    },
    order: { name: 'ASC' },
    skip: (page - 1) * limit,
    take: limit,
  });

  const shopIds = [...new Set(items.map((i) => i.shopId))];
  const shops = shopIds.length
    ? await AppDataSource.getRepository(MedicineShop).find({ where: { id: In(shopIds) } })
    : [];
  const shopNameById = new Map(shops.map((s) => [s.id, s.name]));

  return {
    items: items.map((item) => ({
      catalogItemId: item.id,
      shopId: item.shopId,
      shopName: shopNameById.get(item.shopId) ?? 'a nearby pharmacy',
      name: item.name,
      priceCents: item.priceCents,
      quantity: item.quantity,
      unit: item.unit,
      manufacturer: item.manufacturer,
      imageUrls: item.imageUrls ?? [],
    })),
    total,
    page,
    limit,
  };
}
