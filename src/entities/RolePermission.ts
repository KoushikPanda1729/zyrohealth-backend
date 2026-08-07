import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

@Entity('role_permissions')
@Index(['roleId', 'permissionKey'], { unique: true })
export class RolePermission extends BaseEntity {
  @Column({ name: 'role_id' })
  @Index()
  roleId!: string;

  @Column({ name: 'permission_key' })
  permissionKey!: string;
}
