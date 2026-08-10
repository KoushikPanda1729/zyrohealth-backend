import { AppDataSource } from '../../config/database';
import { MedicineShop } from '../../entities/MedicineShop';
import {
  MedicineShopWhatsAppConfig,
} from '../../entities/MedicineShopWhatsAppConfig';
import { WhatsAppProviderType } from '../../entities/TenantWhatsAppConfig';
import {
  WhatsAppFlow,
  WhatsAppFlowDefinition,
} from '../../entities/WhatsAppFlow';
import { WhatsAppSession } from '../../entities/WhatsAppSession';
import { AppError } from '../../utils/app-error';
import { encryptSecret } from '../../utils/crypto.util';
import { IAiProvider } from '../../providers/ai/ai.provider.interface';
import { FLOW_GENERATION_SYSTEM_PROMPT } from '../whatsapp/whatsapp-flow-generation.prompt';
import { parseGeneratedFlow } from '../whatsapp/whatsapp-flow-parse.util';
import { WhatsAppNotificationService } from '../notifications/whatsapp-notification.service';

// Every function here operates on a standalone shop's OWN independent
// WhatsApp module — a completely separate concern from shop-whatsapp.util.ts
// (which handles the shop replying to a TENANT's quote requests on the
// TENANT's number). There is no "platform default" fallback for any of
// this: unlike a tenant, a shop with the module disabled — or enabled but
// not yet configured — simply has no working WhatsApp presence here.

async function requireEnabledShop(shopId: string): Promise<MedicineShop> {
  const shop = await AppDataSource.getRepository(MedicineShop).findOne({ where: { id: shopId } });
  if (!shop) throw AppError.notFound('Medicine shop');
  if (!shop.whatsappModuleEnabled) {
    throw AppError.forbidden(
      'Your WhatsApp module isn’t enabled yet — ask the platform team to turn it on for your shop',
    );
  }
  return shop;
}

// Inbound-webhook routing: does the number that just received a message
// belong to a standalone shop's own enabled module? Mirrors
// resolveTenantIdForNumber (permissions.util.ts) exactly, but returns
// undefined (not a fallback default) when there's no match — a shop
// number that doesn't match anything just falls through to normal tenant
// resolution, unchanged.
export async function resolveShopIdForNumber(toNumber?: string): Promise<string | undefined> {
  if (!toNumber) return undefined;
  const shop = await AppDataSource.getRepository(MedicineShop).findOne({
    where: { whatsappModuleFromNumber: toNumber, whatsappModuleEnabled: true },
  });
  return shop?.id;
}

// Gupshup equivalent of resolveShopIdForNumber — routes by Gupshup app name
// instead of a receiving phone number, same reasoning as
// resolveTenantIdForGupshupApp (permissions.util.ts).
export async function resolveShopIdForGupshupApp(appName?: string): Promise<string | undefined> {
  if (!appName) return undefined;
  const config = await AppDataSource.getRepository(MedicineShopWhatsAppConfig).findOne({
    where: { gupshupAppName: appName, provider: WhatsAppProviderType.GUPSHUP },
  });
  if (!config) return undefined;
  const shop = await AppDataSource.getRepository(MedicineShop).findOne({
    where: { id: config.shopId, whatsappModuleEnabled: true },
  });
  return shop?.id;
}

export async function getShopModuleStatus(
  shopId: string,
): Promise<{ enabled: boolean; enabledAt?: Date }> {
  const shop = await AppDataSource.getRepository(MedicineShop).findOne({ where: { id: shopId } });
  if (!shop) throw AppError.notFound('Medicine shop');
  return { enabled: shop.whatsappModuleEnabled, enabledAt: shop.whatsappModuleEnabledAt };
}

// ── Provider config ──────────────────────────────────────────────────────

