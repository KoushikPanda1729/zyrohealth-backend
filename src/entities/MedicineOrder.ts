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
