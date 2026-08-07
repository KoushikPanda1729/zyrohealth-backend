import { AppDataSource } from '../../config/database';
import {
  MedicineShopSale,
  SaleLineItem,
  SalePaymentMode,
  ControlledDrugInfo,
} from '../../entities/MedicineShopSale';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import { MedicineShopCustomer } from '../../entities/MedicineShopCustomer';
import {
  MedicineShopCustomerLedgerEntry,
  CustomerLedgerEntryType,
} from '../../entities/MedicineShopCustomerLedgerEntry';
import { StockMovementReason } from '../../entities/MedicineShopStockMovement';
import { saveCatalogItemWithLedger } from './catalog.util';
import { AppError } from '../../utils/app-error';

export interface SaleLineItemInput {
  catalogItemId?: string;
  name: string;
  quantity: number;
  unit?: string;
}

export interface CreateSaleInput {
  customerId?: string | null;
  customerName?: string | null;
  items: SaleLineItemInput[];
  paymentMode: SalePaymentMode;
  amountPaidCents?: number;
  controlledDrugInfo?: ControlledDrugInfo | null;
  note?: string | null;
}

function gstSplit(subtotalCents: number, gstRatePercent: number): number {
  return Math.round((subtotalCents * gstRatePercent) / 100);
}

// Sequential per shop (not globally) — a GST invoice must be numbered
// sequentially, but there's no shared counter table; the small race
// window under truly concurrent counter billing is an accepted
// simplification for a single-till shop, not a multi-cashier POS.
async function nextInvoiceNumber(shopId: string): Promise<number> {
  const repo = AppDataSource.getRepository(MedicineShopSale);
  const last = await repo.findOne({ where: { shopId }, order: { invoiceNumber: 'DESC' } });
  return (last?.invoiceNumber ?? 0) + 1;
}

// Resolves each line against the live catalog (for price/GST-rate/
// controlled-drug status) when it references a real catalogItemId —
// falls back to a free-text line (price must then come from the request)
// for something not yet in the catalog, same "AI drafts, human confirms /
// free text allowed" tolerance used by purchase-order.util.ts.
async function buildLineItems(
  shopId: string,
  inputs: SaleLineItemInput[],
): Promise<{ items: SaleLineItem[]; subtotalCents: number; gstCents: number; hasControlledDrug: boolean }> {
  if (!inputs || inputs.length === 0) {
    throw AppError.badRequest('At least one item is required');
  }
  const itemRepo = AppDataSource.getRepository(MedicineShopCatalogItem);
  const items: SaleLineItem[] = [];
  let subtotalCents = 0;
  let gstCents = 0;
  let hasControlledDrug = false;

  for (const input of inputs) {
    if (!input.quantity || input.quantity <= 0) {
      throw AppError.badRequest(`Quantity for "${input.name}" must be greater than 0`);
    }
    const catalogItem = input.catalogItemId
      ? await itemRepo.findOne({ where: { id: input.catalogItemId, shopId } })
      : null;
    if (input.catalogItemId && !catalogItem) {
      throw AppError.notFound(`Catalog item for "${input.name}"`);
    }
    if (catalogItem && catalogItem.quantity < input.quantity) {
      throw AppError.badRequest(
        `Only ${catalogItem.quantity} ${catalogItem.unit} of "${catalogItem.name}" in stock`,
      );
    }
    const priceCentsPerUnit = catalogItem?.priceCents ?? 0;
    const gstRatePercent = catalogItem?.gstRatePercent ?? 12;
    const lineSubtotalCents = priceCentsPerUnit * input.quantity;
    const lineGstCents = gstSplit(lineSubtotalCents, gstRatePercent);
    const isControlledDrug = catalogItem?.isControlledDrug ?? false;
    if (isControlledDrug) hasControlledDrug = true;

    items.push({
      catalogItemId: catalogItem?.id,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit ?? catalogItem?.unit ?? 'unit',
      priceCentsPerUnit,
      gstRatePercent,
      lineSubtotalCents,
      lineGstCents,
      lineTotalCents: lineSubtotalCents + lineGstCents,
      isControlledDrug,
    });
    subtotalCents += lineSubtotalCents;
    gstCents += lineGstCents;
  }

  return { items, subtotalCents, gstCents, hasControlledDrug };
}

function validateControlledDrugInfo(info: ControlledDrugInfo | null | undefined): void {
  if (!info?.patientName || !info?.doctorName || !info?.doctorRegNo) {
    throw AppError.badRequest(
      'This sale includes a Schedule H1 medicine — patient name, doctor name, and doctor registration number are required',
    );
  }
}

