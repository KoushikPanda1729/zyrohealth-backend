import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('otp_codes')
export class OtpCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'phone_number' })
  phoneNumber!: string;

  @Column({ name: 'code', length: 6 })
  code!: string;

  @Column({ name: 'expires_at' })
  expiresAt!: Date;

  @Column({ name: 'verified', default: false })
  verified!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
