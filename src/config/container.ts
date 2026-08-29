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
import {
  AUTH_PROVIDER,
  AI_PROVIDER,
  PAYMENT_PROVIDER,
  STORAGE_PROVIDER,
  WHATSAPP_PROVIDER,
} from './di-tokens';

// Re-exported so existing `import { X_PROVIDER } from '../../config/container'`
// call sites keep working unchanged — only provider classes that container.ts
// itself imports (and therefore can't import back from) need to switch to
// importing straight from di-tokens.ts instead. See di-tokens.ts for why.
export { AUTH_PROVIDER, AI_PROVIDER, PAYMENT_PROVIDER, STORAGE_PROVIDER, WHATSAPP_PROVIDER };

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
