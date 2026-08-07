import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum CustomerLedgerEntryType {
  SALE = 'sale',
  PAYMENT = 'payment',
}

// Append-only ledger behind MedicineShopCustomer.outstandingDueCents —
// same pattern as MedicineShopStockMovement backing a catalog item's
// quantity. A SALE entry (positive amount) records a credit sale adding
// to what's owed; a PAYMENT entry (negative amount) records the customer
// settling some/all of it later. `balanceAfterCents` lets the ledger be
// read on its own without recomputing a running sum.
@Entity('medicine_shop_customer_ledger_entries')
export class MedicineShopCustomerLedgerEntry extends BaseEntity {
  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'customer_id' })
  @Index()
  customerId!: string;

  @Column({ type: 'enum', enum: CustomerLedgerEntryType })
  type!: CustomerLedgerEntryType;

  // Positive = due increased (sale), negative = due decreased (payment).
  @Column({ name: 'amount_cents' })
  amountCents!: number;

  @Column({ name: 'balance_after_cents' })
  balanceAfterCents!: number;

  @Column({ name: 'sale_id', type: 'varchar', nullable: true })
  saleId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  note?: string | null;
}