async function adjustCustomerDue(
  shopId: string,
  tenantId: string,
  customerId: string,
  deltaCents: number,
  type: CustomerLedgerEntryType,
  saleId?: string,
  note?: string,
): Promise<void> {
  if (deltaCents === 0) return;
  const customerRepo = AppDataSource.getRepository(MedicineShopCustomer);
  const customer = await customerRepo.findOne({ where: { id: customerId, shopId } });
  if (!customer) throw AppError.notFound('Customer');
  customer.outstandingDueCents += deltaCents;
  await customerRepo.save(customer);

  await AppDataSource.getRepository(MedicineShopCustomerLedgerEntry).save(
    AppDataSource.getRepository(MedicineShopCustomerLedgerEntry).create({
      shopId,
      tenantId,
      customerId,
      type,
      amountCents: deltaCents,
      balanceAfterCents: customer.outstandingDueCents,
      saleId,
      note,
    }),
  );
}

// The core counter-billing action: prices/GSTs the line items against the
// live catalog, decrements stock through the same ledger every other
// stock-mutating path uses, and — only for a credit sale with a shortfall
// — adds to the customer's running due via the ledger above. A Schedule
// H1 item anywhere in the cart requires patient/doctor info up front,
// enforced here rather than trusted from the client.
export async function createSale(
  shopId: string,
  tenantId: string,
  data: CreateSaleInput,
): Promise<MedicineShopSale> {
  const { items, subtotalCents, gstCents, hasControlledDrug } = await buildLineItems(shopId, data.items);
  if (hasControlledDrug) validateControlledDrugInfo(data.controlledDrugInfo);
  if (data.customerId && !data.paymentMode) {
    throw AppError.badRequest('paymentMode is required');
  }

  const totalCents = subtotalCents + gstCents;
  const amountPaidCents =
    data.paymentMode === SalePaymentMode.CREDIT
      ? (data.amountPaidCents ?? 0)
      : totalCents;
  if (amountPaidCents > totalCents) {
    throw AppError.badRequest('Amount paid cannot exceed the total');
  }
  if (data.paymentMode === SalePaymentMode.CREDIT && !data.customerId) {
    throw AppError.badRequest('A credit sale requires a customer to bill it to');
  }

  const saleRepo = AppDataSource.getRepository(MedicineShopSale);
  const sale = saleRepo.create({
    shopId,
    tenantId,
    invoiceNumber: await nextInvoiceNumber(shopId),
    customerId: data.customerId ?? undefined,
    customerNameSnapshot: data.customerName ?? undefined,
    items,
    subtotalCents,
    gstCents,
    totalCents,
    paymentMode: data.paymentMode,
    amountPaidCents,
    controlledDrugInfo: hasControlledDrug ? data.controlledDrugInfo : undefined,
    note: data.note ?? undefined,
  });
  const saved = await saleRepo.save(sale);

  // Decrement stock for every line that maps to a real catalog item.
  const itemRepo = AppDataSource.getRepository(MedicineShopCatalogItem);
  for (const line of items) {
    if (!line.catalogItemId) continue;
    const catalogItem = await itemRepo.findOne({ where: { id: line.catalogItemId, shopId } });
    if (!catalogItem) continue;
    const previousQuantity = catalogItem.quantity;
    catalogItem.quantity = Math.max(0, previousQuantity - line.quantity);
    await saveCatalogItemWithLedger(
      catalogItem,
      previousQuantity,
      StockMovementReason.SALE,
      `Sale #${saved.invoiceNumber}`,
    );
  }

  const shortfall = totalCents - amountPaidCents;
  if (data.paymentMode === SalePaymentMode.CREDIT && shortfall > 0 && data.customerId) {
    await adjustCustomerDue(
      shopId,
      tenantId,
      data.customerId,
      shortfall,
      CustomerLedgerEntryType.SALE,
      saved.id,
      `Sale #${saved.invoiceNumber}`,
    );
  }

  return saved;
}

export async function listSales(
  shopId: string,
  filter: { from?: string; to?: string } = {},
): Promise<MedicineShopSale[]> {
  const repo = AppDataSource.getRepository(MedicineShopSale);
  const qb = repo.createQueryBuilder('sale').where('sale.shop_id = :shopId', { shopId });
  if (filter.from) qb.andWhere('sale.created_at >= :from', { from: new Date(filter.from) });
  if (filter.to) {
    const end = new Date(filter.to);
    end.setUTCHours(23, 59, 59, 999);
    qb.andWhere('sale.created_at <= :to', { to: end });
  }
  return qb.orderBy('sale.created_at', 'DESC').getMany();
}

