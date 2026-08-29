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

  // Gupshup's Template Management API (list/create templates) is scoped
  // by this UUID in the URL path, not the app NAME above — visible on the
  // app's own dashboard URL (apps.gupshup.io/whatsapp/overview?appId=...).
  // Not needed for sending messages (gupshupAppName + apiKey covers that),
  // only for the admin-panel Templates feature (gupshup-template.service.ts).
  @Column({ nullable: true, name: 'gupshup_app_id' })
  gupshupAppId?: string;

  // Gupshup has no built-in webhook-signing mechanism (unlike Twilio's
  // X-Twilio-Signature / Meta's X-Hub-Signature-256) — this is a
  // self-chosen shared secret embedded in the callback URL you register
  // with Gupshup, checked in whatsapp-webhook.controller.ts#receiveGupshup.
  @Column({ nullable: true, name: 'gupshup_webhook_secret' })
  gupshupWebhookSecret?: string;

  // The name of a pre-approved WhatsApp "Authentication" (or any other)
  // template — same shape across Twilio/Meta/Gupshup (see
  // IWhatsAppProvider.sendTemplate), so this isn't provider-specific like
  // the fields above. Used first by auth.service.ts#sendOtp to send OTPs
  // that work even without an open 24h session with the recipient; not a
  // secret, stored in plaintext. Falls back to the platform-wide
  // WHATSAPP_OTP_TEMPLATE_NAME env var when a tenant hasn't set one.
  @Column({ nullable: true, name: 'otp_template_name' })
  otpTemplateName?: string;

  @Column({ nullable: true, name: 'otp_template_lang' })
  otpTemplateLang?: string;
}
