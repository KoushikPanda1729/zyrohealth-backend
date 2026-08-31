import { AppDataSource } from '../../config/database';
import {
  MedicineOrder,
  MedicineOrderStatus,
  MedicineOrderPaymentMethod,
  OrderedMedicineItem,
} from '../../entities/MedicineOrder';
import { MedicineShop } from '../../entities/MedicineShop';
import { PrescriptionUploadRequest } from '../../entities/PrescriptionUploadRequest';
import { MedicineShopQuote } from '../../entities/MedicineShopQuote';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import { decrementStockForOrder } from './catalog.util';
import { MedicineShopAlertsService } from './medicine-shop-alerts.service';
import { formatWhatsAppError } from '../../providers/whatsapp/format-whatsapp-error';

// Extracted from whatsapp-bot.service.ts's private createOrderFromQuote so
// the new channel-agnostic flow engine (whatsapp-flow-engine.service.ts's
// executeOrderPayment, driving the app channel) can create the exact same
// real MedicineOrder a WhatsApp-confirmed order gets — same plain-function-
// taking-a-service-as-a-param convention already used by
// quote-processing.util.ts to dodge a DI cycle (WhatsAppBotService already
// depends on WhatsAppFlowEngineService, so the reverse dependency can't
// exist).
export async function createOrderFromQuote(params: {
  request: PrescriptionUploadRequest;
  quote: MedicineShopQuote;
  deliveryAddress: string;
  deliveryPhone: string;
  sourceNote: string;
  shopAlerts: MedicineShopAlertsService;
  paymentMethod: MedicineOrderPaymentMethod;
}): Promise<MedicineOrder> {
  const { request, quote, deliveryAddress, deliveryPhone, sourceNote, shopAlerts, paymentMethod } = params;

  const items: OrderedMedicineItem[] = quote.items?.length
    ? quote.items.map((i) => ({
        name: i.name,
        quantity: i.quantity ?? 1,
        unitPriceCents: i.priceCents ?? 0,
        subtotalCents: (i.priceCents ?? 0) * (i.quantity ?? 1),
      }))
    : [
        {
          name: 'Prescription order',
          quantity: 1,
          unitPriceCents: quote.totalCents ?? 0,
          subtotalCents: quote.totalCents ?? 0,
        },
      ];
  const totalCents =
    quote.totalCents ?? items.reduce((sum, i) => sum + i.subtotalCents, 0);

  const orderRepo = AppDataSource.getRepository(MedicineOrder);
  // Delivery is a single free-text field either way (a WhatsApp reply or an
  // app form's single address line) — city/state/pincode stay placeholders
  // rather than guessed at from unstructured text.
  const order = orderRepo.create({
    tenantId: request.tenantId,
    patientId: request.patientId,
    shopId: quote.shopId,
    requestId: request.id,
    quoteId: quote.id,
    items,
    totalCents,
    status: MedicineOrderStatus.PLACED,
    paymentMethod,
    deliveryAddressLine1: deliveryAddress,
    deliveryCity: '—',
    deliveryState: '—',
    deliveryPincode: '—',
    deliveryPhone,
    statusHistory: [
      {
        status: MedicineOrderStatus.PLACED,
        at: new Date().toISOString(),
        note: sourceNote,
      },
    ],
  });
  const savedOrder = await orderRepo.save(order);

  // The quote is now a real sale — decrement the shop's own catalog (if
  // they track one) and notify them over WhatsApp if any item just crossed
  // its low-stock threshold. Never lets a catalog problem block the order.
  try {
    const { crossedLowStock } = await decrementStockForOrder(
      quote.shopId,
      items.map((i) => ({ name: i.name, quantity: i.quantity })),
    );
    if (crossedLowStock.length > 0) {
      await notifyShopLowStock(quote.shopId, crossedLowStock, shopAlerts);
    }
  } catch (err) {
    console.error(
      `[MedicineOrder] Stock decrement/low-stock notify failed: ${formatWhatsAppError(err)}`,
    );
  }

  return savedOrder;
}

