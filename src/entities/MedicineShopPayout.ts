import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum MedicineShopPayoutStatus {
  OWED = 'owed',
  SETTLED = 'settled',
}

// A reconciliation ledger, not a real payment rail — there is no Stripe
// Connect/Razorpay Route in this codebase (one platform-wide Stripe
// account), so a patient's payment always lands with the platform first.
// One row per paid MedicineOrder; 'settled' just records that the platform
// paid the shop back outside the app (bank transfer/UPI), it does not move
// any money itself.
@Entity('medicine_shop_payouts')
export class MedicineShopPayout extends BaseEntity {
  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column({ name: 'order_id' })
  @Index({ unique: true })
  orderId!: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  @Column({
    type: 'enum',
    enum: MedicineShopPayoutStatus,
    default: MedicineShopPayoutStatus.OWED,
  })
  @Index()
  status!: MedicineShopPayoutStatus;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt?: Date;

  @Column({ name: 'settled_by_user_id', nullable: true })
  settledByUserId?: string;

  @Column({ nullable: true })
  note?: string;
}
