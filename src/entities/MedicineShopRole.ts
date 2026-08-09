import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// A shop-scoped custom role (distinct from the tenant-side Role entity —
// a shop's own staffing structure is defined by its owner, not the
// tenant admin). The owner never needs a row here: ownership is
// identified by User.shopStaffRole === 'owner' and always bypasses
// permission checks entirely (see attachRole.middleware.ts), same as
// super_admin. isSystem marks the auto-seeded default "Cashier" role
// created for every shop at onboarding — kept undeletable so a shop
// never ends up with zero assignable non-owner role.
@Entity('medicine_shop_roles')
export class MedicineShopRole extends BaseEntity {
  @Column({ name: 'shop_id' })
  @Index()
  shopId!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;
}
