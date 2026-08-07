import { injectable, inject } from 'tsyringe';
import { In } from 'typeorm';
import { AppDataSource } from '../../config/database';
import {
  MedicineShopQuote,
  MedicineShopQuoteStatus,
  QuotedMedicineItem,
  QuoteSubmissionChannel,
} from '../../entities/MedicineShopQuote';
import { PrescriptionUploadRequest } from '../../entities/PrescriptionUploadRequest';
import { Tenant } from '../../entities/Tenant';
import { AppError } from '../../utils/app-error';
import { WhatsAppBotService } from '../whatsapp/whatsapp-bot.service';
import { AuthService } from '../auth/auth.service';
import { listShopStaff, inviteShopStaff, toggleShopStaffActive } from '../medicine-shops/staff.util';
import { User } from '../../entities/User';
import {
  recordShopQuote,
  declineShopQuote,
} from '../medicine-shops/quote-processing.util';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { STORAGE_PROVIDER } from '../../config/container';
import { MedicineShop } from '../../entities/MedicineShop';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import { buildQuoteReceiptPdf } from '../../utils/quote-receipt-pdf';
import {
  applyCatalogFields,
  bulkUpsertCatalogRows,
  buildCatalogExportCsv,
  BulkUploadResult,
  CatalogItemInput,
  listStockMovements,
  saveCatalogItemWithLedger,
} from '../medicine-shops/catalog.util';
import {
  listStockMovementsForExport,
  buildStockHistoryCsv,
  buildStockHistoryXlsx,
  StockHistoryExportFilter,
} from '../medicine-shops/stock-history-export.util';
import {
  MedicineShopStockMovement,
  StockMovementReason,
} from '../../entities/MedicineShopStockMovement';
import {
  parseCatalogFile,
  buildCatalogTemplateCsv,
} from '../medicine-shops/catalog-import.util';
import {
  scanMedicineImage,
  ScannedMedicineFields,
} from '../medicine-shops/catalog-scan.util';
import { IAiProvider } from '../../providers/ai/ai.provider.interface';
import { AI_PROVIDER } from '../../config/container';
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  SupplierInput,
} from '../medicine-shops/supplier.util';
import {
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  createPurchaseOrdersFromLowStock,
  updatePurchaseOrder,
  markPurchaseOrderSent,
  markPurchaseOrderReceived,
  cancelPurchaseOrder,
  deletePurchaseOrder,
  CreatePurchaseOrderInput,
} from '../medicine-shops/purchase-order.util';
import { listBatches, addBatch, deleteBatch, BatchInput } from '../medicine-shops/batch.util';
import { MedicineShopCatalogItemBatch } from '../../entities/MedicineShopCatalogItemBatch';
import { MedicineShopPurchaseOrder } from '../../entities/MedicineShopPurchaseOrder';
import { MedicineShopSupplier } from '../../entities/MedicineShopSupplier';
import { adjustStock, StockAdjustmentType } from '../medicine-shops/catalog.util';
import {
  createSale,
  listSales,
  getSale,
  listControlledDrugRegister,
  getDailyReconciliation,
  listCustomers,
  createCustomer,
  updateCustomer,
  getCustomerLedger,
  recordCustomerPayment,
  CreateSaleInput,
  CustomerInput,
  ReconciliationSummary,
  getSalesAnalytics,
  SalesAnalytics,
} from '../medicine-shops/billing.util';
import { MedicineShopSale } from '../../entities/MedicineShopSale';
import { MedicineShopCustomer } from '../../entities/MedicineShopCustomer';
import { MedicineShopCustomerLedgerEntry } from '../../entities/MedicineShopCustomerLedgerEntry';
import {
  setSupplierPrice,
  deleteSupplierPrice,
  compareSuppliersForItem,
  listSupplierPricesForShop,
  SupplierQuote,
} from '../medicine-shops/supplier-price.util';
import { MedicineShopSupplierPrice } from '../../entities/MedicineShopSupplierPrice';
import { computeRestockSuggestions, RestockSuggestion } from '../medicine-shops/demand-prediction.util';

const S3_URL_PATTERN = /\.s3\.[^.]+\.amazonaws\.com\//;

