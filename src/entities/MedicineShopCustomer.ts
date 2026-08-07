import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// A shop's own record of a regular/known customer — separate from the
// platform's patient accounts (this is a walk-in counter customer, who
// may not have any HealthPlus account at all). `outstandingDueCents` is a
// denormalized running total, kept in sync by billing.util.ts whenever a
// credit sale or a settlement payment is recorded — see
// MedicineShopCustomerLedgerEntry for the append-only audit trail behind it.
@Entity('medicine_shop_customers')
export class MedicineShopCustomer extends BaseEntity {
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
  address?: string;

  @Column({ name: 'outstanding_due_cents', default: 0 })
  outstandingDueCents!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
