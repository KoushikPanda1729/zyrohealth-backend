import { Entity, Column } from 'typeorm';
import { BaseEntity } from './BaseEntity';

@Entity('tenants')
export class Tenant extends BaseEntity {
  @Column()
  name!: string;

  @Column({ nullable: true, name: 'contact_email' })
  contactEmail?: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ nullable: true, name: 'deactivated_at' })
  deactivatedAt?: Date;

  // Tenant's own Twilio WhatsApp "from" number. Null falls back to the
  // global TWILIO_WHATSAPP_FROM_NUMBER env var, so the default tenant needs
  // zero reconfiguration.
  @Column({ nullable: true, name: 'whatsapp_from_number' })
  whatsappFromNumber?: string;

  // When true, a PrescriptionUploadRequest with all dispatched shops
  // responded auto-selects the lowest quote and sends the patient's
  // receipt immediately instead of waiting for a staff member to pick one.
  @Column({ name: 'medicine_order_auto_mode', default: false })
  medicineOrderAutoMode!: boolean;

  // True only for a tenant created via createStandaloneMedicineShop — a
  // real pharmacy business with no clinic behind it, whose only login is
  // its shop-role account (no admin, no doctors/bookings/patients). These
  // are hidden from the generic Tenants list (they'd just be confusing
  // noise there) and only ever managed from the Medicine Shops page.
  @Column({ name: 'is_standalone_medicine_shop', default: false })
  isStandaloneMedicineShop!: boolean;
}
