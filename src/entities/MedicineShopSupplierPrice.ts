import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// What one of the shop's own suppliers (MedicineShopSupplier) quotes for a
// given catalog item — the shop's BUYING-side price, distinct from
// priceCents on MedicineShopCatalogItem (which is what the shop sells it
// FOR). Lets a shop compare quotes across suppliers before creating a
// purchase order instead of remembering/guessing who's cheapest.
@Entity('medicine_shop_supplier_prices')
@Unique(['supplierId', 'catalogItemId'])
export class MedicineShopSupplierPrice extends BaseEntity {
  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'supplier_id' })
  @Index()
  supplierId!: string;

  @Column({ name: 'catalog_item_id' })
  @Index()
  catalogItemId!: string;

  @Column({ name: 'price_cents' })
  priceCents!: number;
}
