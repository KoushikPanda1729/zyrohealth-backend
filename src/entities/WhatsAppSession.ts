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
  // "Order Medicine" no longer jumps straight to a prescription photo —
  // this offers the choice, then AWAITING_MEDICINE_SEARCH loops on typed
  // medicine names (AI-answered against the tenant's own shop catalogs)
  // until the patient picks "Upload Prescription" or types a greeting word.
  ORDER_MEDICINE_CHOICE = 'order_medicine_choice',
  AWAITING_MEDICINE_SEARCH = 'awaiting_medicine_search',
}

export interface WhatsAppMessageEvent {
  role: 'user' | 'assistant' | 'admin';
  content: string;
  timestamp: string;
  mediaUrl?: string;
  mimeType?: string;
  // Set only on the app channel (WhatsApp's sink no-ops sendStructured —
  // see AppFlowSink) so a rich bubble (quote list, pay button, tracking)
  // stays anchored in its place in the chat history, not just visible for
  // the one turn it was the "current" step — same as a document message
  // in a real WhatsApp thread doesn't disappear once you've replied to it.
  step?: { stepType: string; data: Record<string, unknown> };
}

@Entity('whatsapp_sessions')
export class WhatsAppSession extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  // Set (alongside tenantId — the shop's parent tenant, kept populated for
  // the same reason as WhatsAppFlow.shopId above) when this conversation is
  // with a standalone shop's own independent WhatsApp number, not the
  // tenant's patient-facing one.
  @Column({ name: 'shop_id', nullable: true })
  shopId?: string;

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
