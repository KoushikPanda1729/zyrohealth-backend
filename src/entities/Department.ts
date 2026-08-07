import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// A simple organizational grouping for a tenant's own staff (e.g.
// "Finance", "Support") — purely a label for filtering/organizing, not a
// permission boundary. That's what Role/RolePermission are for.
@Entity('departments')
export class Department extends BaseEntity {
  @Column({ name: 'tenant_id' })
  @Index()
  tenantId!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;
}
