import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { Booking } from './Booking';
import { User } from './User';

export enum MessageType {
  TEXT = 'text',
  PRESCRIPTION = 'prescription',
  IMAGE = 'image',
  FILE = 'file',
}

@Entity('chat_messages')
export class ChatMessage extends BaseEntity {
  @Column({ name: 'booking_id' })
  @Index()
  bookingId!: string;

  @ManyToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'sender_id' })
  @Index()
  senderId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sender_id' })
  sender!: User;

  @Column({ type: 'enum', enum: MessageType, default: MessageType.TEXT })
  type!: MessageType;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'file_url', nullable: true })
  fileUrl?: string;

  @Column({ name: 'is_read', default: false })
  isRead!: boolean;

  @Column({ name: 'sent_at', type: 'timestamptz', default: () => 'NOW()' })
  sentAt!: Date;
}