export async function getSale(shopId: string, saleId: string): Promise<MedicineShopSale> {
  const sale = await AppDataSource.getRepository(MedicineShopSale).findOne({
    where: { id: saleId, shopId },
  });
  if (!sale) throw AppError.notFound('Sale');
  return sale;
}

// ── Controlled-drug (Schedule H1) register ─────────────────────────────
export async function listControlledDrugRegister(
  shopId: string,
  filter: { from?: string; to?: string } = {},
): Promise<MedicineShopSale[]> {
  const repo = AppDataSource.getRepository(MedicineShopSale);
  const qb = repo
    .createQueryBuilder('sale')
    .where('sale.shop_id = :shopId', { shopId })
    .andWhere('sale.controlled_drug_info IS NOT NULL');
  if (filter.from) qb.andWhere('sale.created_at >= :from', { from: new Date(filter.from) });
  if (filter.to) {
    const end = new Date(filter.to);
    end.setUTCHours(23, 59, 59, 999);
    qb.andWhere('sale.created_at <= :to', { to: end });
  }
  return qb.orderBy('sale.created_at', 'DESC').getMany();
}

// ── Daily cash/payment reconciliation ──────────────────────────────────
export interface ReconciliationSummary {
  date: string;
  byPaymentMode: Record<SalePaymentMode, { count: number; totalCents: number }>;
  creditCollectedTodayCents: number;
  grandTotalCents: number;
}

export async function getDailyReconciliation(
  shopId: string,
  date: string,
): Promise<ReconciliationSummary> {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);

  const sales = await AppDataSource.getRepository(MedicineShopSale)
    .createQueryBuilder('sale')
    .where('sale.shop_id = :shopId', { shopId })
    .andWhere('sale.created_at BETWEEN :start AND :end', { start, end })
    .getMany();

  const byPaymentMode: ReconciliationSummary['byPaymentMode'] = {
    [SalePaymentMode.CASH]: { count: 0, totalCents: 0 },
    [SalePaymentMode.UPI]: { count: 0, totalCents: 0 },
    [SalePaymentMode.CARD]: { count: 0, totalCents: 0 },
    [SalePaymentMode.CREDIT]: { count: 0, totalCents: 0 },
  };
  let grandTotalCents = 0;
  for (const sale of sales) {
    // Cash actually collected at the counter — for a credit sale that's
    // only whatever partial amountPaidCents was taken, not the full total.
    byPaymentMode[sale.paymentMode].count += 1;
    byPaymentMode[sale.paymentMode].totalCents += sale.amountPaidCents;
    grandTotalCents += sale.amountPaidCents;
  }

  // Old dues settled TODAY are real cash in hand today, even though the
  // sale that created the due happened on an earlier day — a till
  // reconciliation has to count this or it won't match the drawer.
  const paymentsToday = await AppDataSource.getRepository(MedicineShopCustomerLedgerEntry)
    .createQueryBuilder('entry')
    .where('entry.shop_id = :shopId', { shopId })
    .andWhere('entry.type = :type', { type: CustomerLedgerEntryType.PAYMENT })
    .andWhere('entry.created_at BETWEEN :start AND :end', { start, end })
    .getMany();
  const creditCollectedTodayCents = paymentsToday.reduce((sum, e) => sum + Math.abs(e.amountCents), 0);

  return {
    date,
    byPaymentMode,
    creditCollectedTodayCents,
    grandTotalCents: grandTotalCents + creditCollectedTodayCents,
  };
}

// ── Sales analytics ──────────────────────────────────────────────────
export interface DayRevenue {
  date: string;
  revenueCents: number;
  saleCount: number;
}

export interface MedicineSalesTotal {
  name: string;
  quantity: number;
  revenueCents: number;
}

export interface SalesAnalytics {
  from: string;
  to: string;
  totalRevenueCents: number;
  totalGstCents: number;
  saleCount: number;
  revenueByDay: DayRevenue[];
  topMedicinesByQuantity: MedicineSalesTotal[];
  topMedicinesByRevenue: MedicineSalesTotal[];
}

const TOP_MEDICINES_LIMIT = 10;

