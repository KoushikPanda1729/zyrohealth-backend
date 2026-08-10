import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { WhatsAppProviderType } from './TenantWhatsAppConfig';

// A standalone shop's own WhatsApp Business provider account — mirrors
// TenantWhatsAppConfig exactly, but unlike a tenant there is NO platform
// default fallback: a shop's own direct-to-customer WhatsApp presence only
// exists once they've configured real credentials here (see
// shop-whatsapp-config.util.ts). Secret fields stored encrypted, same
// convention as the tenant version (crypto.util.ts).
@Entity('medicine_shop_whatsapp_configs')
export class MedicineShopWhatsAppConfig extends BaseEntity {
  @Column({ name: 'shop_id', unique: true })
  @Index()
  shopId!: string;

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

  @Column({ nullable: true, name: 'gupshup_webhook_secret' })
  gupshupWebhookSecret?: string;
}
