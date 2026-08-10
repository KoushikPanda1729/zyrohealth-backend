import { In } from 'typeorm';
import { AppDataSource } from '../../config/database';
import {
  PrescriptionUploadRequest,
  PrescriptionUploadStatus,
} from '../../entities/PrescriptionUploadRequest';
import {
  MedicineShopQuote,
  MedicineShopQuoteStatus,
  QuoteSubmissionChannel,
  QuotedMedicineItem,
} from '../../entities/MedicineShopQuote';
import { MedicineShop } from '../../entities/MedicineShop';
import { Tenant } from '../../entities/Tenant';
import { MedicineShopAlertsService } from './medicine-shop-alerts.service';

// Plain functions (not a class) deliberately — admin.service.ts (portal
// submissions) and whatsapp-bot.service.ts (WhatsApp-reply submissions)
// both need this same logic, and each already needs to call the OTHER
// side's "send the patient their receipt" capability. Making this a
// dependency-injected service would create a circular constructor
// dependency between AdminService and WhatsAppBotService; a plain
// function taking a `sendReceipt` callback breaks that cycle.

export type SendReceiptFn = (
  tenantId: string,
  request: PrescriptionUploadRequest,
  quote: MedicineShopQuote,
) => Promise<void>;

// When itemized medicines are given, their sum is the authoritative total —
// never trust a client-supplied totalCents that might not match its own
// item breakdown. Falls back to the supplied totalCents for a plain
// lump-sum quote (e.g. a WhatsApp reply, which is never itemized).
export function computeTotalFromItems(
  items?: QuotedMedicineItem[],
): number | undefined {
  if (!items || items.length === 0) return undefined;
  return items.reduce(
    (sum, i) => sum + (i.priceCents ?? 0) * (i.quantity ?? 1),
    0,
  );
}

export async function recordShopQuote(
  quoteId: string,
  data: { totalCents?: number; items?: QuotedMedicineItem[]; note?: string },
  submittedVia: QuoteSubmissionChannel,
  sendReceipt: SendReceiptFn,
  shopAlerts: MedicineShopAlertsService,
): Promise<MedicineShopQuote | null> {
  const quoteRepo = AppDataSource.getRepository(MedicineShopQuote);
  const quote = await quoteRepo.findOne({ where: { id: quoteId } });
  if (!quote) return null;

  const totalCents = computeTotalFromItems(data.items) ?? data.totalCents;
  if (totalCents == null || totalCents <= 0) return null;

  quote.status = MedicineShopQuoteStatus.SUBMITTED;
  quote.totalCents = totalCents;
  quote.items = data.items;
  quote.note = data.note;
  quote.submittedVia = submittedVia;
  quote.submittedAt = new Date();
  await quoteRepo.save(quote);

  await maybeAutoSelect(quote.requestId, sendReceipt, shopAlerts);
  return quote;
}

// Once a quote wins (picked manually, auto-mode, or by the patient), every
// OTHER shop that already submitted a price for the same request is left
// dangling at 'submitted' forever unless told otherwise. Flips them to
// NOT_SELECTED (distinct from DECLINED — the shop didn't opt out, someone
// else was just chosen) and messages each one over WhatsApp — this fires
// regardless of whether the patient ever goes on to pay, since "you lost
// this one" is true the moment a winner is picked.
export async function markSiblingQuotesNotSelected(
  requestId: string,
  winningQuoteId: string,
  shopAlerts: MedicineShopAlertsService,
): Promise<void> {
  const quoteRepo = AppDataSource.getRepository(MedicineShopQuote);
  const siblings = await quoteRepo.find({
    where: { requestId, status: MedicineShopQuoteStatus.SUBMITTED },
  });
  const losers = siblings.filter((q) => q.id !== winningQuoteId);
  if (losers.length === 0) return;

  losers.forEach((q) => {
    q.status = MedicineShopQuoteStatus.NOT_SELECTED;
  });
  await quoteRepo.save(losers);

  const shops = await AppDataSource.getRepository(MedicineShop).findBy({
    id: In(losers.map((q) => q.shopId)),
  });
  const shopById = new Map(shops.map((s) => [s.id, s]));
  for (const quote of losers) {
    const shop = shopById.get(quote.shopId);
    if (!shop) continue;
    await shopAlerts.sendShopMessage(
      shop,
      `This prescription request has been filled by another pharmacy — thanks for quoting! We'll message you again next time.`,
    );
  }
}

export async function declineShopQuote(
  quoteId: string,
  submittedVia: QuoteSubmissionChannel,
): Promise<MedicineShopQuote | null> {
  const quoteRepo = AppDataSource.getRepository(MedicineShopQuote);
  const quote = await quoteRepo.findOne({ where: { id: quoteId } });
  if (!quote) return null;
  quote.status = MedicineShopQuoteStatus.DECLINED;
  quote.submittedVia = submittedVia;
  quote.submittedAt = new Date();
  return quoteRepo.save(quote);
}

// Reactive auto-mode: no scheduler exists in this codebase, so this check
// runs every time a quote is submitted/declined rather than on a timer —
// once every dispatched shop has responded and the tenant has auto-mode
// on, immediately select the cheapest submitted quote and send it.
export async function maybeAutoSelect(
  requestId: string,
  sendReceipt: SendReceiptFn,
  shopAlerts: MedicineShopAlertsService,
): Promise<void> {
  const requestRepo = AppDataSource.getRepository(PrescriptionUploadRequest);
  const request = await requestRepo.findOne({ where: { id: requestId } });
  if (!request || request.status !== PrescriptionUploadStatus.DISPATCHED)
    return;

  const tenant = await AppDataSource.getRepository(Tenant).findOne({
    where: { id: request.tenantId },
  });
  if (!tenant?.medicineOrderAutoMode) return;

  const quotes = await AppDataSource.getRepository(MedicineShopQuote).find({
    where: { requestId },
  });
  if (
    quotes.length === 0 ||
    quotes.some((q) => q.status === MedicineShopQuoteStatus.PENDING)
  ) {
    return;
  }

  const submitted = quotes.filter(
    (q) =>
      q.status === MedicineShopQuoteStatus.SUBMITTED && q.totalCents != null,
  );
  if (submitted.length === 0) return;

  const cheapest = submitted.reduce((a, b) =>
    (a.totalCents ?? Infinity) <= (b.totalCents ?? Infinity) ? a : b,
  );
  request.status = PrescriptionUploadStatus.SENT_TO_PATIENT;
  request.chosenQuoteId = cheapest.id;
  await requestRepo.save(request);

  await markSiblingQuotesNotSelected(requestId, cheapest.id, shopAlerts);
  await sendReceipt(request.tenantId, request, cheapest);
}