export async function getShopModuleConfig(shopId: string): Promise<{
  provider: WhatsAppProviderType | null;
  configured: boolean;
  twilioAccountSid?: string;
  twilioFromNumber?: string;
  hasTwilioAuthToken: boolean;
  metaPhoneNumberId?: string;
  metaApiVersion?: string;
  hasMetaAccessToken: boolean;
  hasMetaAppSecret: boolean;
  gupshupSourceNumber?: string;
  gupshupAppName?: string;
  hasGupshupApiKey: boolean;
  hasGupshupWebhookSecret: boolean;
}> {
  await requireEnabledShop(shopId);
  const config = await AppDataSource.getRepository(MedicineShopWhatsAppConfig).findOne({
    where: { shopId },
  });
  if (!config) {
    return {
      provider: null,
      configured: false,
      hasTwilioAuthToken: false,
      hasMetaAccessToken: false,
      hasMetaAppSecret: false,
      hasGupshupApiKey: false,
      hasGupshupWebhookSecret: false,
    };
  }
  return {
    provider: config.provider,
    configured: true,
    twilioAccountSid: config.twilioAccountSid,
    twilioFromNumber: config.twilioFromNumber,
    hasTwilioAuthToken: Boolean(config.twilioAuthToken),
    metaPhoneNumberId: config.metaPhoneNumberId,
    metaApiVersion: config.metaApiVersion,
    hasMetaAccessToken: Boolean(config.metaAccessToken),
    hasMetaAppSecret: Boolean(config.metaAppSecret),
    gupshupSourceNumber: config.gupshupSourceNumber,
    gupshupAppName: config.gupshupAppName,
    hasGupshupApiKey: Boolean(config.gupshupApiKey),
    hasGupshupWebhookSecret: Boolean(config.gupshupWebhookSecret),
  };
}

export async function updateShopModuleConfig(
  shopId: string,
  data: {
    provider: WhatsAppProviderType;
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    twilioFromNumber?: string;
    metaPhoneNumberId?: string;
    metaAccessToken?: string;
    metaAppSecret?: string;
    metaApiVersion?: string;
    gupshupApiKey?: string;
    gupshupSourceNumber?: string;
    gupshupAppName?: string;
    gupshupWebhookSecret?: string;
  },
): Promise<{ provider: WhatsAppProviderType }> {
  await requireEnabledShop(shopId);
  const repo = AppDataSource.getRepository(MedicineShopWhatsAppConfig);
  let config = await repo.findOne({ where: { shopId } });
  const isNew = !config;
  if (!config) {
    config = repo.create({ shopId, provider: data.provider });
  } else {
    config.provider = data.provider;
  }

  if (data.twilioAccountSid !== undefined) config.twilioAccountSid = data.twilioAccountSid;
  if (data.twilioFromNumber !== undefined) config.twilioFromNumber = data.twilioFromNumber;
  if (data.twilioAuthToken) {
    config.twilioAuthToken = encryptSecret(data.twilioAuthToken);
  } else if (isNew && data.provider === WhatsAppProviderType.TWILIO) {
    throw AppError.badRequest('Twilio Auth Token is required');
  }
  if (
    isNew &&
    data.provider === WhatsAppProviderType.TWILIO &&
    (!data.twilioAccountSid || !data.twilioFromNumber)
  ) {
    throw AppError.badRequest('Twilio Account SID and From Number are required');
  }

  if (data.metaPhoneNumberId !== undefined) config.metaPhoneNumberId = data.metaPhoneNumberId;
  if (data.metaApiVersion !== undefined) config.metaApiVersion = data.metaApiVersion;
  if (data.metaAccessToken) {
    config.metaAccessToken = encryptSecret(data.metaAccessToken);
  } else if (isNew && data.provider === WhatsAppProviderType.META) {
    throw AppError.badRequest('Meta Access Token is required');
  }
  if (data.metaAppSecret) {
    config.metaAppSecret = encryptSecret(data.metaAppSecret);
  } else if (isNew && data.provider === WhatsAppProviderType.META) {
    throw AppError.badRequest('Meta App Secret is required');
  }
  if (isNew && data.provider === WhatsAppProviderType.META && !data.metaPhoneNumberId) {
    throw AppError.badRequest('Meta Phone Number ID is required');
  }

  if (data.gupshupSourceNumber !== undefined) config.gupshupSourceNumber = data.gupshupSourceNumber;
  if (data.gupshupAppName !== undefined) config.gupshupAppName = data.gupshupAppName;
  if (data.gupshupApiKey) {
    config.gupshupApiKey = encryptSecret(data.gupshupApiKey);
  } else if (isNew && data.provider === WhatsAppProviderType.GUPSHUP) {
    throw AppError.badRequest('Gupshup API Key is required');
  }
  if (data.gupshupWebhookSecret) {
    config.gupshupWebhookSecret = encryptSecret(data.gupshupWebhookSecret);
  } else if (isNew && data.provider === WhatsAppProviderType.GUPSHUP) {
    throw AppError.badRequest('A webhook secret is required — Gupshup has no built-in signature verification, so this app-chosen value is what protects your callback URL');
  }
  if (
    isNew &&
    data.provider === WhatsAppProviderType.GUPSHUP &&
    (!data.gupshupSourceNumber || !data.gupshupAppName)
  ) {
    throw AppError.badRequest('Gupshup Source Number and App Name are required');
  }

  const saved = await repo.save(config);
  return { provider: saved.provider };
}

