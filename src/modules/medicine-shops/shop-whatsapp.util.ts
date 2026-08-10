import { AppDataSource } from '../../config/database';
import { MedicineShop } from '../../entities/MedicineShop';
import { WhatsAppSession } from '../../entities/WhatsAppSession';
import { AppError } from '../../utils/app-error';

export interface ShopWhatsAppStatus {
  whatsappLinked: boolean;
  whatsappLinkedAt?: Date;
  contactPhone: string;
}

// Unlike a tenant (which owns its own Twilio/Meta WhatsApp Business
// account — see admin.service.ts's getWhatsAppConfig/updateWhatsAppConfig),
// a medicine shop has no WhatsApp Business API account of its own. It's
// just a regular WhatsApp number that talks to the TENANT's bot number —
// so there's no "provider settings" concept to expose here, only the
// shop's own link status and its conversation history with that bot.
export async function getShopWhatsAppStatus(shopId: string): Promise<ShopWhatsAppStatus> {
  const shop = await AppDataSource.getRepository(MedicineShop).findOne({ where: { id: shopId } });
  if (!shop) throw AppError.notFound('Medicine shop');
  return {
    whatsappLinked: shop.whatsappLinked,
    whatsappLinkedAt: shop.whatsappLinkedAt,
    contactPhone: shop.contactPhone,
  };
}

// The shop's own conversation with the tenant's bot lives in the exact
// same whatsapp_sessions table as every patient conversation, keyed by
// {tenantId, phoneNumber} — see whatsapp-bot.service.ts's shop branch.
// Returns null (not an error) if the shop hasn't messaged in yet, since
// "no conversation exists" is the normal pre-link state, not a failure.
export async function getShopWhatsAppSession(shopId: string): Promise<WhatsAppSession | null> {
  const shop = await AppDataSource.getRepository(MedicineShop).findOne({ where: { id: shopId } });
  if (!shop) throw AppError.notFound('Medicine shop');
  return AppDataSource.getRepository(WhatsAppSession).findOne({
    where: { tenantId: shop.tenantId, phoneNumber: shop.contactPhone },
  });
}

// Troubleshooting utility for a stuck conversation (e.g. a tenant admin
// manually replied to this shop's session from the admin side and never
// resumed the bot) — clears awaitingHuman so the bot starts responding to
// this shop again. Owner-only (see requireShopOwner on the route): this
// changes shared conversation state, not a per-staff-member preference.
export async function resetShopWhatsAppSession(shopId: string): Promise<WhatsAppSession> {
  const session = await getShopWhatsAppSession(shopId);
  if (!session) throw AppError.badRequest("You haven't messaged in yet — there's no conversation to reset");
  session.awaitingHuman = false;
  return AppDataSource.getRepository(WhatsAppSession).save(session);
}
