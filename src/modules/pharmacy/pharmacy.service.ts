import { injectable } from 'tsyringe';
import { In } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import { MedicineShop } from '../../entities/MedicineShop';

@injectable()
export class PharmacyService {
  // Public catalogue browse for direct patient purchase — independent of
  // the WhatsApp prescription-quote marketplace. Controlled (Schedule H1)
  // drugs are excluded entirely: selling those online with no prescription
  // gate isn't something this endpoint should ever do, see
  // MedicineShopCatalogItem.isControlledDrug.
  async listMedicines(filters: {
    search?: string;
    shopId?: string;
    page: number;
    limit: number;
  }): Promise<{
    data: (MedicineShopCatalogItem & { shopName?: string; shopCity?: string })[];
    total: number;
  }> {
    const qb = AppDataSource.getRepository(MedicineShopCatalogItem)
      .createQueryBuilder('item')
      .andWhere('item.is_active = true')
      .andWhere('item.is_controlled_drug = false')
      .andWhere('item.quantity > 0');

    if (filters.shopId) {
      qb.andWhere('item.shop_id = :shopId', { shopId: filters.shopId });
    }
    if (filters.search) {
      qb.andWhere('LOWER(item.name) LIKE :search', {
        search: `%${filters.search.toLowerCase()}%`,
      });
    }

    const [data, total] = await qb
      .orderBy('item.name', 'ASC')
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .getManyAndCount();

    return { data: await this.hydrateShopInfo(data), total };
  }

  // No relation from MedicineShopCatalogItem to MedicineShop — same batch
  // "hydrate" pattern used for doctors' tenant name / bookings' doctor
  // profile, so the patient sees which pharmacy sells each item.
  private async hydrateShopInfo<T extends { shopId: string }>(
    items: T[],
  ): Promise<(T & { shopName?: string; shopCity?: string })[]> {
    const shopIds = [...new Set(items.map((i) => i.shopId))];
    if (shopIds.length === 0) return items;
    const shops = await AppDataSource.getRepository(MedicineShop).findBy({
      id: In(shopIds),
    });
    const byId = new Map(shops.map((s) => [s.id, s]));
    return items.map((i) => ({
      ...i,
      shopName: byId.get(i.shopId)?.name,
      shopCity: byId.get(i.shopId)?.city,
    }));
  }
}
