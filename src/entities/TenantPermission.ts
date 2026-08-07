import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// Entitlement table — which permissions/modules a tenant has purchased,
// set by a super admin. A role's effective permissions are always
// intersected against this set (see permissions.util.ts).
@Entity('tenant_permissions')
@Index(['tenantId', 'permissionKey'], { unique: true })
export class TenantPermission extends BaseEntity {
  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column({ name: 'permission_key' })
  permissionKey!: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}
