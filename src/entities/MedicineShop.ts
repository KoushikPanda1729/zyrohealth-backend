import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum MedicineShopOwnershipType {
  THIRD_PARTY = 'third_party',
  IN_HOUSE = 'in_house',
}

// A pharmacy/medicine shop a tenant onboards as a quoting vendor for
// patient-uploaded prescriptions. `whatsappLinked` flips true once the
// shop's own WhatsApp number messages the tenant's bot for the first time
// (see the join-handshake in whatsapp-bot.service.ts) — WhatsApp's 24-hour
// session rule means the platform can't message them first without a
// pre-approved template, so a shop must open the conversation themselves
// before any quote-request notifications can reach them there.
//
// `ownershipType` distinguishes a tenant's OWN in-house pharmacy (they run
// it themselves) from a third-party vendor pharmacy they've merely
// onboarded to quote prescriptions — purely informational today (labeling/
// filtering), doesn't change the quoting/auto-mode mechanics.
@Entity('medicine_shops')
export class MedicineShop extends BaseEntity {
  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column()
  name!: string;

  @Column({ name: 'contact_phone' })
  @Index()
  contactPhone!: string;

  @Column({ name: 'contact_email', nullable: true })
  contactEmail?: string;

  @Column({ name: 'address_line1', nullable: true })
  addressLine1?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'whatsapp_linked', default: false })
  whatsappLinked!: boolean;

  @Column({ name: 'whatsapp_linked_at', type: 'timestamptz', nullable: true })
  whatsappLinkedAt?: Date;

  @Column({
    name: 'ownership_type',
    type: 'enum',
    enum: MedicineShopOwnershipType,
    default: MedicineShopOwnershipType.THIRD_PARTY,
  })
  ownershipType!: MedicineShopOwnershipType;
}
