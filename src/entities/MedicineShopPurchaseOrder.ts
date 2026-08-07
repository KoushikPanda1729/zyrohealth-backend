import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum PurchaseOrderStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
}

export interface PurchaseOrderLineItem {
  catalogItemId?: string;
  name: string;
  quantity: number;
  unit: string;
  // Set here so receiving a PO can create a real batch record (see
  // MedicineShopCatalogItemBatch) instead of just bumping a flat quantity.
  batchNumber?: string;
  expiryDate?: string;
}

// A shop's request to restock from one of its own suppliers — created
// from the low-stock alert's reorder suggestion (see
// medicine-shop-alerts.service.ts), sent as a WhatsApp deep-link the shop
// owner taps to send from their OWN phone number (not the platform's
// WhatsApp Business API — a supplier who's never messaged the platform
// can't be reached by the API directly, see purchase-order.util.ts for
// why), and marked received once stock physically arrives — which is what
// actually restocks the catalog item and creates its batch entry.
@Entity('medicine_shop_purchase_orders')
export class MedicineShopPurchaseOrder extends BaseEntity {
  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ name: 'supplier_id', type: 'varchar', nullable: true })
  supplierId?: string | null;

  @Column({
    type: 'enum',
    enum: PurchaseOrderStatus,
    default: PurchaseOrderStatus.DRAFT,
  })
  status!: PurchaseOrderStatus;

  @Column({ type: 'jsonb', default: '[]' })
  items!: PurchaseOrderLineItem[];

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt?: Date | null;

  @Column({ name: 'received_at', type: 'timestamptz', nullable: true })
  receivedAt?: Date | null;
}
