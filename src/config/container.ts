import 'reflect-metadata';
import { container } from 'tsyringe';
import { TwilioAuthProvider } from '../providers/auth/twilio.provider';
import { DevAuthProvider } from '../providers/auth/dev.provider';
import { OpenAiProvider } from '../providers/ai/openai.provider';
import { StripePaymentProvider } from '../providers/payment/stripe.provider';
import { S3StorageProvider } from '../providers/storage/s3.provider';
import { DevWhatsAppProvider } from '../providers/whatsapp/dev.provider';
import { FailoverWhatsAppProvider } from '../providers/whatsapp/failover-whatsapp.provider';
import { env } from './env';

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');
export const AI_PROVIDER = Symbol('AI_PROVIDER');
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

// Use the dev OTP provider (fixed code 123456, no SMS) when not in production,
// or when AUTH_DEV_OTP=true is set explicitly (useful for staging without a paid SMS gateway).
// AUTH_DEV_OTP=false overrides this to force real Twilio SMS even outside production
// (useful for testing real delivery locally).
const useDevOtp =
  process.env['AUTH_DEV_OTP'] === 'false'
    ? false
    : process.env['NODE_ENV'] !== 'production' ||
      process.env['AUTH_DEV_OTP'] === 'true';
container.register(AUTH_PROVIDER, {
  useClass: useDevOtp ? DevAuthProvider : TwilioAuthProvider,
});
container.register(AI_PROVIDER, { useClass: OpenAiProvider });
container.register(PAYMENT_PROVIDER, { useClass: StripePaymentProvider });
container.register(STORAGE_PROVIDER, { useClass: S3StorageProvider });

// dev mode just console-logs — no need for failover. twilio/meta both route
// through FailoverWhatsAppProvider, which tries the configured primary first
// and automatically falls back to the other if it also has credentials set.
container.register(WHATSAPP_PROVIDER, {
  useClass:
    env.WHATSAPP_PROVIDER === 'dev'
      ? DevWhatsAppProvider
      : FailoverWhatsAppProvider,
});

export { container };
