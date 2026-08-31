import { injectable, inject } from 'tsyringe';
import { In } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import { MedicineOrderPaymentMethod } from '../../entities/MedicineOrder';
import { browseMedicineCatalog, CatalogListingItem } from '../medicine-shops/catalog-search.util';
import { createDirectCatalogOrder } from '../medicine-shops/medicine-order.util';
import { MedicineShopAlertsService } from '../medicine-shops/medicine-shop-alerts.service';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { STORAGE_PROVIDER } from '../../config/di-tokens';
import { AppError } from '../../utils/app-error';

export interface PlaceCatalogOrderInput {
  items: { catalogItemId: string; quantity: number }[];
  deliveryAddressLine1: string;
  deliveryAddressLine2?: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPincode: string;
  deliveryPhone: string;
}

// Real e-commerce-style browse/search + checkout, for the web/mobile
// "Medicines" listing page — a stateless REST counterpart to the WhatsApp/
// chat "Search Medicine" flow (executeSearchMedicine's flowVariables-based
// cart), since a normal catalog page keeps its cart as ordinary client-side
// React/Flutter state instead of a server-side conversation session. Both
// end up creating the exact same MedicineOrder via createDirectCatalogOrder.
@injectable()
export class PatientCatalogService {
  constructor(
    private readonly shopAlerts: MedicineShopAlertsService,
    @inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  async browse(
    tenantId: string,
    params: { query?: string; page?: number; limit?: number },
  ): Promise<{ items: CatalogListingItem[]; total: number; page: number; limit: number }> {
    const result = await browseMedicineCatalog(tenantId, params);
    // Product photos live in a private bucket — sign fresh on every read
    // (same pattern patient-flow.controller.ts uses for prescription
    // photos) rather than making the bucket public.
    const items = await Promise.all(
      result.items.map(async (item) => ({
        ...item,
        imageUrls: await Promise.all(
          item.imageUrls.map(async (url) => {
            try {
              const key = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
              return await this.storage.getSignedUrl(key, 3600);
            } catch {
              return url;
            }
          }),
        ),
      })),
    );
    return { ...result, items };
  }

  async placeOrder(
    patientId: string,
    tenantId: string,
    input: PlaceCatalogOrderInput,
  ): Promise<{ orderId: string; totalCents: number }> {
    if (input.items.length === 0) {
      throw AppError.badRequest('Your order is empty');
    }

    const catalogItems = await AppDataSource.getRepository(MedicineShopCatalogItem).find({
      where: { id: In(input.items.map((i) => i.catalogItemId)), tenantId, isActive: true },
    });
    const itemsById = new Map(catalogItems.map((i) => [i.id, i]));

    const shopIds = new Set<string>();
    const orderItems: { catalogItemId: string; name: string; quantity: number; unitPriceCents: number }[] = [];
    for (const requested of input.items) {
      const catalogItem = itemsById.get(requested.catalogItemId);
      if (!catalogItem) {
        throw AppError.badRequest(`One of the items in your order is no longer available`);
      }
      if (requested.quantity < 1) {
        throw AppError.badRequest(`Invalid quantity for ${catalogItem.name}`);
      }
      if (catalogItem.quantity < requested.quantity) {
        throw AppError.badRequest(`Only ${catalogItem.quantity} ${catalogItem.unit}(s) of ${catalogItem.name} left in stock`);
      }
      shopIds.add(catalogItem.shopId);
      orderItems.push({
        catalogItemId: catalogItem.id,
        name: catalogItem.name,
        quantity: requested.quantity,
        unitPriceCents: catalogItem.priceCents,
      });
    }

    // Same single-shop-per-order rule the chat cart enforces — MedicineOrder
    // has one shopId field, not a list.
    if (shopIds.size > 1) {
      throw AppError.badRequest(
        'All items in one order must be from the same shop — place separate orders for items from different shops',
      );
    }
    const [shopId] = shopIds;

    const order = await createDirectCatalogOrder({
      tenantId,
      patientId,
      shopId,
      items: orderItems,
      deliveryAddressLine1: input.deliveryAddressLine1,
      deliveryAddressLine2: input.deliveryAddressLine2,
      deliveryCity: input.deliveryCity,
      deliveryState: input.deliveryState,
      deliveryPincode: input.deliveryPincode,
      deliveryPhone: input.deliveryPhone,
      paymentMethod: MedicineOrderPaymentMethod.COD,
      shopAlerts: this.shopAlerts,
      sourceNote: 'Ordered directly from shop catalog via the Medicines page',
    });

    return { orderId: order.id, totalCents: order.totalCents };
  }
}
