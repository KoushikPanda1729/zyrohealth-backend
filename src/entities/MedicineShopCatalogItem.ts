import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// A shop-maintained price list + stock ledger for medicines it carries —
// lets a shop quote faster (reference their own standing prices/stock),
// track where something physically sits on their shelves (rackLocation),
// and gives a tenant admin a quick reference when entering a manual quote
// on the shop's behalf. Independent of any specific
// PrescriptionUploadRequest/MedicineShopQuote.
@Entity('medicine_shop_catalog_items')
export class MedicineShopCatalogItem extends BaseEntity {
  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column()
  name!: string;

  @Column({ name: 'price_cents' })
  priceCents!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  // ── Inventory fields ─────────────────────────────────────────────────
  @Column({ default: 0 })
  quantity!: number;

  @Column({ default: 'unit' })
  unit!: string;

  @Column({ name: 'rack_location', type: 'varchar', nullable: true })
  rackLocation?: string | null;

  @Column({ name: 'batch_number', type: 'varchar', nullable: true })
  batchNumber?: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate?: string | null;

  @Column({ type: 'varchar', nullable: true })
  manufacturer?: string | null;

  // Product photos — shown on the patient-facing catalog (health-frontend's
  // Medicines page, health-mobile's equivalent) so a listing isn't just
  // bare text. First entry is the "primary" image wherever only one is
  // shown (a listing card); order otherwise has no other meaning.
  @Column({ name: 'image_urls', type: 'jsonb', default: '[]' })
  imageUrls!: string[];

  @Column({ type: 'varchar', nullable: true })
  sku?: string | null;

  @Column({ name: 'low_stock_threshold', type: 'integer', nullable: true })
  lowStockThreshold?: number | null;

  // Which of this shop's own suppliers (MedicineShopSupplier) normally
  // stocks this medicine — lets a low-stock reorder be split into one
  // purchase order per supplier automatically instead of the shop having
  // to sort that out by hand every time (see purchase-order.util.ts's
  // createPurchaseOrdersFromLowStock). Optional: plenty of shops won't
  // bother tagging every item and can still create POs manually.
  @Column({ name: 'preferred_supplier_id', type: 'varchar', nullable: true })
  preferredSupplierId?: string | null;

  // Dedup guards for the daily alert job (medicine-shop-alerts.service.ts)
  // so a shop that never restocks/acknowledges doesn't get the same
  // warning every single day — each fires at most once per cooldown window.
  @Column({ name: 'last_expiry_alert_at', type: 'timestamptz', nullable: true })
  lastExpiryAlertAt?: Date | null;

  @Column({ name: 'last_low_stock_alert_at', type: 'timestamptz', nullable: true })
  lastLowStockAlertAt?: Date | null;

  // ── Billing/compliance fields ────────────────────────────────────────
  // India GST slab applied at counter-sale time (billing.util.ts) —
  // defaults to 12%, the common slab for most formulations; a shop can
  // override per medicine (e.g. 5% for some essential drugs, 18% for
  // others) since this platform has no authoritative drug/HSN-code lookup.
  @Column({ name: 'gst_rate_percent', type: 'integer', default: 12 })
  gstRatePercent!: number;

  // Schedule H1 (India) drugs require a compliance register entry (patient
  // + prescribing doctor) at time of sale — see billing.util.ts's
  // controlled-drug validation. Off by default; a shop opts a medicine
  // into this, there's no authoritative drug-schedule database here either.
  @Column({ name: 'is_controlled_drug', default: false })
  isControlledDrug!: boolean;

  // Optional pack-size conversion — e.g. packSize=10, packUnit='strip',
  // subUnit='tablet' means one strip contains 10 loose tablets. `unit`
  // above stays the shop's primary stock-counting unit (usually the pack);
  // this only matters when billing.util.ts needs to sell in the sub-unit
  // (a customer wants 3 loose tablets, not a whole strip).
  @Column({ name: 'pack_size', type: 'integer', nullable: true })
  packSize?: number | null;

  @Column({ name: 'sub_unit', type: 'varchar', nullable: true })
  subUnit?: string | null;
}
