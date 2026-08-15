import { Entity, Column, OneToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { Booking } from './Booking';

export enum PaymentGateway {
  STRIPE = 'stripe',
  RAZORPAY = 'razorpay',
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity('payments')
export class Payment extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column({ name: 'booking_id' })
  @Index()
  bookingId!: string;

  @OneToOne(() => Booking, (b) => b.payment)
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({
    type: 'enum',
    enum: PaymentGateway,
    default: PaymentGateway.STRIPE,
  })
  gateway!: PaymentGateway;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status!: PaymentStatus;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  @Column({ name: 'currency', default: 'usd' })
  currency!: string;

  @Column({ name: 'payment_intent_id', nullable: true })
  @Index()
  paymentIntentId?: string;

  @Column({ name: 'payment_method_id', nullable: true })
  paymentMethodId?: string;

  // Which success/cancel redirect the Stripe Checkout Session behind
  // paymentMethodId was built with ('web' or 'app' — see
  // utils/payment-redirect.util.ts). Stripe sessions are immutable once
  // created, so a cached session can only be reused if this still matches
  // the platform being requested now — otherwise a patient retrying from a
  // different channel than last time would get bounced to the wrong URL.
  @Column({ name: 'redirect_platform', nullable: true })
  redirectPlatform?: string;

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
