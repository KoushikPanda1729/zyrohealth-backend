import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { WhatsAppMessageEvent } from './WhatsAppSession';

// Channel-neutral counterpart to WhatsAppSession — same active-flow/
// flow-node/flow-variables tracking, but keyed by an authenticated
// patient's userId instead of a phone number, since the mobile app already
// has a real session. WhatsAppFlowEngineService.processAppTurn drives this
// exactly the same way processInbound drives WhatsAppSession, just via
// AppFlowSink instead of WhatsAppFlowSink — same flow definition, same
// node interpretation, different dispatch target.
@Entity('app_flow_sessions')
export class AppFlowSession extends BaseEntity {
  @Column({ name: 'user_id' })
  @Index()
  userId!: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId?: string;

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

  // The structured steps from the most recent turn — persisted so the chat
  // screen can rebuild its current state (which rich bubble/action is
  // pending) on load, without replaying the flow. Message history alone
  // isn't enough: a step like select_quote's option list is data, not text.
  @Column({ name: 'last_steps', type: 'jsonb', default: '[]' })
  lastSteps!: { stepType: string; data: Record<string, unknown> }[];
}
