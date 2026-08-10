import { injectable } from 'tsyringe';
import {
  IWhatsAppProvider,
  InteractiveOption,
} from './whatsapp.provider.interface';
import { env } from '../../config/env';

// WhatsApp interactive-button messages max out at 3 buttons; anything more
// must use a list instead — same limit Meta's provider already enforces.
const MAX_BUTTONS = 3;
const SEND_URL = 'https://api.gupshup.io/wa/api/v1/msg';

export interface GupshupWhatsAppConfig {
  apiKey: string;
  sourceNumber: string;
  appName: string;
}

function defaultGupshupConfig(): GupshupWhatsAppConfig {
  return {
    apiKey: env.GUPSHUP_API_KEY,
    sourceNumber: env.GUPSHUP_SOURCE_NUMBER,
    appName: env.GUPSHUP_APP_NAME,
  };
}

@injectable()
export class GupshupWhatsAppProvider implements IWhatsAppProvider {
  private readonly config: GupshupWhatsAppConfig;

  // No config = resolved via DI, using the platform's global env vars. A
  // config is passed explicitly when constructed ad hoc for a tenant/shop
  // with its own Gupshup account (see WhatsAppProviderResolver).
  constructor(config?: GupshupWhatsAppConfig) {
    this.config = config ?? defaultGupshupConfig();
  }

  private async post(body: URLSearchParams): Promise<void> {
    body.set('channel', 'whatsapp');
    body.set('source', this.config.sourceNumber);
    body.set('src.name', this.config.appName);

    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        apikey: this.config.apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gupshup WhatsApp API error (${res.status}): ${text}`);
    }
  }

  async sendText(to: string, body: string): Promise<void> {
    await this.post(
      new URLSearchParams({
        destination: to,
        message: JSON.stringify({ type: 'text', text: body }),
      }),
    );
  }

  // Gupshup templates use a separate `template` param (id + params) rather
  // than the `message` param used for text/interactive sends.
  async sendTemplate(
    to: string,
    templateName: string,
    _languageCode: string,
    params: string[],
  ): Promise<void> {
    await this.post(
      new URLSearchParams({
        destination: to,
        template: JSON.stringify({ id: templateName, params }),
      }),
    );
  }

  // Field shapes below (quick_reply's `content`/`options`, list's
  // `globalButtons`/`items`) are reconstructed from Gupshup's public docs
  // summary, not a live-tested payload — verify against a real Gupshup
  // sandbox app before relying on this in production; sendText/sendTemplate
  // are the well-documented, lower-risk paths.
  async sendInteractive(
    to: string,
    body: string,
    options: InteractiveOption[],
    listButtonLabel = 'Choose',
  ): Promise<void> {
    const message =
      options.length <= MAX_BUTTONS
        ? {
            type: 'quick_reply',
            content: { type: 'text', text: body },
            options: options.map((o) => ({ type: 'text', title: o.title.slice(0, 20), postbackText: o.id })),
          }
        : {
            type: 'list',
            title: listButtonLabel.slice(0, 20),
            body,
            globalButtons: [{ type: 'text', title: listButtonLabel.slice(0, 20) }],
            items: [
              {
                title: 'Options',
                subtitle: '',
                options: options.slice(0, 10).map((o) => ({
                  type: 'text',
                  title: o.title.slice(0, 24),
                  description: o.description?.slice(0, 72),
                  postbackText: o.id,
                })),
              },
            ],
          };

    await this.post(
      new URLSearchParams({
        destination: to,
        message: JSON.stringify(message),
      }),
    );
  }
}
