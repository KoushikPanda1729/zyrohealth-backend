import { injectable } from 'tsyringe';
import {
  IWhatsAppProvider,
  InteractiveOption,
} from './whatsapp.provider.interface';
import { env } from '../../config/env';

// WhatsApp interactive-button messages max out at 3 buttons; anything more
// must use an interactive list instead (max 10 rows in a single section).
const MAX_BUTTONS = 3;

export interface MetaWhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
}

function defaultMetaConfig(): MetaWhatsAppConfig {
  return {
    phoneNumberId: env.META_WHATSAPP_PHONE_NUMBER_ID,
    accessToken: env.META_WHATSAPP_ACCESS_TOKEN,
    apiVersion: env.META_WHATSAPP_API_VERSION,
  };
}

@injectable()
export class MetaWhatsAppProvider implements IWhatsAppProvider {
  private readonly config: MetaWhatsAppConfig;

  // No config = resolved via DI, using the platform's global env vars. A
  // config is passed explicitly when constructed ad hoc for a tenant with
  // its own Meta WhatsApp Cloud API app (see WhatsAppProviderResolver).
  constructor(config?: MetaWhatsAppConfig) {
    this.config = config ?? defaultMetaConfig();
  }

  private get baseUrl(): string {
    return `https://graph.facebook.com/${this.config.apiVersion ?? 'v21.0'}/${this.config.phoneNumberId}/messages`;
  }

  private async post(payload: Record<string, unknown>): Promise<void> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Meta WhatsApp API error (${res.status}): ${text}`);
    }
  }

  async sendText(to: string, body: string): Promise<void> {
    await this.post({ to, type: 'text', text: { body } });
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    params: string[],
  ): Promise<void> {
    await this.post({
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: 'body',
            parameters: params.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    });
  }

  async sendInteractive(
    to: string,
    body: string,
    options: InteractiveOption[],
    listButtonLabel = 'Choose',
  ): Promise<void> {
    if (options.length <= MAX_BUTTONS) {
      await this.post({
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: {
            buttons: options.map((o) => ({
              type: 'reply',
              reply: { id: o.id, title: o.title.slice(0, 20) },
            })),
          },
        },
      });
      return;
    }

    await this.post({
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body },
        action: {
          button: listButtonLabel.slice(0, 20),
          sections: [
            {
              rows: options.slice(0, 10).map((o) => ({
                id: o.id,
                title: o.title.slice(0, 24),
                description: o.description?.slice(0, 72),
              })),
            },
          ],
        },
      },
    });
  }
}
