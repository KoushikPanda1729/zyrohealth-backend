import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// Additive, optional per-batch tracking on top of MedicineShopCatalogItem.
// The parent item's own `batchNumber`/`expiryDate`/`quantity` scalar
// fields remain the single-batch fast path (manual entry, bulk import,
// AI photo-scan all still write one batch's worth of info there,
// unchanged) — this table is for the case those scalars can't represent:
// the SAME medicine restocked with a different batch/expiry before the
// old batch sold out, which today silently overwrites/collides.
// Deliberately NOT wired into decrementStockForOrder's FEFO logic yet —
// the parent `quantity` stays the authoritative total for order
// fulfillment; this table only feeds expiry alerting and manual batch
// bookkeeping, to avoid touching the live order-decrement path.
@Entity('medicine_shop_catalog_item_batches')
export class MedicineShopCatalogItemBatch extends BaseEntity {
  @Column({ name: 'catalog_item_id' })
  @Index()
  catalogItemId!: string;

  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'batch_number', nullable: true })
  batchNumber?: string;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate?: string;

  @Column({ default: 0 })
  quantity!: number;

  @Column({ name: 'last_expiry_alert_at', type: 'timestamptz', nullable: true })
  lastExpiryAlertAt?: Date | null;
}
