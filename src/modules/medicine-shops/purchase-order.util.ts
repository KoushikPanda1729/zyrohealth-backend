import { AppDataSource } from '../../config/database';
import {
  MedicineShopPurchaseOrder,
  PurchaseOrderLineItem,
  PurchaseOrderStatus,
} from '../../entities/MedicineShopPurchaseOrder';
import { MedicineShopSupplier } from '../../entities/MedicineShopSupplier';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import { AppError } from '../../utils/app-error';
import { addBatch } from './batch.util';
import { suggestReorderQuantity, isLowStock } from './reorder.util';

export interface CreatePurchaseOrderInput {
  supplierId?: string | null;
  items: PurchaseOrderLineItem[];
  note?: string | null;
}

function validateItems(items: PurchaseOrderLineItem[]): void {
  if (!items || items.length === 0) {
    throw AppError.badRequest('At least one item is required');
  }
  for (const item of items) {
    if (!item.name) throw AppError.badRequest('Each item needs a name');
    if (!item.quantity || item.quantity <= 0) {
      throw AppError.badRequest(`Quantity for "${item.name}" must be greater than 0`);
    }
  }
}

export async function listPurchaseOrders(shopId: string): Promise<MedicineShopPurchaseOrder[]> {
  return AppDataSource.getRepository(MedicineShopPurchaseOrder).find({
    where: { shopId },
    order: { createdAt: 'DESC' },
  });
}

export async function getPurchaseOrder(
  shopId: string,
  poId: string,
): Promise<MedicineShopPurchaseOrder> {
  const po = await AppDataSource.getRepository(MedicineShopPurchaseOrder).findOne({
    where: { id: poId, shopId },
  });
  if (!po) throw AppError.notFound('Purchase order');
  return po;
}

export async function createPurchaseOrder(
  shopId: string,
  tenantId: string,
  data: CreatePurchaseOrderInput,
): Promise<MedicineShopPurchaseOrder> {
  validateItems(data.items);
  const repo = AppDataSource.getRepository(MedicineShopPurchaseOrder);
  const po = repo.create({
    shopId,
    tenantId,
    supplierId: data.supplierId ?? undefined,
    items: data.items,
    note: data.note ?? undefined,
    status: PurchaseOrderStatus.DRAFT,
  });
  return repo.save(po);
}

// Splits a shop's low-stock items into one DRAFT purchase order per
// supplier automatically — a shop's shortage list rarely comes from a
// single supplier, and without this a shop has to manually work out
// "which of these 8 low-stock medicines does Supplier A actually sell"
// every time. Items with no preferredSupplierId tagged (see
// MedicineShopCatalogItem) land in one shared "no supplier" draft instead
// of being silently dropped, so nothing low-stock goes unordered just
// because it was never tagged.
export async function createPurchaseOrdersFromLowStock(
  shopId: string,
  tenantId: string,
): Promise<MedicineShopPurchaseOrder[]> {
  const itemRepo = AppDataSource.getRepository(MedicineShopCatalogItem);
  const items = await itemRepo.find({ where: { shopId } });
  const lowStockItems = items.filter(isLowStock);
  if (lowStockItems.length === 0) return [];

  // A draft/sent PO doesn't change the item's quantity — only Receive
  // does — so without this check, clicking this action again while
  // still waiting on a delivery would keep creating duplicate orders for
  // the exact same shortage every time.
  const poRepo = AppDataSource.getRepository(MedicineShopPurchaseOrder);
  const openOrders = await poRepo.find({
    where: [
      { shopId, status: PurchaseOrderStatus.DRAFT },
      { shopId, status: PurchaseOrderStatus.SENT },
    ],
  });
  const alreadyOnOrder = new Set(
    openOrders.flatMap((po) => po.items.map((i) => i.catalogItemId).filter(Boolean)),
  );
  const unorderedLowStockItems = lowStockItems.filter((item) => !alreadyOnOrder.has(item.id));
  if (unorderedLowStockItems.length === 0) return [];

  const bySupplier = new Map<string | null, MedicineShopCatalogItem[]>();
  for (const item of unorderedLowStockItems) {
    const key = item.preferredSupplierId ?? null;
    const list = bySupplier.get(key) ?? [];
    list.push(item);
    bySupplier.set(key, list);
  }

  const created: MedicineShopPurchaseOrder[] = [];
  for (const [supplierId, groupItems] of bySupplier) {
    const po = poRepo.create({
      shopId,
      tenantId,
      supplierId: supplierId ?? undefined,
      status: PurchaseOrderStatus.DRAFT,
      items: groupItems.map((item) => ({
        catalogItemId: item.id,
        name: item.name,
        quantity: suggestReorderQuantity(item),
        unit: item.unit,
      })),
    });
    created.push(await poRepo.save(po));
  }
  return created;
}

function buildPurchaseOrderText(po: MedicineShopPurchaseOrder, shopName: string): string {
  const lines = po.items
    .map((i) => `- ${i.name}: ${i.quantity} ${i.unit}`)
    .join('\n');
  return `Purchase order from ${shopName}\n\n${lines}${po.note ? `\n\nNote: ${po.note}` : ''}`;
}

