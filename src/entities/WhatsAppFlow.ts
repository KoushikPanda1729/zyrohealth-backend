import { Entity, Column } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export type WhatsAppFlowNodeType =
  | 'start'
  | 'message'
  | 'buttons'
  | 'ai'
  | 'condition'
  | 'api_call'
  | 'satisfaction'
  | 'handoff'
  | 'end'
  // Platform-aware nodes — pull live app data (doctors/availability/bookings)
  // instead of admin-authored static content, so a flow built visually can
  // drive the same real booking pipeline the hardcoded bot uses.
  | 'platform_specialty_list'
  | 'platform_doctor_list'
  | 'platform_slot_list'
  | 'platform_consultation_type'
  | 'platform_payment_method'
  | 'platform_create_booking'
  | 'platform_order_status';

export interface WhatsAppFlowNode {
  id: string;
  type: WhatsAppFlowNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WhatsAppFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export interface WhatsAppFlowDefinition {
  nodes: WhatsAppFlowNode[];
  edges: WhatsAppFlowEdge[];
}

@Entity('whatsapp_flows')
export class WhatsAppFlow extends BaseEntity {
  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

  // Set (alongside tenantId, which stays populated with the shop's parent
  // tenant) when this flow belongs to a standalone shop's own independent
  // WhatsApp module rather than the tenant's patient-facing bot — see
  // shop-whatsapp-flow.util.ts. tenantId staying populated is deliberate:
  // it's what the flow engine's existing tenantId-keyed lookups use, so
  // nothing there needs to change to support shop-owned flows.
  @Column({ name: 'shop_id', nullable: true })
  shopId?: string;

  @Column()
  name!: string;

  @Column({ name: 'is_active', default: false })
  isActive!: boolean;

  @Column({ type: 'jsonb', default: '{"nodes":[],"edges":[]}' })
  definition!: WhatsAppFlowDefinition;
}
