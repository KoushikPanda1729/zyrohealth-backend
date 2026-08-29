import { injectable } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { TenantWhatsAppConfig, WhatsAppProviderType } from '../../entities/TenantWhatsAppConfig';
import { decryptSecret } from '../../utils/crypto.util';
import { AppError } from '../../utils/app-error';
import { GupshupWhatsAppProvider } from '../../providers/whatsapp/gupshup-whatsapp.provider';

const BASE_URL = 'https://api.gupshup.io/wa/app';

export type GupshupTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export interface GupshupTemplate {
  id: string;
  elementName: string;
  category: GupshupTemplateCategory;
  languageCode: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | string;
  templateType: string;
  data: string; // the message body, with {{1}}, {{2}} placeholders
  reason?: string; // Meta's rejection reason, if any
}

export interface CreateTemplateInput {
  elementName: string;
  category: GupshupTemplateCategory;
  languageCode: string;
  content: string;
  example: string;
  templateType?: string; // defaults to TEXT
}

interface TenantGupshupCreds {
  appId: string;
  apiKey: string;
}

// Wraps Gupshup's Partner/Template Management API — a DIFFERENT surface
// from GupshupWhatsAppProvider (which only sends already-approved
// messages). Scoped by App ID (a UUID, see TenantWhatsAppConfig#
// gupshupAppId), not the App Name used for sending. Gupshup-specific by
// design — Twilio/Meta have their own separate template-management APIs
// this doesn't attempt to unify, since only Gupshup is wired up as a
// provider with real credentials today.
@injectable()
export class GupshupTemplateService {
  private async getCreds(tenantId: string): Promise<TenantGupshupCreds> {
    const config = await AppDataSource.getRepository(TenantWhatsAppConfig).findOne({
      where: { tenantId },
    });
    if (
      !config ||
      config.provider !== WhatsAppProviderType.GUPSHUP ||
      !config.gupshupAppId ||
      !config.gupshupApiKey
    ) {
      throw AppError.badRequest(
        'Templates require Gupshup as the active provider with an App ID configured — set it in WhatsApp Provider Settings.',
      );
    }
    return { appId: config.gupshupAppId, apiKey: decryptSecret(config.gupshupApiKey) };
  }

  async listTemplates(tenantId: string): Promise<GupshupTemplate[]> {
    const { appId, apiKey } = await this.getCreds(tenantId);
    const res = await fetch(`${BASE_URL}/${appId}/template`, {
      method: 'GET',
      headers: { apikey: apiKey },
    });
    if (!res.ok) {
      throw AppError.badRequest(`Gupshup rejected the template list request (${res.status})`);
    }
    const body = (await res.json()) as { templates?: GupshupTemplate[] };
    return body.templates ?? [];
  }

  // Submits a new template to Meta for review via Gupshup — takes effect
  // immediately on Gupshup's side (status starts PENDING), but Meta's own
  // review is what actually approves/rejects it, same as creating one
  // directly in Gupshup's own dashboard. Not reversible from here once
  // submitted; Gupshup's dashboard is still the place to delete one.
  async createTemplate(tenantId: string, input: CreateTemplateInput): Promise<GupshupTemplate> {
    const { appId, apiKey } = await this.getCreds(tenantId);
    const bodyFields: Record<string, string> = {
      elementName: input.elementName,
      category: input.category,
      languageCode: input.languageCode,
      templateType: input.templateType ?? 'TEXT',
      content: input.content,
      example: input.example,
      vertical: input.elementName,
    };
    // Meta requires every Authentication-category template to carry an OTP
    // button (Gupshup rejects the submission otherwise, before it even
    // reaches Meta's review) — COPY_CODE is the simplest kind, no Android
    // package/signature needed unlike ONE_TAP autofill.
    if (input.category === 'AUTHENTICATION') {
      bodyFields.enableOtpButton = 'true';
      bodyFields.buttons = JSON.stringify([
        { type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy Code' },
      ]);
    }
    const body = new URLSearchParams(bodyFields);
    const res = await fetch(`${BASE_URL}/${appId}/template`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const responseBody = (await res.json().catch(() => ({}))) as {
      template?: GupshupTemplate;
      message?: string;
    };
    if (!res.ok) {
      throw AppError.badRequest(
        responseBody.message || `Gupshup rejected the template submission (${res.status})`,
      );
    }
    if (!responseBody.template) {
      throw AppError.badRequest('Gupshup accepted the request but returned no template details');
    }
    return responseBody.template;
  }

  // Sends an already-APPROVED template to one recipient — reuses the same
  // verified send path GupshupWhatsAppProvider#sendTemplate already uses
  // for OTP delivery (whatsapp-flow-engine.service.ts), rather than a
  // second, separately-guessed endpoint, since that one's already
  // confirmed working against the real API.
  async sendTemplateMessage(
    tenantId: string,
    data: { phone: string; templateName: string; languageCode: string; params: string[] },
  ): Promise<void> {
    const config = await AppDataSource.getRepository(TenantWhatsAppConfig).findOne({
      where: { tenantId },
    });
    if (
      !config ||
      config.provider !== WhatsAppProviderType.GUPSHUP ||
      !config.gupshupApiKey ||
      !config.gupshupSourceNumber ||
      !config.gupshupAppName
    ) {
      throw AppError.badRequest('Gupshup isn\'t fully configured for this tenant yet.');
    }
    const provider = new GupshupWhatsAppProvider({
      apiKey: decryptSecret(config.gupshupApiKey),
      sourceNumber: config.gupshupSourceNumber,
      appName: config.gupshupAppName,
    });
    await provider.sendTemplate(data.phone, data.templateName, data.languageCode, data.params);
  }
}
