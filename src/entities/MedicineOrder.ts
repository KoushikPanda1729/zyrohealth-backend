import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum MedicineOrderStatus {
  PLACED = 'placed',
  CONFIRMED = 'confirmed',
  PACKED = 'packed',
  PICKED_UP = 'picked_up',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

// Separate from MedicineOrderStatus (delivery lifecycle) — this tracks the
// Stripe Checkout session created for the order (see
// MedicineOrderPaymentsService). 'unpaid' is the state before a checkout
// session even exists; an order created directly (not via the WhatsApp
// prescription-quote flow) stays 'unpaid' indefinitely and is unaffected.
export enum MedicineOrderPaymentStatus {
  UNPAID = 'unpaid',
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

// Chosen by the patient in the prescription-quote flow (see
// whatsapp-flow-engine.service.ts's executeOrderPayment) before an order is
// created — cash orders never get a Stripe checkout session at all.
export enum MedicineOrderPaymentMethod {
  ONLINE = 'online',
  COD = 'cod',
}

export interface OrderedMedicineItem {
  name: string;
  genericName?: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface MedicineOrderStatusEvent {
  status: MedicineOrderStatus;
  at: string;
  byUserId?: string;
  note?: string;
}

@Entity('medicine_orders')
export class MedicineOrder extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column({ name: 'patient_id' })
  @Index()
  patientId!: string;

  @Column({ name: 'doctor_id', nullable: true })
  @Index()
  doctorId?: string;

  @Column({ name: 'prescription_id', nullable: true })
  @Index()
  prescriptionId?: string;

  // Set only when the order came from the WhatsApp prescription-quote
  // marketplace (see whatsapp-bot.service.ts#createOrderFromQuote) — an
  // order placed some other way leaves these unset.
  @Column({ name: 'shop_id', nullable: true })
  @Index()
  shopId?: string;

  @Column({ name: 'request_id', nullable: true })
  @Index()
  requestId?: string;

  @Column({ name: 'quote_id', nullable: true })
  @Index()
  quoteId?: string;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: MedicineOrderPaymentStatus,
    default: MedicineOrderPaymentStatus.UNPAID,
  })
  paymentStatus!: MedicineOrderPaymentStatus;

  // Nullable — orders placed before this existed, or through a path that
  // never asks, have no recorded method.
  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: MedicineOrderPaymentMethod,
    nullable: true,
  })
  paymentMethod?: MedicineOrderPaymentMethod;

  // Stamped by the tenant admin's "Notify Shop to Deliver" action — gates
  // what a shop can see via GET /api/shop/orders (see shop.service.ts).
  @Column({ name: 'shop_notified_at', type: 'timestamptz', nullable: true })
  shopNotifiedAt?: Date;

  @Column({ type: 'jsonb', default: '[]' })
  items!: OrderedMedicineItem[];

  @Column({ name: 'total_cents', type: 'int' })
  totalCents!: number;

  @Column({
    type: 'enum',
    enum: MedicineOrderStatus,
    default: MedicineOrderStatus.PLACED,
  })
  status!: MedicineOrderStatus;

  @Column({ name: 'delivery_address_line1' })
  deliveryAddressLine1!: string;

  @Column({ name: 'delivery_address_line2', nullable: true })
  deliveryAddressLine2?: string;

  @Column({ name: 'delivery_city' })
  deliveryCity!: string;

  @Column({ name: 'delivery_state' })
  deliveryState!: string;

  @Column({ name: 'delivery_pincode' })
  deliveryPincode!: string;

  @Column({ name: 'delivery_phone' })
  deliveryPhone!: string;

  @Column({ name: 'cancel_reason', nullable: true })
  cancelReason?: string;

  @Column({ name: 'cancelled_by', nullable: true })
  cancelledBy?: string;

  @Column({ name: 'status_history', type: 'jsonb', default: '[]' })
  statusHistory!: MedicineOrderStatusEvent[];

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes?: string;
}
