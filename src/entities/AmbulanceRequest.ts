import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// No real-time dispatch/GPS tracking exists here (out of scope — that's a
// safety-critical system of its own) — this just records the request and
// lets the hospital's own tenant admin acknowledge/resolve it, while the
// mobile app also offers a direct phone call to the hospital as the real
// fallback (see health-mobile's ambulance feature).
export enum AmbulanceRequestStatus {
  REQUESTED = 'requested',
  ACKNOWLEDGED = 'acknowledged',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('ambulance_requests')
export class AmbulanceRequest extends BaseEntity {
  // Derived from the chosen hospital's own tenant at creation time — same
  // "belongs to whoever fulfills it" precedent as bookings/medicine orders.
  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ name: 'hospital_id' })
  @Index()
  hospitalId!: string;

  @Column({ name: 'patient_id' })
  @Index()
  patientId!: string;

  @Column({ name: 'pickup_address' })
  pickupAddress!: string;

  @Column({ name: 'pickup_latitude', type: 'double precision', nullable: true })
  pickupLatitude?: number;

  @Column({ name: 'pickup_longitude', type: 'double precision', nullable: true })
  pickupLongitude?: number;

  @Column({ name: 'contact_phone' })
  contactPhone!: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({
    type: 'enum',
    enum: AmbulanceRequestStatus,
    default: AmbulanceRequestStatus.REQUESTED,
  })
  status!: AmbulanceRequestStatus;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes?: string;

  @Column({ name: 'cancel_reason', nullable: true })
  cancelReason?: string;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date;
}
