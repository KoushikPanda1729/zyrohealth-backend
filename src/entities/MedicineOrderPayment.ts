import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum MedicineOrderPaymentGateway {
  STRIPE = 'stripe',
  RAZORPAY = 'razorpay',
}

export enum MedicineOrderPaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

// Mirrors Payment.ts (Booking payments) — not reused directly because that
// entity has a unique booking_id column; a medicine order needs its own
// unique order_id instead.
@Entity('medicine_order_payments')
export class MedicineOrderPayment extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column({ name: 'order_id' })
  @Index({ unique: true })
  orderId!: string;

  @Column({
    type: 'enum',
    enum: MedicineOrderPaymentGateway,
    default: MedicineOrderPaymentGateway.STRIPE,
  })
  gateway!: MedicineOrderPaymentGateway;

  @Column({
    type: 'enum',
    enum: MedicineOrderPaymentStatus,
    default: MedicineOrderPaymentStatus.PENDING,
  })
  status!: MedicineOrderPaymentStatus;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  @Column({ name: 'currency', default: 'inr' })
  currency!: string;

  @Column({ name: 'payment_intent_id', nullable: true })
  @Index()
  paymentIntentId?: string;

  @Column({ name: 'payment_method_id', nullable: true })
  paymentMethodId?: string;

  @Column({ name: 'refund_id', nullable: true })
  refundId?: string;

  @Column({ name: 'refund_amount_cents', type: 'int', nullable: true })
  refundAmountCents?: number;

  @Column({ name: 'gateway_response', type: 'jsonb', nullable: true })
  gatewayResponse?: Record<string, unknown>;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date;

  @Column({ name: 'refunded_at', type: 'timestamptz', nullable: true })
  refundedAt?: Date;
}
