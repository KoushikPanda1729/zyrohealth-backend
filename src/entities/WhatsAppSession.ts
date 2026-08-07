import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum WhatsAppConversationState {
  MAIN_MENU = 'main_menu',
  AWAITING_AI = 'awaiting_ai',
  CLOSED = 'closed',
  BOOKING_SPECIALTY = 'booking_specialty',
  BOOKING_DOCTOR = 'booking_doctor',
  BOOKING_SLOT = 'booking_slot',
  BOOKING_TYPE = 'booking_type',
  BOOKING_PAYMENT_METHOD = 'booking_payment_method',
  AWAITING_PRESCRIPTION_UPLOAD = 'awaiting_prescription_upload',
  AWAITING_SHOP_QUOTE = 'awaiting_shop_quote',
  AWAITING_ORDER_CONFIRMATION = 'awaiting_order_confirmation',
  // Patient was sent a numbered list of every submitted quote (see
  // whatsapp-bot.service.ts's sendQuoteChoiceList) and is expected to
  // reply with a number to pick which shop fulfills their prescription —
  // an alternative to staff or auto-mode picking one for them.
  AWAITING_QUOTE_CHOICE = 'awaiting_quote_choice',
}

export interface WhatsAppMessageEvent {
  role: 'user' | 'assistant' | 'admin';
  content: string;
  timestamp: string;
  mediaUrl?: string;
  mimeType?: string;
}

@Entity('whatsapp_sessions')
export class WhatsAppSession extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  @Column({ name: 'phone_number' })
  @Index()
  phoneNumber!: string;

  @Column({ name: 'user_id', nullable: true })
  @Index()
  userId?: string;

  @Column({
    type: 'enum',
    enum: WhatsAppConversationState,
    name: 'conversation_state',
    default: WhatsAppConversationState.MAIN_MENU,
  })
  conversationState!: WhatsAppConversationState;

  @Column({ name: 'awaiting_human', default: false })
  awaitingHuman!: boolean;

  @Column({ type: 'jsonb', default: '[]' })
  messages!: WhatsAppMessageEvent[];

  @Column({ name: 'last_message_at', type: 'timestamp', nullable: true })
  lastMessageAt?: Date;

  @Column({ name: 'active_flow_id', nullable: true, type: 'varchar' })
  activeFlowId?: string | null;

  @Column({ name: 'flow_node_id', nullable: true, type: 'varchar' })
  flowNodeId?: string | null;

  @Column({ name: 'flow_variables', type: 'jsonb', default: '{}' })
  flowVariables!: Record<string, unknown>;
}
