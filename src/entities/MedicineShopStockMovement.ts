import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum StockMovementReason {
  INITIAL = 'initial',
  CORRECTION = 'correction',
  RESTOCK = 'restock',
  SALE = 'sale',
  RETURN = 'return',
  DAMAGE = 'damage',
}

// A simple append-only ledger of quantity changes on a catalog item — lets
// a shop reconcile "why did my count drop" instead of a quantity edit
// silently overwriting the previous number with no trace.
@Entity('medicine_shop_stock_movements')
export class MedicineShopStockMovement extends BaseEntity {
  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ name: 'catalog_item_id' })
  @Index()
  catalogItemId!: string;

  @Column({ name: 'item_name' })
  itemName!: string;

  // Positive = stock added, negative = stock removed.
  @Column()
  delta!: number;

  @Column({ name: 'quantity_after' })
  quantityAfter!: number;

  @Column({ type: 'enum', enum: StockMovementReason })
  reason!: StockMovementReason;

  @Column({ type: 'varchar', nullable: true })
  note?: string | null;
}
