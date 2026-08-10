import { injectable, inject } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import {
  TenantWhatsAppConfig,
  WhatsAppProviderType,
} from '../../entities/TenantWhatsAppConfig';
import { MedicineShopWhatsAppConfig } from '../../entities/MedicineShopWhatsAppConfig';
import { MedicineShop } from '../../entities/MedicineShop';
import { IWhatsAppProvider } from '../../providers/whatsapp/whatsapp.provider.interface';
import { TwilioWhatsAppProvider } from '../../providers/whatsapp/twilio-whatsapp.provider';
import { MetaWhatsAppProvider } from '../../providers/whatsapp/meta-whatsapp.provider';
import { WHATSAPP_PROVIDER } from '../../config/container';
import { decryptSecret } from '../../utils/crypto.util';
import { env } from '../../config/env';

type ProviderCreds = {
  provider: WhatsAppProviderType;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  metaPhoneNumberId?: string;
  metaAccessToken?: string;
  metaAppSecret?: string;
  metaApiVersion?: string;
};

function buildProviderFromCreds(creds: ProviderCreds): IWhatsAppProvider | null {
  if (
    creds.provider === WhatsAppProviderType.TWILIO &&
    creds.twilioAccountSid &&
    creds.twilioAuthToken &&
    creds.twilioFromNumber
  ) {
    return new TwilioWhatsAppProvider({
      accountSid: creds.twilioAccountSid,
      authToken: decryptSecret(creds.twilioAuthToken),
      fromNumber: creds.twilioFromNumber,
    });
  }
  if (
    creds.provider === WhatsAppProviderType.META &&
    creds.metaPhoneNumberId &&
    creds.metaAccessToken
  ) {
    return new MetaWhatsAppProvider({
      phoneNumberId: creds.metaPhoneNumberId,
      accessToken: decryptSecret(creds.metaAccessToken),
      apiVersion: creds.metaApiVersion,
    });
  }
  return null;
}

// Resolves the right WhatsApp provider instance per tenant: a tenant with
// its own configured Twilio/Meta account gets an ad-hoc provider built
// from its own (decrypted) credentials; everyone else falls back to the
// platform's global env-var-configured provider, unchanged from before
// multi-tenancy — so an unconfigured tenant needs zero setup.
//
// A standalone shop's own WhatsApp module (see MedicineShopWhatsAppConfig)
// is DIFFERENT on purpose: there is no platform-default fallback for a
// shop's own number — resolve(tenantId, shopId) only returns a shop
// provider when whatsappModuleEnabled is true AND real credentials are
// configured; otherwise it falls through to the normal tenant resolution,
// same as if shopId hadn't been passed at all.
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

  private async getShopConfig(
    shopId: string,
  ): Promise<MedicineShopWhatsAppConfig | null> {
    const shop = await AppDataSource.getRepository(MedicineShop).findOne({
      where: { id: shopId },
    });
    if (!shop?.whatsappModuleEnabled) return null;
    return AppDataSource.getRepository(MedicineShopWhatsAppConfig).findOne({
      where: { shopId },
    });
  }

  async resolve(tenantId: string, shopId?: string): Promise<IWhatsAppProvider> {
    if (shopId) {
      const shopConfig = await this.getShopConfig(shopId);
      if (shopConfig) {
        const shopProvider = buildProviderFromCreds(shopConfig);
        if (shopProvider) return shopProvider;
      }
    }

    const config = await this.getConfig(tenantId);
    if (!config) return this.defaultProvider;
    return buildProviderFromCreds(config) ?? this.defaultProvider;
  }

  // Webhook signature validation needs the tenant's own secret (their
  // Twilio auth token / Meta app secret), not the platform's — falls back
  // to `undefined` (caller uses the global env secret) when unconfigured.
  // shopId (when the receiving number belongs to a shop's own module)
  // checks the shop's own secret first, same precedence as resolve().
  async getWebhookSecrets(
    tenantId: string,
    shopId?: string,
  ): Promise<{ twilioAuthToken?: string; metaAppSecret?: string }> {
    if (shopId) {
      const shopConfig = await this.getShopConfig(shopId);
      if (shopConfig?.twilioAuthToken || shopConfig?.metaAppSecret) {
        return {
          twilioAuthToken: shopConfig.twilioAuthToken
            ? decryptSecret(shopConfig.twilioAuthToken)
            : undefined,
          metaAppSecret: shopConfig.metaAppSecret
            ? decryptSecret(shopConfig.metaAppSecret)
            : undefined,
        };
      }
    }

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
  async getMediaCredentials(tenantId: string, shopId?: string): Promise<{
    twilioAccountSid: string;
    twilioAuthToken: string;
    metaAccessToken: string;
    metaApiVersion: string;
  }> {
    if (shopId) {
      const shopConfig = await this.getShopConfig(shopId);
      if (shopConfig?.twilioAccountSid || shopConfig?.metaAccessToken) {
        return {
          twilioAccountSid: shopConfig.twilioAccountSid || env.TWILIO_ACCOUNT_SID,
          twilioAuthToken: shopConfig.twilioAuthToken
            ? decryptSecret(shopConfig.twilioAuthToken)
            : env.TWILIO_AUTH_TOKEN,
          metaAccessToken: shopConfig.metaAccessToken
            ? decryptSecret(shopConfig.metaAccessToken)
            : env.META_WHATSAPP_ACCESS_TOKEN,
          metaApiVersion: shopConfig.metaApiVersion || env.META_WHATSAPP_API_VERSION,
        };
      }
    }

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
