import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

// Global, platform-defined permission catalog. Seeded once via migration;
// not user-editable — tenants/roles only ever reference these keys.
@Entity('permissions')
export class Permission extends BaseEntity {
  @Column({ unique: true })
  @Index()
  key!: string;

  @Column()
  module!: string;

  @Column()
  description!: string;
}
