import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// A hospital a tenant onboards into its directory — patients browse this
// across every tenant (see modules/hospitals's public routes, same
// cross-tenant precedent as doctors/pharmacy), and can request an
// ambulance FROM one (AmbulanceRequest.hospitalId), which is what
// attributes that request to a tenant.
@Entity('hospitals')
export class Hospital extends BaseEntity {
  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column()
  name!: string;

  @Column({ name: 'contact_phone' })
  contactPhone!: string;

  @Column({ name: 'address_line1', nullable: true })
  addressLine1?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ type: 'double precision', nullable: true })
  latitude?: number;

  @Column({ type: 'double precision', nullable: true })
  longitude?: number;

  @Column({ type: 'text', array: true, default: '{}' })
  specialties!: string[];

  @Column({ name: 'emergency_services_available', default: true })
  emergencyServicesAvailable!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
