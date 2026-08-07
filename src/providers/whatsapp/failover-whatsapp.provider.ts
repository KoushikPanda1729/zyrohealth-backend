import { injectable } from 'tsyringe';
import {
  IWhatsAppProvider,
  InteractiveOption,
} from './whatsapp.provider.interface';
import { TwilioWhatsAppProvider } from './twilio-whatsapp.provider';
import { MetaWhatsAppProvider } from './meta-whatsapp.provider';
import { env } from '../../config/env';
import { formatWhatsAppError } from './format-whatsapp-error';

type ConcreteProviderName = 'twilio' | 'meta';

// Wraps the Twilio and Meta providers so a failed send on the configured
// primary (WHATSAPP_PROVIDER) automatically retries on the other, if it has
// credentials configured. Keeps outbound WhatsApp working even if one
// provider is down or misconfigured.
@injectable()
export class FailoverWhatsAppProvider implements IWhatsAppProvider {
  private readonly providers: Partial<
    Record<ConcreteProviderName, IWhatsAppProvider>
  > = {};
  private readonly order: ConcreteProviderName[];

  constructor() {
    if (env.TWILIO_WHATSAPP_FROM_NUMBER) {
      this.providers.twilio = new TwilioWhatsAppProvider();
    }
    if (env.META_WHATSAPP_PHONE_NUMBER_ID && env.META_WHATSAPP_ACCESS_TOKEN) {
      this.providers.meta = new MetaWhatsAppProvider();
    }

    const primary = env.WHATSAPP_PROVIDER as ConcreteProviderName;
    const fallback: ConcreteProviderName =
      primary === 'twilio' ? 'meta' : 'twilio';
    this.order = [primary, fallback].filter(
      (name): name is ConcreteProviderName => Boolean(this.providers[name]),
    );

    if (this.order.length === 0) {
      console.warn(
        '[FailoverWhatsApp] No WhatsApp provider has credentials configured — sends will fail until TWILIO_WHATSAPP_FROM_NUMBER or META_WHATSAPP_PHONE_NUMBER_ID/META_WHATSAPP_ACCESS_TOKEN are set.',
      );
    }
  }

  async sendText(to: string, body: string): Promise<void> {
    await this.runWithFailover((provider) => provider.sendText(to, body));
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    params: string[],
  ): Promise<void> {
    await this.runWithFailover((provider) =>
      provider.sendTemplate(to, templateName, languageCode, params),
    );
  }

  async sendInteractive(
    to: string,
    body: string,
    options: InteractiveOption[],
    listButtonLabel?: string,
  ): Promise<void> {
    await this.runWithFailover((provider) =>
      provider.sendInteractive(to, body, options, listButtonLabel),
    );
  }

  private async runWithFailover(
    send: (provider: IWhatsAppProvider) => Promise<void>,
  ): Promise<void> {
    if (this.order.length === 0) {
      throw new Error('No WhatsApp provider configured with credentials');
    }

    let lastError: unknown;
    for (const name of this.order) {
      const provider = this.providers[name];
      if (!provider) continue;
      try {
        await send(provider);
        return;
      } catch (err) {
        lastError = err;
        console.error(
          `[FailoverWhatsApp] "${name}" send failed${this.order.length > 1 ? ', trying next provider' : ''}: ${formatWhatsAppError(err)}`,
        );
      }
    }
    throw lastError;
  }
}