// The medicine shop's own portal — deliberately separate from admin.service.ts
// (a shop is ownership-scoped to its own shopId, not permission-scoped like
// tenant staff; see attachRole.middleware.ts's shopId branch).
@injectable()
export class ShopService {
  constructor(
    private readonly whatsAppBot: WhatsAppBotService,
    @inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    @inject(AI_PROVIDER) private readonly ai: IAiProvider,
    private readonly authService: AuthService,
  ) {}

  // imageUrl is stored as the raw (private) S3 object URL — resolve a
  // short-lived signed URL on read, same convention used admin-side.
  private async signImageUrl(
    request: PrescriptionUploadRequest,
  ): Promise<PrescriptionUploadRequest> {
    if (!S3_URL_PATTERN.test(request.imageUrl)) return request;
    try {
      const key = new URL(request.imageUrl).pathname.slice(1);
      const signedUrl = await this.storage.getSignedUrl(key, 3600);
      return { ...request, imageUrl: signedUrl };
    } catch {
      return request;
    }
  }

  async listMyQuoteRequests(shopId: string): Promise<
    (MedicineShopQuote & {
      request?: PrescriptionUploadRequest & { tenantName?: string };
    })[]
  > {
    const quotes = await AppDataSource.getRepository(MedicineShopQuote).find({
      where: { shopId },
      order: { createdAt: 'DESC' },
    });
    const requestIds = [...new Set(quotes.map((q) => q.requestId))];
    const requests = requestIds.length
      ? await AppDataSource.getRepository(PrescriptionUploadRequest).findBy({
          id: In(requestIds),
        })
      : [];
    const signedRequests = await Promise.all(
      requests.map((r) => this.signImageUrl(r)),
    );

    // A quote's receipt is branded with the tenant (platform), not the
    // shop's own name — the shop needs to know which tenant it's quoting
    // for, so hydrate that here too.
    const tenantIds = [...new Set(signedRequests.map((r) => r.tenantId))];
    const tenants = tenantIds.length
      ? await AppDataSource.getRepository(Tenant).findBy({ id: In(tenantIds) })
      : [];
    const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

    const requestMap = new Map(
      signedRequests.map((r) => [
        r.id,
        { ...r, tenantName: tenantMap.get(r.tenantId) },
      ]),
    );
    return quotes.map((q) => ({ ...q, request: requestMap.get(q.requestId) }));
  }

  async submitQuote(
    shopId: string,
    quoteId: string,
    data: { totalCents: number; items?: QuotedMedicineItem[]; note?: string },
  ): Promise<MedicineShopQuote> {
    const existing = await AppDataSource.getRepository(
      MedicineShopQuote,
    ).findOne({
      where: { id: quoteId, shopId },
    });
    if (!existing) throw AppError.notFound('Quote request');
    if (existing.status !== MedicineShopQuoteStatus.PENDING) {
      throw AppError.badRequest('This quote has already been responded to');
    }

    const quote = await recordShopQuote(
      quoteId,
      data,
      QuoteSubmissionChannel.PORTAL,
      (tenantId, request, chosenQuote) =>
        this.whatsAppBot.sendPatientReceipt(tenantId, request, chosenQuote),
    );
    if (!quote) throw AppError.notFound('Quote request');
    return quote;
  }

  async declineQuote(
    shopId: string,
    quoteId: string,
  ): Promise<MedicineShopQuote> {
    const existing = await AppDataSource.getRepository(
      MedicineShopQuote,
    ).findOne({
      where: { id: quoteId, shopId },
    });
    if (!existing) throw AppError.notFound('Quote request');
    if (existing.status !== MedicineShopQuoteStatus.PENDING) {
      throw AppError.badRequest('This quote has already been responded to');
    }

    const quote = await declineShopQuote(
      quoteId,
      QuoteSubmissionChannel.PORTAL,
    );
    if (!quote) throw AppError.notFound('Quote request');
    return quote;
  }

  async getQuoteReceiptPdf(
    shopId: string,
    quoteId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const quote = await AppDataSource.getRepository(MedicineShopQuote).findOne({
      where: { id: quoteId, shopId },
    });
    if (!quote) throw AppError.notFound('Quote request');
    if (quote.status !== MedicineShopQuoteStatus.SUBMITTED) {
      throw AppError.badRequest(
        'Only a submitted quote has a receipt to download',
      );
    }

    const request = await AppDataSource.getRepository(
      PrescriptionUploadRequest,
    ).findOne({
      where: { id: quote.requestId },
    });
    const [tenant, shop] = await Promise.all([
      request
        ? AppDataSource.getRepository(Tenant).findOne({
            where: { id: request.tenantId },
          })
        : Promise.resolve(null),
      AppDataSource.getRepository(MedicineShop).findOne({
        where: { id: shopId },
      }),
    ]);

    const buffer = await buildQuoteReceiptPdf({
      tenantName: tenant?.name ?? 'Tenant',
      shopName: shop?.name,
      requestId: quote.requestId,
      quoteDate: quote.submittedAt,
      items: quote.items,
      totalCents: quote.totalCents,
      submittedVia: quote.submittedVia,
      status: quote.status,
    });

    return { buffer, filename: `quote-${quote.requestId.slice(0, 8)}.pdf` };
  }