// Sent as a wa.me deep link the SHOP OWNER taps to open WhatsApp with the
// message pre-filled and sends from their own personal number — not via
// the platform's WhatsApp Business API. A supplier who has never messaged
// this platform can't be reached by the API directly (a free-form
// sendText only works within a 24h window the recipient opens by
// messaging first; a cold PO would need a pre-approved template, which
// this platform doesn't have set up) — a wa.me link sidesteps that
// entirely since it's not the platform's number sending it.
export async function markPurchaseOrderSent(
  shopId: string,
  poId: string,
  shopName: string,
): Promise<{ purchaseOrder: MedicineShopPurchaseOrder; whatsappShareLink?: string }> {
  const repo = AppDataSource.getRepository(MedicineShopPurchaseOrder);
  const po = await getPurchaseOrder(shopId, poId);
  if (po.status !== PurchaseOrderStatus.DRAFT) {
    throw AppError.badRequest('Only a draft purchase order can be marked sent');
  }
  // Nothing to send it TO — without a supplier there's no phone number to
  // generate a WhatsApp link for, so "sent" would be a meaningless status.
  if (!po.supplierId) {
    throw AppError.badRequest('Assign a supplier before sending this order');
  }
  po.status = PurchaseOrderStatus.SENT;
  po.sentAt = new Date();
  await repo.save(po);

  let whatsappShareLink: string | undefined;
  if (po.supplierId) {
    const supplier = await AppDataSource.getRepository(MedicineShopSupplier).findOne({
      where: { id: po.supplierId },
    });
    if (supplier?.phone) {
      const digits = supplier.phone.replace(/[^\d]/g, '');
      const text = encodeURIComponent(buildPurchaseOrderText(po, shopName));
      whatsappShareLink = `https://wa.me/${digits}?text=${text}`;
    }
  }

  return { purchaseOrder: po, whatsappShareLink };
}

// Restocks every line item that maps to a real catalog item (some PO
// lines may just be free text for something not yet in the catalog) and,
// if a batch/expiry was noted on the line, records a real batch entry —
// closing the loop from "low stock" through to "expiry tracked" in one
// action instead of a shop having to remember to add the batch separately.
export async function markPurchaseOrderReceived(
  shopId: string,
  tenantId: string,
  poId: string,
): Promise<MedicineShopPurchaseOrder> {
  const repo = AppDataSource.getRepository(MedicineShopPurchaseOrder);
  const po = await getPurchaseOrder(shopId, poId);
  if (po.status === PurchaseOrderStatus.RECEIVED) {
    throw AppError.badRequest('This purchase order was already marked received');
  }
  if (po.status === PurchaseOrderStatus.CANCELLED) {
    throw AppError.badRequest('A cancelled purchase order cannot be received');
  }

  for (const item of po.items) {
    if (!item.catalogItemId) continue;
    try {
      await addBatch(shopId, tenantId, item.catalogItemId, {
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        quantity: item.quantity,
      });
    } catch (err) {
      // A line referencing a catalog item that was deleted since the PO
      // was created shouldn't block receiving the rest of the order.
      console.error(`[PurchaseOrder] Failed to restock line "${item.name}":`, err);
    }
  }

  po.status = PurchaseOrderStatus.RECEIVED;
  po.receivedAt = new Date();
  return repo.save(po);
}

export async function cancelPurchaseOrder(
  shopId: string,
  poId: string,
): Promise<MedicineShopPurchaseOrder> {
  const repo = AppDataSource.getRepository(MedicineShopPurchaseOrder);
  const po = await getPurchaseOrder(shopId, poId);
  if (po.status === PurchaseOrderStatus.RECEIVED) {
    throw AppError.badRequest('A received purchase order cannot be cancelled');
  }
  po.status = PurchaseOrderStatus.CANCELLED;
  return repo.save(po);
}

// Deletable at any status, by explicit request — this only removes the PO
// record itself, it does NOT reverse a Receive's stock/batch changes (see
// markPurchaseOrderReceived). The frontend's confirm dialog says as much
// for a received order so this isn't mistaken for an "undo."
export async function deletePurchaseOrder(shopId: string, poId: string): Promise<void> {
  await getPurchaseOrder(shopId, poId);
  await AppDataSource.getRepository(MedicineShopPurchaseOrder).delete({ id: poId, shopId });
}

// Only a draft can still be changed — once sent, the supplier already has
// whatever was in it at that moment; editing it afterward would silently
// diverge from what was actually communicated.
export async function updatePurchaseOrder(
  shopId: string,
  poId: string,
  data: CreatePurchaseOrderInput,
): Promise<MedicineShopPurchaseOrder> {
  const repo = AppDataSource.getRepository(MedicineShopPurchaseOrder);
  const po = await getPurchaseOrder(shopId, poId);
  if (po.status !== PurchaseOrderStatus.DRAFT) {
    throw AppError.badRequest('Only a draft purchase order can be edited');
  }
  validateItems(data.items);
  po.supplierId = data.supplierId ?? undefined;
  po.items = data.items;
  po.note = data.note ?? undefined;
  return repo.save(po);
}
