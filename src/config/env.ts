import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DB_HOST: z.string().min(1),
  DB_PORT: z.string().transform(Number),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_FROM_NUMBER: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().default('gpt-4o'),
  AI_MAX_TOKENS: z
    .preprocess((v) => (v === undefined ? 2048 : Number(v)), z.number())
    .default(2048),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),
  STORAGE_BUCKET_NAME: z.string().min(1),
  STORAGE_REGION: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  PORT: z
    .preprocess((v) => (v === undefined ? 3001 : Number(v)), z.number())
    .default(3001),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  SOCKET_CORS_ORIGIN: z
    .string()
    .default(
      'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003',
    ),
  LIVEKIT_URL: z.string().default('ws://localhost:7880'),
  LIVEKIT_API_KEY: z.string().default('devkey'),
  LIVEKIT_API_SECRET: z.string().default('secret'),
  WHATSAPP_PROVIDER: z.enum(['twilio', 'meta', 'dev']).default('dev'),
  TWILIO_WHATSAPP_FROM_NUMBER: z.string().default(''),
  TWILIO_WHATSAPP_TEMPLATE_MAP: z.string().default('{}'),
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  META_WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  META_WHATSAPP_API_VERSION: z.string().default('v21.0'),
  META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default(''),
  META_WHATSAPP_APP_SECRET: z.string().default(''),
  GUPSHUP_API_KEY: z.string().default(''),
  GUPSHUP_SOURCE_NUMBER: z.string().default(''),
  GUPSHUP_APP_NAME: z.string().default(''),
  GUPSHUP_WEBHOOK_SECRET: z.string().default(''),
  AGENT_SERVICE_URL: z.string().optional(),
  AGENT_SERVICE_TOKEN: z.string().optional(),
  LIVEKIT_TOKEN_TTL_MIN: z
    .preprocess((v) => (v === undefined ? 60 : Number(v)), z.number())
    .default(60),
  SIP_TRUNK_ADDRESS: z.string().optional(),
  BACKEND_INTERNAL_TOKEN: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
  // Encrypts tenant-supplied secrets stored in the DB (e.g. per-tenant
  // WhatsApp provider credentials). The default is fine for local dev only
  // — set a real random value in production.
  SECRETS_ENCRYPTION_KEY: z
    .string()
    .min(16)
    .default('dev-only-insecure-key-change-in-production'),
  // Base URL of the admin panel — used to build "set your password" invite
  // links. There's no email-sending provider wired up yet, so the raw link
  // is shown to whoever creates the invite to copy and share manually.
  ADMIN_PANEL_URL: z.string().default('http://localhost:3000'),
  // Root domain tenant admin portals live under (<subdomain>.<this>). Empty
  // in local dev — subdomain-based CORS/tenant-portal checks are simply
  // skipped when unset, since there's no wildcard DNS/cert locally.
  TENANT_ROOT_DOMAIN: z.string().default(''),
  // Patient-facing web app + Play Store listing — sent to a WhatsApp sender
  // who has no ZyroHealth account yet, so "please sign up first" is an
  // actual tappable link instead of a dead end. PATIENT_PLAYSTORE_URL is
  // deliberately blank by default (no real published app to link to yet)
  // and is only mentioned once a real one is configured.
  PATIENT_WEB_URL: z.string().default('http://localhost:3002'),
  PATIENT_PLAYSTORE_URL: z.string().default(''),
});

type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Missing or invalid env vars: ${missing}`);
  }
  return result.data;
}

export const env = loadEnv();
