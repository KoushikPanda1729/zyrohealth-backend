import { injectable, inject } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import {
  TenantWhatsAppConfig,
  WhatsAppProviderType,
} from '../../entities/TenantWhatsAppConfig';
import { IWhatsAppProvider } from '../../providers/whatsapp/whatsapp.provider.interface';
import { TwilioWhatsAppProvider } from '../../providers/whatsapp/twilio-whatsapp.provider';
import { MetaWhatsAppProvider } from '../../providers/whatsapp/meta-whatsapp.provider';
import { WHATSAPP_PROVIDER } from '../../config/container';
import { decryptSecret } from '../../utils/crypto.util';
import { env } from '../../config/env';

// Resolves the right WhatsApp provider instance per tenant: a tenant with
// its own configured Twilio/Meta account gets an ad-hoc provider built
// from its own (decrypted) credentials; everyone else falls back to the
// platform's global env-var-configured provider, unchanged from before
// multi-tenancy — so an unconfigured tenant needs zero setup.
@injectable()
export class WhatsAppProviderResolver {
  constructor(
    @inject(WHATSAPP_PROVIDER)
    private readonly defaultProvider: IWhatsAppProvider,
  ) {}

  private async getConfig(
    tenantId: string,
  ): Promise<TenantWhatsAppConfig | null> {
    return AppDataSource.getRepository(TenantWhatsAppConfig).findOne({
      where: { tenantId },
    });
  }

  async resolve(tenantId: string): Promise<IWhatsAppProvider> {
    const config = await this.getConfig(tenantId);
    if (!config) return this.defaultProvider;

    if (
      config.provider === WhatsAppProviderType.TWILIO &&
      config.twilioAccountSid &&
      config.twilioAuthToken &&
      config.twilioFromNumber
    ) {
      return new TwilioWhatsAppProvider({
        accountSid: config.twilioAccountSid,
        authToken: decryptSecret(config.twilioAuthToken),
        fromNumber: config.twilioFromNumber,
      });
    }

    if (
      config.provider === WhatsAppProviderType.META &&
      config.metaPhoneNumberId &&
      config.metaAccessToken
    ) {
      return new MetaWhatsAppProvider({
        phoneNumberId: config.metaPhoneNumberId,
        accessToken: decryptSecret(config.metaAccessToken),
        apiVersion: config.metaApiVersion,
      });
    }

    // Provider chosen but incomplete (e.g. mid-setup) — fall back rather
    // than fail every send for the tenant.
    return this.defaultProvider;
  }

  // Webhook signature validation needs the tenant's own secret (their
  // Twilio auth token / Meta app secret), not the platform's — falls back
  // to `undefined` (caller uses the global env secret) when unconfigured.
  async getWebhookSecrets(
    tenantId: string,
  ): Promise<{ twilioAuthToken?: string; metaAppSecret?: string }> {
    const config = await this.getConfig(tenantId);
    if (!config) return {};
    return {
      twilioAuthToken: config.twilioAuthToken
        ? decryptSecret(config.twilioAuthToken)
        : undefined,
      metaAppSecret: config.metaAppSecret
        ? decryptSecret(config.metaAppSecret)
        : undefined,
    };
  }

  // Downloading inbound media (Twilio's MediaUrl0 / Meta's media-id
  // endpoint) needs the tenant's real account credentials, not just the
  // webhook signing secrets above — falls back to the platform's global
  // env credentials for an unconfigured tenant, same convention as resolve().
  async getMediaCredentials(tenantId: string): Promise<{
    twilioAccountSid: string;
    twilioAuthToken: string;
    metaAccessToken: string;
    metaApiVersion: string;
  }> {
    const config = await this.getConfig(tenantId);
    return {
      twilioAccountSid: config?.twilioAccountSid || env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: config?.twilioAuthToken
        ? decryptSecret(config.twilioAuthToken)
        : env.TWILIO_AUTH_TOKEN,
      metaAccessToken: config?.metaAccessToken
        ? decryptSecret(config.metaAccessToken)
        : env.META_WHATSAPP_ACCESS_TOKEN,
      metaApiVersion: config?.metaApiVersion || env.META_WHATSAPP_API_VERSION,
    };
  }
}
