import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { DoctorProfile } from './DoctorProfile';

export enum DocumentType {
  MEDICAL_LICENSE = 'medical_license',
  DEGREE_CERTIFICATE = 'degree_certificate',
  ID_PROOF = 'id_proof',
  PROFILE_PHOTO = 'profile_photo',
  OTHER = 'other',
}

@Entity('doctor_documents')
export class DoctorDocument extends BaseEntity {
  @Column({ name: 'doctor_profile_id' })
  @Index()
  doctorProfileId!: string;

  @ManyToOne(() => DoctorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_profile_id' })
  doctorProfile!: DoctorProfile;

  @Column({ type: 'enum', enum: DocumentType, name: 'document_type' })
  documentType!: DocumentType;

  @Column({ name: 'file_url' })
  fileUrl!: string;

  @Column({ name: 'file_name' })
  fileName!: string;

  @Column({ name: 'mime_type' })
  mimeType!: string;

  @Column({ nullable: true })
  notes?: string;
}
