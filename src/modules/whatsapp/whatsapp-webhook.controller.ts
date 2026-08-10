import { Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'tsyringe';
import * as crypto from 'crypto';
import twilio from 'twilio';
import { env } from '../../config/env';
import { WhatsAppBotService } from './whatsapp-bot.service';
import { WhatsAppProviderResolver } from './whatsapp-provider-resolver.service';
import { formatWhatsAppError } from '../../providers/whatsapp/format-whatsapp-error';
import { resolveTenantIdForNumber } from '../tenancy/permissions.util';
import { resolveShopIdForNumber } from '../medicine-shops/shop-whatsapp-module.util';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { STORAGE_PROVIDER } from '../../config/container';
import {
  downloadTwilioMedia,
  downloadMetaMedia,
  mediaStorageKey,
} from './whatsapp-media.util';

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { display_phone_number?: string };
        messages?: Array<{
          from: string;
          type: string;
          text?: { body?: string };
          image?: { id: string; mime_type: string };
        }>;
      };
    }>;
  }>;
}

@injectable()
export class WhatsAppWebhookController {
  constructor(
    private readonly bot: WhatsAppBotService,
    private readonly providerResolver: WhatsAppProviderResolver,
    @inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  // Meta's one-time subscription verification (GET) — echoes back hub.challenge
  // once hub.verify_token matches what's configured in the Meta app dashboard.
  verifyMeta = (req: Request, res: Response): void => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (
      mode === 'subscribe' &&
      env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN &&
      token === env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN
    ) {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
  };

  receiveMeta = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const rawBody = req.body as Buffer;
      const payload = JSON.parse(
        rawBody.toString('utf8'),
      ) as MetaWebhookPayload;

      // Resolve which tenant this webhook belongs to (from the receiving
      // number) *before* validating the signature, since a tenant with its
      // own Meta app secret must be validated against that secret, not the
      // platform's global one.
      const firstToNumber =
        payload.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number;
      const normalizedFirstToNumber = firstToNumber ? `+${firstToNumber.replace(/^\+/, '')}` : undefined;
      const signatureShopId = await resolveShopIdForNumber(normalizedFirstToNumber);
      const signatureTenantId = await resolveTenantIdForNumber(normalizedFirstToNumber);
      const { metaAppSecret } =
        await this.providerResolver.getWebhookSecrets(signatureTenantId, signatureShopId);
      const appSecret = metaAppSecret || env.META_WHATSAPP_APP_SECRET;

      if (appSecret) {
        const signature = req.header('x-hub-signature-256');
        if (
          !signature ||
          !this.verifyMetaSignature(rawBody, signature, appSecret)
        ) {
          res.sendStatus(403);
          return;
        }
      } else {
        console.warn(
          '[WhatsApp Webhook] No Meta app secret configured (tenant or global) — skipping signature validation (unsafe for production).',
        );
      }

      // Ack immediately — Meta expects a fast response. Process messages after.
      res.sendStatus(200);

      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const toNumber = change.value?.metadata?.display_phone_number;
          const normalizedToNumber = toNumber ? `+${toNumber.replace(/^\+/, '')}` : undefined;
          const shopId = await resolveShopIdForNumber(normalizedToNumber);
          const tenantId = await resolveTenantIdForNumber(normalizedToNumber);
          for (const message of change.value?.messages ?? []) {
            if (message.type !== 'text' && message.type !== 'image') continue;
            const phone = message.from.startsWith('+')
              ? message.from
              : `+${message.from}`;
            try {
              let media: { url: string; mimeType: string } | undefined;
              if (message.type === 'image' && message.image) {
                const { metaAccessToken, metaApiVersion } =
                  await this.providerResolver.getMediaCredentials(tenantId, shopId);
                const { buffer, mimeType } = await downloadMetaMedia(
                  message.image.id,
                  metaAccessToken,
                  metaApiVersion,
                );
                const url = await this.storage.upload(
                  mediaStorageKey(tenantId, mimeType),
                  buffer,
                  mimeType,
                );
                media = { url, mimeType };
              }
              if (shopId) {
                await this.bot.processInboundShopModuleMessage(
                  shopId,
                  tenantId,
                  phone,
                  message.text?.body ?? '',
                  media,
                );
              } else {
                await this.bot.processInboundMessage(
                  tenantId,
                  phone,
                  message.text?.body ?? '',
                  media,
                );
              }
            } catch (err) {
              console.error(
                `[WhatsApp Webhook] Failed processing inbound Meta message: ${formatWhatsAppError(err)}`,
              );
            }
          }
        }
      }
    } catch (err) {
      next(err);
    }
  };

  receiveTwilio = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = req.body as Record<string, string>;
      const signature = req.header('x-twilio-signature');
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

      const to = (params['To'] ?? '').replace('whatsapp:', '');
      // Resolve tenant *before* validating the signature — a tenant with
      // its own Twilio account must be validated against its own auth
      // token, not the platform's global one.
      const shopId = await resolveShopIdForNumber(to || undefined);
      const tenantId = await resolveTenantIdForNumber(to || undefined);
      const { twilioAuthToken } =
        await this.providerResolver.getWebhookSecrets(tenantId, shopId);
      const authToken = twilioAuthToken || env.TWILIO_AUTH_TOKEN;

      if (signature) {
        const valid = twilio.validateRequest(authToken, signature, url, params);
        if (!valid) {
          res.sendStatus(403);
          return;
        }
      } else {
        console.warn(
          '[WhatsApp Webhook] Missing X-Twilio-Signature header — skipping validation (unsafe for production).',
        );
      }

      // Ack immediately with empty TwiML — Twilio doesn't need us to send a reply here.
      res.set('Content-Type', 'text/xml');
      res.status(200).send('<Response></Response>');

      const from = (params['From'] ?? '').replace('whatsapp:', '');
      const body = params['Body'] ?? '';
      const numMedia = parseInt(params['NumMedia'] ?? '0', 10);
      const mediaUrl = params['MediaUrl0'];
      const mediaContentType = params['MediaContentType0'];

      if (from) {
        try {
          let media: { url: string; mimeType: string } | undefined;
          if (
            numMedia > 0 &&
            mediaUrl &&
            mediaContentType?.startsWith('image/')
          ) {
            const { twilioAccountSid, twilioAuthToken: mediaAuthToken } =
              await this.providerResolver.getMediaCredentials(tenantId, shopId);
            const buffer = await downloadTwilioMedia(
              mediaUrl,
              twilioAccountSid,
              mediaAuthToken,
            );
            const url = await this.storage.upload(
              mediaStorageKey(tenantId, mediaContentType),
              buffer,
              mediaContentType,
            );
            media = { url, mimeType: mediaContentType };
          }
          if (shopId) {
            await this.bot.processInboundShopModuleMessage(shopId, tenantId, from, body, media);
          } else {
            await this.bot.processInboundMessage(tenantId, from, body, media);
          }
        } catch (err) {
          console.error(
            `[WhatsApp Webhook] Failed processing inbound Twilio message: ${formatWhatsAppError(err)}`,
          );
        }
      }
    } catch (err) {
      next(err);
    }
  };

  private verifyMetaSignature(
    rawBody: Buffer,
    signatureHeader: string,
    appSecret: string,
  ): boolean {
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signatureHeader);
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }
}