// ── Flows ─────────────────────────────────────────────────────────────────

export async function listShopFlows(shopId: string): Promise<WhatsAppFlow[]> {
  await requireEnabledShop(shopId);
  return AppDataSource.getRepository(WhatsAppFlow).find({
    where: { shopId },
    order: { updatedAt: 'DESC' },
  });
}

export async function getShopFlow(shopId: string, id: string): Promise<WhatsAppFlow> {
  await requireEnabledShop(shopId);
  const flow = await AppDataSource.getRepository(WhatsAppFlow).findOne({ where: { id, shopId } });
  if (!flow) throw AppError.notFound('Flow');
  return flow;
}

export async function createShopFlow(shopId: string, name: string): Promise<WhatsAppFlow> {
  const shop = await requireEnabledShop(shopId);
  const repo = AppDataSource.getRepository(WhatsAppFlow);
  const flow = repo.create({
    tenantId: shop.tenantId,
    shopId,
    name,
    isActive: false,
    definition: { nodes: [], edges: [] },
  });
  return repo.save(flow);
}

export async function generateShopFlow(
  ai: IAiProvider,
  shopId: string,
  name: string,
  prompt: string,
): Promise<WhatsAppFlow> {
  const shop = await requireEnabledShop(shopId);
  const result = await ai.chat({
    messages: [{ role: 'user', content: prompt }],
    systemPrompt: FLOW_GENERATION_SYSTEM_PROMPT,
    patientContext: { bloodGroup: '', allergies: [], chronicConditions: [], history: [] },
    sessionId: `shop-whatsapp-flow-generation-${shopId}`,
  });
  const definition = parseGeneratedFlow(result.reply);

  const repo = AppDataSource.getRepository(WhatsAppFlow);
  const flow = repo.create({ tenantId: shop.tenantId, shopId, name, isActive: false, definition });
  return repo.save(flow);
}

export async function editShopFlowWithAi(
  ai: IAiProvider,
  shopId: string,
  flowId: string,
  prompt: string,
): Promise<WhatsAppFlow> {
  await requireEnabledShop(shopId);
  const repo = AppDataSource.getRepository(WhatsAppFlow);
  const flow = await repo.findOne({ where: { id: flowId, shopId } });
  if (!flow) throw AppError.notFound('Flow');

  const hasExistingContent = flow.definition.nodes.length > 0;
  const userMessage = hasExistingContent
    ? `Here is the CURRENT flow definition as JSON:\n${JSON.stringify(flow.definition)}\n\n` +
      `Modify or extend this flow according to the instruction below, keeping any parts that aren't ` +
      `mentioned unchanged. Return the FULL updated flow definition (all nodes and edges, not just the new ones).\n\n` +
      `Instruction: ${prompt}`
    : prompt;

  const result = await ai.chat({
    messages: [{ role: 'user', content: userMessage }],
    systemPrompt: FLOW_GENERATION_SYSTEM_PROMPT,
    patientContext: { bloodGroup: '', allergies: [], chronicConditions: [], history: [] },
    sessionId: `shop-whatsapp-flow-generation-${shopId}`,
  });

  flow.definition = parseGeneratedFlow(result.reply);
  return repo.save(flow);
}