  // The shop's own profile + which tenant it serves — a shop is onboarded
  // by exactly one tenant today (see MedicineShop.tenantId), but the shop
  // staff logging in have no other way to see that name anywhere in the
  // portal, so surface it for the header/dashboard.
  async getMyProfile(
    shopId: string,
  ): Promise<{ shop: MedicineShop; tenantName?: string }> {
    const shop = await AppDataSource.getRepository(MedicineShop).findOne({
      where: { id: shopId },
    });
    if (!shop) throw AppError.notFound('Medicine shop');
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id: shop.tenantId },
    });
    return { shop, tenantName: tenant?.name };
  }

  // ── Shop-maintained price catalog — independent of any specific quote,
  // lets the shop (or an admin acting on its behalf, see admin.service.ts)
  // keep a standing price list to quote from faster ──────────────────────

  async listMyCatalog(shopId: string): Promise<MedicineShopCatalogItem[]> {
    return AppDataSource.getRepository(MedicineShopCatalogItem).find({
      where: { shopId },
      order: { name: 'ASC' },
    });
  }

  async createCatalogItem(
    shopId: string,
    data: CatalogItemInput & { name: string; priceCents: number },
  ): Promise<MedicineShopCatalogItem> {
    const shop = await AppDataSource.getRepository(MedicineShop).findOne({
      where: { id: shopId },
    });
    if (!shop) throw AppError.notFound('Medicine shop');
    const repo = AppDataSource.getRepository(MedicineShopCatalogItem);
    const item = repo.create({
      shopId,
      tenantId: shop.tenantId,
      name: data.name,
      priceCents: data.priceCents,
    });
    applyCatalogFields(item, data);
    return saveCatalogItemWithLedger(item, 0, StockMovementReason.INITIAL);
  }

  async updateCatalogItem(
    shopId: string,
    itemId: string,
    data: CatalogItemInput,
  ): Promise<MedicineShopCatalogItem> {
    const repo = AppDataSource.getRepository(MedicineShopCatalogItem);
    const item = await repo.findOne({ where: { id: itemId, shopId } });
    if (!item) throw AppError.notFound('Catalog item');
    const previousQuantity = item.quantity;
    applyCatalogFields(item, data);
    return saveCatalogItemWithLedger(
      item,
      previousQuantity,
      StockMovementReason.CORRECTION,
    );
  }

  async deleteCatalogItem(shopId: string, itemId: string): Promise<void> {
    const repo = AppDataSource.getRepository(MedicineShopCatalogItem);
    const item = await repo.findOne({ where: { id: itemId, shopId } });
    if (!item) throw AppError.notFound('Catalog item');
    await repo.remove(item);
  }

  getCatalogTemplateCsv(): string {
    return buildCatalogTemplateCsv();
  }

  async bulkUploadCatalog(
    shopId: string,
    file: { buffer: Buffer; originalname: string },
  ): Promise<BulkUploadResult> {
    const shop = await AppDataSource.getRepository(MedicineShop).findOne({
      where: { id: shopId },
    });
    if (!shop) throw AppError.notFound('Medicine shop');
    const rows = await parseCatalogFile(file.buffer, file.originalname);
    if (rows.length === 0) {
      throw AppError.badRequest(
        'No rows found in this file — check it has a header row and at least one medicine.',
      );
    }
    return bulkUpsertCatalogRows(shopId, shop.tenantId, rows);
  }

  async scanCatalogImage(
    images: { base64: string; mimeType: string }[],
  ): Promise<ScannedMedicineFields> {
    return scanMedicineImage(this.ai, images);
  }

  async exportCatalogCsv(shopId: string): Promise<string> {
    const items = await this.listMyCatalog(shopId);
    return buildCatalogExportCsv(items);
  }

  async getStockHistory(
    shopId: string,
    catalogItemId?: string,
  ): Promise<MedicineShopStockMovement[]> {
    return listStockMovements(shopId, catalogItemId);
  }

  async exportStockHistoryCsv(shopId: string, filter: StockHistoryExportFilter): Promise<string> {
    const movements = await listStockMovementsForExport(shopId, filter);
    return buildStockHistoryCsv(movements);
  }

  async exportStockHistoryXlsx(shopId: string, filter: StockHistoryExportFilter): Promise<Buffer> {
    const movements = await listStockMovementsForExport(shopId, filter);
    return buildStockHistoryXlsx(movements);
  }

  private async getShopOrThrow(shopId: string): Promise<MedicineShop> {
    const shop = await AppDataSource.getRepository(MedicineShop).findOne({
      where: { id: shopId },
    });
    if (!shop) throw AppError.notFound('Medicine shop');
    return shop;
  }

  // ── Suppliers ───────────────────────────────────────────────────────
  async listSuppliers(shopId: string): Promise<MedicineShopSupplier[]> {
    return listSuppliers(shopId);
  }

  async createSupplier(shopId: string, data: SupplierInput): Promise<MedicineShopSupplier> {
    const shop = await this.getShopOrThrow(shopId);
    return createSupplier(shopId, shop.tenantId, data);
  }

  async updateSupplier(
    shopId: string,
    supplierId: string,
    data: SupplierInput,
  ): Promise<MedicineShopSupplier> {
    return updateSupplier(shopId, supplierId, data);
  }

  async deleteSupplier(shopId: string, supplierId: string): Promise<void> {
    return deleteSupplier(shopId, supplierId);
  }

  // ── Purchase Orders ─────────────────────────────────────────────────
  async listPurchaseOrders(shopId: string): Promise<MedicineShopPurchaseOrder[]> {
    return listPurchaseOrders(shopId);
  }

  async getPurchaseOrder(shopId: string, poId: string): Promise<MedicineShopPurchaseOrder> {
    return getPurchaseOrder(shopId, poId);
  }

  async createPurchaseOrder(
    shopId: string,
    data: CreatePurchaseOrderInput,
  ): Promise<MedicineShopPurchaseOrder> {
    const shop = await this.getShopOrThrow(shopId);
    return createPurchaseOrder(shopId, shop.tenantId, data);
  }

  async createPurchaseOrdersFromLowStock(shopId: string): Promise<MedicineShopPurchaseOrder[]> {
    const shop = await this.getShopOrThrow(shopId);
    return createPurchaseOrdersFromLowStock(shopId, shop.tenantId);
  }

  async updatePurchaseOrder(
    shopId: string,
    poId: string,
    data: CreatePurchaseOrderInput,
  ): Promise<MedicineShopPurchaseOrder> {
    return updatePurchaseOrder(shopId, poId, data);
  }

  async markPurchaseOrderSent(
    shopId: string,
    poId: string,
  ): Promise<{ purchaseOrder: MedicineShopPurchaseOrder; whatsappShareLink?: string }> {
    const shop = await this.getShopOrThrow(shopId);
    return markPurchaseOrderSent(shopId, poId, shop.name);
  }

  async markPurchaseOrderReceived(
    shopId: string,
    poId: string,
  ): Promise<MedicineShopPurchaseOrder> {
    const shop = await this.getShopOrThrow(shopId);
    return markPurchaseOrderReceived(shopId, shop.tenantId, poId);
  }

  async cancelPurchaseOrder(shopId: string, poId: string): Promise<MedicineShopPurchaseOrder> {
    return cancelPurchaseOrder(shopId, poId);
  }

  async deletePurchaseOrder(shopId: string, poId: string): Promise<void> {
    return deletePurchaseOrder(shopId, poId);
  }

  // ── Batches ─────────────────────────────────────────────────────────
  async listBatches(
    shopId: string,
    catalogItemId: string,
  ): Promise<MedicineShopCatalogItemBatch[]> {
    return listBatches(shopId, catalogItemId);
  }

  async addBatch(
    shopId: string,
    catalogItemId: string,
    data: BatchInput,
  ): Promise<MedicineShopCatalogItemBatch> {
    const shop = await this.getShopOrThrow(shopId);
    return addBatch(shopId, shop.tenantId, catalogItemId, data);
  }

  async deleteBatch(shopId: string, batchId: string): Promise<void> {
    return deleteBatch(shopId, batchId);
  }

  // ── Stock adjustments (returns/damage) ─────────────────────────────
  async adjustStock(
    shopId: string,
    itemId: string,
    type: StockAdjustmentType,
    quantity: number,
    note?: string,
  ): Promise<MedicineShopCatalogItem> {
    return adjustStock(shopId, itemId, type, quantity, note);
  }

  // ── Billing (Sales) ─────────────────────────────────────────────────
  async createSale(shopId: string, data: CreateSaleInput): Promise<MedicineShopSale> {
    const shop = await this.getShopOrThrow(shopId);
    return createSale(shopId, shop.tenantId, data);
  }

  async listSales(shopId: string, filter: { from?: string; to?: string }): Promise<MedicineShopSale[]> {
    return listSales(shopId, filter);
  }

  async getSale(shopId: string, saleId: string): Promise<MedicineShopSale> {
    return getSale(shopId, saleId);
  }

  async listControlledDrugRegister(
    shopId: string,
    filter: { from?: string; to?: string },
  ): Promise<MedicineShopSale[]> {
    return listControlledDrugRegister(shopId, filter);
  }

  async getDailyReconciliation(shopId: string, date: string): Promise<ReconciliationSummary> {
    return getDailyReconciliation(shopId, date);
  }

  async getSalesAnalytics(shopId: string, from: string, to: string): Promise<SalesAnalytics> {
    return getSalesAnalytics(shopId, from, to);
  }

  // ── Customers + credit ledger ───────────────────────────────────────
  async listCustomers(shopId: string): Promise<MedicineShopCustomer[]> {
    return listCustomers(shopId);
  }

  async createCustomer(shopId: string, data: CustomerInput): Promise<MedicineShopCustomer> {
    const shop = await this.getShopOrThrow(shopId);
    return createCustomer(shopId, shop.tenantId, data);
  }

  async updateCustomer(
    shopId: string,
    customerId: string,
    data: CustomerInput,
  ): Promise<MedicineShopCustomer> {
    return updateCustomer(shopId, customerId, data);
  }

  async getCustomerLedger(
    shopId: string,
    customerId: string,
  ): Promise<MedicineShopCustomerLedgerEntry[]> {
    return getCustomerLedger(shopId, customerId);
  }

  async recordCustomerPayment(
    shopId: string,
    customerId: string,
    amountCents: number,
    note?: string,
  ): Promise<MedicineShopCustomer> {
    const shop = await this.getShopOrThrow(shopId);
    return recordCustomerPayment(shopId, shop.tenantId, customerId, amountCents, note);
  }

  // ── Distributor price comparison ────────────────────────────────────
  async setSupplierPrice(
    shopId: string,
    supplierId: string,
    catalogItemId: string,
    priceCents: number,
  ): Promise<MedicineShopSupplierPrice> {
    const shop = await this.getShopOrThrow(shopId);
    return setSupplierPrice(shopId, shop.tenantId, supplierId, catalogItemId, priceCents);
  }

  async deleteSupplierPrice(shopId: string, priceId: string): Promise<void> {
    return deleteSupplierPrice(shopId, priceId);
  }

  async compareSuppliersForItem(shopId: string, catalogItemId: string): Promise<SupplierQuote[]> {
    return compareSuppliersForItem(shopId, catalogItemId);
  }

  async listSupplierPricesForShop(shopId: string): Promise<MedicineShopSupplierPrice[]> {
    return listSupplierPricesForShop(shopId);
  }

  // ── Demand prediction ────────────────────────────────────────────────
  async computeRestockSuggestions(shopId: string): Promise<RestockSuggestion[]> {
    return computeRestockSuggestions(shopId);
  }

  // ── Staff (owner/cashier sub-roles) ─────────────────────────────────
  async listShopStaff(shopId: string): Promise<User[]> {
    return listShopStaff(shopId);
  }

  async inviteShopStaff(
    shopId: string,
    data: { fullName: string; email: string; password?: string },
  ): Promise<{ user: User; inviteLink?: string }> {
    const shop = await this.getShopOrThrow(shopId);
    return inviteShopStaff(this.authService, shopId, shop.tenantId, data);
  }

  async toggleShopStaffActive(shopId: string, staffId: string): Promise<User> {
    return toggleShopStaffActive(shopId, staffId);
  }
}
