import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// A shop's own list of distributors/suppliers it buys stock from — kept
// separate from MedicineShop (which is the platform's record of a shop as
// a quoting vendor to patients) since these are two unrelated directions:
// MedicineShop is who a shop sells TO, MedicineShopSupplier is who a shop
// buys FROM. Used by MedicineShopPurchaseOrder.
@Entity('medicine_shop_suppliers')
export class MedicineShopSupplier extends BaseEntity {
  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
