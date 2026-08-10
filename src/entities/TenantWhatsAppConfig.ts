import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';

export enum WhatsAppProviderType {
  TWILIO = 'twilio',
  META = 'meta',
  GUPSHUP = 'gupshup',
}

// A tenant's own WhatsApp provider + credentials — when present, these
// override the platform's global env-var-configured provider for every
// send/receive involving that tenant. Secret fields (twilioAuthToken,
// metaAccessToken, metaAppSecret) are stored encrypted (see crypto.util.ts),
// never in plaintext.
@Entity('tenant_whatsapp_configs')
export class TenantWhatsAppConfig extends BaseEntity {
  @Column({ name: 'tenant_id', unique: true })
  @Index()
  tenantId!: string;

  @Column({ type: 'enum', enum: WhatsAppProviderType })
  provider!: WhatsAppProviderType;

  @Column({ nullable: true, name: 'twilio_account_sid' })
  twilioAccountSid?: string;

  @Column({ nullable: true, name: 'twilio_auth_token' })
  twilioAuthToken?: string;

  @Column({ nullable: true, name: 'twilio_from_number' })
  twilioFromNumber?: string;

  @Column({ nullable: true, name: 'meta_phone_number_id' })
  metaPhoneNumberId?: string;

  @Column({ nullable: true, name: 'meta_access_token' })
  metaAccessToken?: string;

  @Column({ nullable: true, name: 'meta_app_secret' })
  metaAppSecret?: string;

  @Column({ nullable: true, name: 'meta_api_version' })
  metaApiVersion?: string;

  @Column({ nullable: true, name: 'gupshup_api_key' })
  gupshupApiKey?: string;

  @Column({ nullable: true, name: 'gupshup_source_number' })
  gupshupSourceNumber?: string;

  @Column({ nullable: true, name: 'gupshup_app_name' })
  gupshupAppName?: string;

  // Gupshup has no built-in webhook-signing mechanism (unlike Twilio's
  // X-Twilio-Signature / Meta's X-Hub-Signature-256) — this is a
  // self-chosen shared secret embedded in the callback URL you register
  // with Gupshup, checked in whatsapp-webhook.controller.ts#receiveGupshup.
  @Column({ nullable: true, name: 'gupshup_webhook_secret' })
  gupshupWebhookSecret?: string;
}