// Pure aggregation over MedicineShopSale rows already in the requested
// range — no separate reporting table, this is cheap enough to compute
// on read for a single shop's own data.
export async function getSalesAnalytics(
  shopId: string,
  from: string,
  to: string,
): Promise<SalesAnalytics> {
  const start = new Date(from);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);

  const sales = await AppDataSource.getRepository(MedicineShopSale)
    .createQueryBuilder('sale')
    .where('sale.shop_id = :shopId', { shopId })
    .andWhere('sale.created_at BETWEEN :start AND :end', { start, end })
    .orderBy('sale.created_at', 'ASC')
    .getMany();

  let totalRevenueCents = 0;
  let totalGstCents = 0;
  const byDay = new Map<string, DayRevenue>();
  const byMedicine = new Map<string, MedicineSalesTotal>();

  for (const sale of sales) {
    totalRevenueCents += sale.totalCents;
    totalGstCents += sale.gstCents;

    const dayKey = sale.createdAt.toISOString().slice(0, 10);
    const day = byDay.get(dayKey) ?? { date: dayKey, revenueCents: 0, saleCount: 0 };
    day.revenueCents += sale.totalCents;
    day.saleCount += 1;
    byDay.set(dayKey, day);

    for (const item of sale.items) {
      const entry = byMedicine.get(item.name) ?? { name: item.name, quantity: 0, revenueCents: 0 };
      entry.quantity += item.quantity;
      entry.revenueCents += item.lineTotalCents;
      byMedicine.set(item.name, entry);
    }
  }

  const medicineTotals = Array.from(byMedicine.values());

  return {
    from,
    to,
    totalRevenueCents,
    totalGstCents,
    saleCount: sales.length,
    revenueByDay: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
    topMedicinesByQuantity: [...medicineTotals].sort((a, b) => b.quantity - a.quantity).slice(0, TOP_MEDICINES_LIMIT),
    topMedicinesByRevenue: [...medicineTotals].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, TOP_MEDICINES_LIMIT),
  };
}

// ── Customers ───────────────────────────────────────────────────────────
export interface CustomerInput {
  name?: string;
  phone?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export async function listCustomers(shopId: string): Promise<MedicineShopCustomer[]> {
  return AppDataSource.getRepository(MedicineShopCustomer).find({
    where: { shopId },
    order: { name: 'ASC' },
  });
}

export async function createCustomer(
  shopId: string,
  tenantId: string,
  data: CustomerInput,
): Promise<MedicineShopCustomer> {
  if (!data.name) throw AppError.badRequest('name is required');
  const repo = AppDataSource.getRepository(MedicineShopCustomer);
  return repo.save(repo.create({
    shopId,
    tenantId,
    name: data.name,
    phone: data.phone ?? undefined,
    address: data.address ?? undefined,
  }));
}

export async function updateCustomer(
  shopId: string,
  customerId: string,
  data: CustomerInput,
): Promise<MedicineShopCustomer> {
  const repo = AppDataSource.getRepository(MedicineShopCustomer);
  const customer = await repo.findOne({ where: { id: customerId, shopId } });
  if (!customer) throw AppError.notFound('Customer');
  if (data.name !== undefined) customer.name = data.name;
  if (data.phone !== undefined) customer.phone = data.phone ?? undefined;
  if (data.address !== undefined) customer.address = data.address ?? undefined;
  if (data.isActive !== undefined) customer.isActive = data.isActive;
  return repo.save(customer);
}

export async function getCustomerLedger(
  shopId: string,
  customerId: string,
): Promise<MedicineShopCustomerLedgerEntry[]> {
  return AppDataSource.getRepository(MedicineShopCustomerLedgerEntry).find({
    where: { shopId, customerId },
    order: { createdAt: 'DESC' },
  });
}

// A customer paying down some or all of what they owe — NOT a new sale,
// just money changing hands against the running balance.
export async function recordCustomerPayment(
  shopId: string,
  tenantId: string,
  customerId: string,
  amountCents: number,
  note?: string,
): Promise<MedicineShopCustomer> {
  if (!amountCents || amountCents <= 0) {
    throw AppError.badRequest('amountCents must be greater than 0');
  }
  await adjustCustomerDue(shopId, tenantId, customerId, -amountCents, CustomerLedgerEntryType.PAYMENT, undefined, note);
  const customer = await AppDataSource.getRepository(MedicineShopCustomer).findOne({
    where: { id: customerId, shopId },
  });
  if (!customer) throw AppError.notFound('Customer');
  return customer;
}
