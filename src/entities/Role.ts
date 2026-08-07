import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// tenantId = null means a platform-level template role (e.g. the seeded
// "Super Admin" role). Non-null means one tenant's own custom role, built
// from a subset of that tenant's entitled permissions.
@Entity('roles')
export class Role extends BaseEntity {
  @Column({ type: 'varchar', nullable: true, name: 'tenant_id' })
  @Index()
  tenantId?: string | null;

  @Column()
  name!: string;

  // System roles (the auto-seeded default "Admin" role per tenant, and the
  // global "Super Admin" template) can't be deleted.
  @Column({ name: 'is_system', default: false })
  isSystem!: boolean;

  @Column({ nullable: true })
  description?: string;
}
