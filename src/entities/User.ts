import { Entity, Column, OneToOne, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { PatientProfile } from './PatientProfile';
import { DoctorProfile } from './DoctorProfile';

export enum UserRole {
  PATIENT = 'patient',
  DOCTOR = 'doctor',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
  SHOP = 'shop',
  // A lighter platform-level tier — can view every tenant/medicine shop
  // across the platform (for support/troubleshooting) but can't create,
  // edit, deactivate, impersonate, or invite anything. See
  // platform.routes.ts's read/write split.
  PLATFORM_SUPPORT = 'platform_support',
}

// Only meaningful when role === SHOP — a shop's first login is always
// 'owner'; anyone that owner later invites (see staff.util.ts) is
// 'cashier', a lighter tier that can bill at the counter but can't touch
// catalog data, suppliers/purchase orders, financial reports, or invite
// more staff. See requireShopOwner in attachRole.middleware.ts's consumers.
export enum ShopStaffRole {
  OWNER = 'owner',
  CASHIER = 'cashier',
}

@Entity('users')
export class User extends BaseEntity {
  @Column({ name: 'firebase_uid', unique: true })
  @Index()
  firebaseUid!: string;

  @Column({ nullable: true, name: 'phone_number' })
  phoneNumber?: string;

  @Column({ nullable: true, unique: true })
  email?: string;

  @Column({ name: 'password_hash', nullable: true, select: false })
  passwordHash?: string;

  @Column({ nullable: true, name: 'full_name' })
  fullName?: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.PATIENT })
  role!: UserRole;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'can_create_agent', default: false })
  canCreateAgent!: boolean;

  @Column({ type: 'varchar', nullable: true, name: 'avatar_url' })
  avatarUrl?: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  // Null only for super_admin (a platform-level, tenant-less user).
  @Column({ type: 'varchar', nullable: true, name: 'tenant_id' })
  @Index()
  tenantId?: string | null;

  // Fine-grained role for admin-type staff (which custom Role within their
  // tenant they hold). Unused by patient/doctor — their access is
  // ownership-based, not permission-based.
  @Column({ type: 'varchar', nullable: true, name: 'role_id' })
  @Index()
  roleId?: string | null;

  // Organizational grouping for admin-type staff (e.g. "Finance",
  // "Support") — a label, not a permission boundary.
  @Column({ type: 'varchar', nullable: true, name: 'department_id' })
  @Index()
  departmentId?: string | null;

  // Which MedicineShop this user logs in as, for role=shop only. A shop
  // user can only ever see data tied to their own shopId; within that
  // shop, the owner has full access and non-owner staff are gated by
  // their assigned shopRoleId (see MedicineShopRole).
  @Column({ type: 'varchar', nullable: true, name: 'shop_id' })
  @Index()
  shopId?: string | null;

  @Column({ type: 'enum', enum: ShopStaffRole, nullable: true, name: 'shop_staff_role' })
  shopStaffRole?: ShopStaffRole | null;

  // Which MedicineShopRole this shop staff member holds, for non-owner
  // shop staff only — the owner always bypasses this (see
  // attachRole.middleware.ts) since shopStaffRole === 'owner' already
  // grants everything. A cashier with no custom role assigned yet falls
  // back to the shop's auto-seeded default "Cashier" role.
  @Column({ type: 'varchar', nullable: true, name: 'shop_role_id' })
  @Index()
  shopRoleId?: string | null;

  @OneToOne(() => PatientProfile, (profile) => profile.user, {
    cascade: true,
    nullable: true,
  })
  patientProfile?: PatientProfile;

  @OneToOne(() => DoctorProfile, (profile) => profile.user, {
    cascade: true,
    nullable: true,
  })
  doctorProfile?: DoctorProfile;
}