export async function updateShopFlow(
  shopId: string,
  id: string,
  updates: { name?: string; definition?: WhatsAppFlowDefinition },
): Promise<WhatsAppFlow> {
  await requireEnabledShop(shopId);
  const repo = AppDataSource.getRepository(WhatsAppFlow);
  const flow = await repo.findOne({ where: { id, shopId } });
  if (!flow) throw AppError.notFound('Flow');
  if (updates.name !== undefined) flow.name = updates.name;
  if (updates.definition !== undefined) flow.definition = updates.definition;
  return repo.save(flow);
}

export async function activateShopFlow(shopId: string, id: string): Promise<WhatsAppFlow> {
  await requireEnabledShop(shopId);
  const repo = AppDataSource.getRepository(WhatsAppFlow);
  const flow = await repo.findOne({ where: { id, shopId } });
  if (!flow) throw AppError.notFound('Flow');
  await repo.update({ shopId, isActive: true }, { isActive: false });
  flow.isActive = true;
  return repo.save(flow);
}

export async function deactivateShopFlow(shopId: string, id: string): Promise<WhatsAppFlow> {
  await requireEnabledShop(shopId);
  const repo = AppDataSource.getRepository(WhatsAppFlow);
  const flow = await repo.findOne({ where: { id, shopId } });
  if (!flow) throw AppError.notFound('Flow');
  flow.isActive = false;
  return repo.save(flow);
}

export async function deleteShopFlow(shopId: string, id: string): Promise<void> {
  await requireEnabledShop(shopId);
  const result = await AppDataSource.getRepository(WhatsAppFlow).delete({ id, shopId });
  if (!result.affected) throw AppError.notFound('Flow');
}

// ── Sessions (this shop's own direct customers) ─────────────────────────

export async function listShopModuleSessions(
  shopId: string,
  page: number,
  limit: number,
  awaitingHuman?: boolean,
): Promise<{ data: WhatsAppSession[]; total: number }> {
  await requireEnabledShop(shopId);
  const where: Record<string, unknown> = { shopId };
  if (awaitingHuman !== undefined) where['awaitingHuman'] = awaitingHuman;
  const [data, total] = await AppDataSource.getRepository(WhatsAppSession).findAndCount({
    where,
    order: { lastMessageAt: 'DESC' },
    skip: (page - 1) * limit,
    take: limit,
  });
  return { data, total };
}

export async function getShopModuleSessionDetail(
  shopId: string,
  id: string,
): Promise<WhatsAppSession> {
  await requireEnabledShop(shopId);
  const session = await AppDataSource.getRepository(WhatsAppSession).findOne({
    where: { id, shopId },
  });
  if (!session) throw AppError.notFound('WhatsApp session');
  return session;
}

export async function resumeShopModuleSessionBot(
  shopId: string,
  id: string,
): Promise<WhatsAppSession> {
  await requireEnabledShop(shopId);
  const repo = AppDataSource.getRepository(WhatsAppSession);
  const session = await repo.findOne({ where: { id, shopId } });
  if (!session) throw AppError.notFound('WhatsApp session');
  session.awaitingHuman = false;
  return repo.save(session);
}

export async function replyToShopModuleSession(
  notification: WhatsAppNotificationService,
  shopId: string,
  id: string,
  text: string,
): Promise<WhatsAppSession> {
  const shop = await requireEnabledShop(shopId);
  const repo = AppDataSource.getRepository(WhatsAppSession);
  const session = await repo.findOne({ where: { id, shopId } });
  if (!session) throw AppError.notFound('WhatsApp session');

  await notification.sendRaw(shop.tenantId, session.phoneNumber, text, shopId);

  session.messages = [
    ...session.messages,
    { role: 'admin', content: text, timestamp: new Date().toISOString() },
  ];
  session.awaitingHuman = true;
  session.lastMessageAt = new Date();
  return repo.save(session);
}
