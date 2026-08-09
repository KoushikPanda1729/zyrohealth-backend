import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

@Entity('medicine_shop_role_permissions')
@Index(['roleId', 'permissionKey'], { unique: true })
export class MedicineShopRolePermission extends BaseEntity {
  @Column({ name: 'role_id' })
  @Index()
  roleId!: string;

  @Column({ name: 'permission_key' })
  permissionKey!: string;
}
