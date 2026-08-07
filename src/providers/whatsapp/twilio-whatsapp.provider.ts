import { injectable } from 'tsyringe';
import twilio from 'twilio';
import {
  IWhatsAppProvider,
  InteractiveOption,
} from './whatsapp.provider.interface';
import { env } from '../../config/env';

const CONTENT_API_URL = 'https://content.twilio.com/v1/Content';
// WhatsApp hard limits: quick-reply button titles max 20 chars, list-picker
// item titles max 24 chars, list-picker descriptions max 72 chars.
const QUICK_REPLY_TITLE_LIMIT = 20;
const LIST_ITEM_TITLE_LIMIT = 24;
const LIST_ITEM_DESCRIPTION_LIMIT = 72;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface TwilioWhatsAppConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  templateMap?: Record<string, string>;
}

function defaultTwilioConfig(): TwilioWhatsAppConfig {
  let templateMap: Record<string, string>;
  try {
    templateMap = JSON.parse(env.TWILIO_WHATSAPP_TEMPLATE_MAP) as Record<
      string,
      string
    >;
  } catch {
    templateMap = {};
  }
  return {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    fromNumber: env.TWILIO_WHATSAPP_FROM_NUMBER,
    templateMap,
  };
}

@injectable()
export class TwilioWhatsAppProvider implements IWhatsAppProvider {
  private readonly client: ReturnType<typeof twilio>;
  private readonly config: TwilioWhatsAppConfig;

  // No config = resolved via DI, using the platform's global env vars. A
  // config is passed explicitly when constructed ad hoc for a tenant with
  // its own Twilio account (see WhatsAppProviderResolver).
  constructor(config?: TwilioWhatsAppConfig) {
    this.config = config ?? defaultTwilioConfig();
    this.client = twilio(this.config.accountSid, this.config.authToken);
  }

  async sendText(to: string, body: string): Promise<void> {
    await this.client.messages.create({
      from: `whatsapp:${this.config.fromNumber}`,
      to: `whatsapp:${to}`,
      body,
    });
  }

  async sendTemplate(
    to: string,
    templateName: string,
    _languageCode: string,
    params: string[],
  ): Promise<void> {
    const contentSid = (this.config.templateMap ?? {})[templateName];
    if (!contentSid) {
      console.warn(
        `[TwilioWhatsApp] No contentSid registered for template "${templateName}", falling back to plain text`,
      );
      await this.sendText(to, `${templateName}: ${params.join(', ')}`);
      return;
    }

    const contentVariables = params.reduce<Record<string, string>>(
      (acc, param, index) => {
        acc[String(index + 1)] = param;
        return acc;
      },
      {},
    );

    await this.client.messages.create({
      from: `whatsapp:${this.config.fromNumber}`,
      to: `whatsapp:${to}`,
      contentSid,
      contentVariables: JSON.stringify(contentVariables),
    });
  }

  async sendInteractive(
    to: string,
    body: string,
    options: InteractiveOption[],
    listButtonLabel = 'Choose',
  ): Promise<void> {
    const contentSid =
      options.length <= 3
        ? await this.createQuickReplyContent(body, options)
        : await this.createListPickerContent(body, listButtonLabel, options);

    await this.client.messages.create({
      from: `whatsapp:${this.config.fromNumber}`,
      to: `whatsapp:${to}`,
      contentSid,
    });
  }

  private async createContent(
    payload: Record<string, unknown>,
  ): Promise<string> {
    const res = await fetch(CONTENT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:
          'Basic ' +
          Buffer.from(
            `${this.config.accountSid}:${this.config.authToken}`,
          ).toString('base64'),
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { sid?: string };
    if (!res.ok || !json.sid) {
      throw new Error(
        `Twilio Content API error (${res.status}): ${JSON.stringify(json)}`,
      );
    }
    return json.sid;
  }

  private async createQuickReplyContent(
    body: string,
    options: InteractiveOption[],
  ): Promise<string> {
    return this.createContent({
      friendly_name: `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      language: 'en',
      types: {
        'twilio/quick-reply': {
          body,
          actions: options.map((o) => ({
            id: o.id,
            title: truncate(o.title, QUICK_REPLY_TITLE_LIMIT),
          })),
        },
      },
    });
  }

  private async createListPickerContent(
    body: string,
    buttonLabel: string,
    options: InteractiveOption[],
  ): Promise<string> {
    return this.createContent({
      friendly_name: `lp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      language: 'en',
      types: {
        'twilio/list-picker': {
          body,
          button: truncate(buttonLabel, QUICK_REPLY_TITLE_LIMIT),
          items: options.map((o) => ({
            id: o.id,
            item: truncate(o.title, LIST_ITEM_TITLE_LIMIT),
            description: o.description
              ? truncate(o.description, LIST_ITEM_DESCRIPTION_LIMIT)
              : undefined,
          })),
        },
      },
    });
  }
}