// Sibling to createOrderFromQuote for the OTHER way an order gets placed —
// straight from a shop's own catalog (Search Medicine over WhatsApp/chat,
// or the web/app catalog browsing page) rather than a shop manually
// quoting an uploaded prescription. No requestId/quoteId since there's no
// prescription/quote involved — price/stock is already known
// deterministically from the catalog itself.
export async function createDirectCatalogOrder(params: {
  tenantId: string;
  patientId: string;
  shopId: string;
  items: { catalogItemId: string; name: string; quantity: number; unitPriceCents: number }[];
  // Structured fields — a real checkout form collects these separately.
  // The WhatsApp/chat flow (which only ever gets one free-text reply) puts
  // everything in line1 and passes '—' placeholders for the rest, same
  // convention createOrderFromQuote already uses for its own address field.
  deliveryAddressLine1: string;
  deliveryAddressLine2?: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPincode: string;
  deliveryPhone: string;
  paymentMethod: MedicineOrderPaymentMethod;
  shopAlerts: MedicineShopAlertsService;
  sourceNote?: string;
}): Promise<MedicineOrder> {
  const {
    tenantId, patientId, shopId, items,
    deliveryAddressLine1, deliveryAddressLine2, deliveryCity, deliveryState, deliveryPincode,
    deliveryPhone, paymentMethod, shopAlerts, sourceNote,
  } = params;

  const orderedItems: OrderedMedicineItem[] = items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    unitPriceCents: i.unitPriceCents,
    subtotalCents: i.unitPriceCents * i.quantity,
    catalogItemId: i.catalogItemId,
  }));
  const totalCents = orderedItems.reduce((sum, i) => sum + i.subtotalCents, 0);

  const orderRepo = AppDataSource.getRepository(MedicineOrder);
  const order = orderRepo.create({
    tenantId,
    patientId,
    shopId,
    items: orderedItems,
    totalCents,
    status: MedicineOrderStatus.PLACED,
    paymentMethod,
    deliveryAddressLine1,
    deliveryAddressLine2,
    deliveryCity,
    deliveryState,
    deliveryPincode,
    deliveryPhone,
    // A shop's own order list (shop.service.ts#listMyOrders) only shows
    // orders with shopNotifiedAt set — that gate exists for the
    // prescription-quote marketplace, where several shops compete for one
    // request and only the tenant admin knows which quote actually won.
    // None of that ambiguity applies here: the patient bought straight from
    // THIS shop's own catalog, so there's nothing to wait on — stamp it
    // immediately so the shop can see and fulfil it right away, same as
    // notifyShopOrderReady does once an admin confirms online payment
    // (this is COD-only for now, so there's no equivalent "payment
    // confirmed" moment to wait for either).
    shopNotifiedAt: new Date(),
    statusHistory: [
      {
        status: MedicineOrderStatus.PLACED,
        at: new Date().toISOString(),
        note: sourceNote ?? 'Ordered directly from shop catalog',
      },
    ],
  });
  const savedOrder = await orderRepo.save(order);

  try {
    const shop = await AppDataSource.getRepository(MedicineShop).findOne({ where: { id: shopId } });
    if (shop) {
      const itemLines = orderedItems.map((i) => `- ${i.quantity} x ${i.name}`).join('\n');
      const address = [deliveryAddressLine1, deliveryAddressLine2, deliveryCity, deliveryState, deliveryPincode]
        .filter(Boolean)
        .join(', ');
      await shopAlerts.sendShopMessage(
        shop,
        `🛒 New order ${savedOrder.id.slice(0, 8)} (Cash on Delivery) — ₹${(totalCents / 100).toFixed(2)}\n\n${itemLines}\n\nDeliver to: ${address}\nContact: ${deliveryPhone}`,
      );
    }
  } catch (err) {
    console.error(`[MedicineOrder] Shop notify failed: ${formatWhatsAppError(err)}`);
  }

  try {
    const { crossedLowStock } = await decrementStockForOrder(
      shopId,
      orderedItems.map((i) => ({ name: i.name, quantity: i.quantity })),
    );
    if (crossedLowStock.length > 0) {
      await notifyShopLowStock(shopId, crossedLowStock, shopAlerts);
    }
  } catch (err) {
    console.error(
      `[MedicineOrder] Stock decrement/low-stock notify failed: ${formatWhatsAppError(err)}`,
    );
  }

  return savedOrder;
}

async function notifyShopLowStock(
  shopId: string,
  items: MedicineShopCatalogItem[],
  shopAlerts: MedicineShopAlertsService,
): Promise<void> {
  const shop = await AppDataSource.getRepository(MedicineShop).findOne({
    where: { id: shopId },
  });
  if (!shop) return;

  const lines = items
    .map((i) => `- ${i.name}: ${i.quantity} ${i.unit} left`)
    .join('\n');
  const text = `⚠️ Low stock alert!\n\n${lines}\n\nUpdate your quantities in the shop portal once you restock.`;
  await shopAlerts.sendShopMessage(shop, text);

  const itemRepo = AppDataSource.getRepository(MedicineShopCatalogItem);
  items.forEach((i) => {
    i.lastLowStockAlertAt = new Date();
  });
  await itemRepo.save(items);
}
