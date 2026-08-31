import { injectable, inject } from 'tsyringe';
import { In, Not, IsNull } from 'typeorm';
import { AppDataSource } from '../../config/database';
import {
  MedicineShopQuote,
  MedicineShopQuoteStatus,
  QuotedMedicineItem,
  QuoteSubmissionChannel,
} from '../../entities/MedicineShopQuote';
import { PrescriptionUploadRequest } from '../../entities/PrescriptionUploadRequest';
import { MedicineOrder, MedicineOrderStatus } from '../../entities/MedicineOrder';
import { Tenant } from '../../entities/Tenant';
import { AppError } from '../../utils/app-error';
import { assertValidTransition } from '../../utils/order-status-transitions';
import { WhatsAppBotService } from '../whatsapp/whatsapp-bot.service';
import { AuthService } from '../auth/auth.service';
import { listShopStaff, inviteShopStaff, toggleShopStaffActive } from '../medicine-shops/staff.util';
import { User } from '../../entities/User';
import {
  recordShopQuote,
  declineShopQuote,
} from '../medicine-shops/quote-processing.util';
import { MedicineShopAlertsService } from '../medicine-shops/medicine-shop-alerts.service';
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
import { Permission } from '../../entities/Permission';
import { MedicineShopRole } from '../../entities/MedicineShopRole';
import {
  listAssignableShopPermissions,
  listShopRoles,
  getShopRole,
  createShopRole,
  updateShopRole,
  deleteShopRole,
  assignShopStaffRole,
} from '../medicine-shops/shop-role.util';
import { MedicineShopAttendance, AttendanceStatus } from '../../entities/MedicineShopAttendance';
import {
  selfCheckIn,
  selfCheckOut,
  getMyTodayAttendance,
  markAttendance,
  listAttendance,
} from '../medicine-shops/attendance.util';
import { MedicineShopLeaveRequest, LeaveStatus } from '../../entities/MedicineShopLeaveRequest';
import {
  requestLeave,
  ownerDirectMarkLeave,
  decideLeaveRequest,
  listLeaveRequests,
  getLeaveBalance,
  LeaveBalance,
} from '../medicine-shops/leave.util';
import { MedicineShopStaffProfile } from '../../entities/MedicineShopStaffProfile';
import { MedicineShopPayrollRecord, PayrollAdjustment } from '../../entities/MedicineShopPayrollRecord';
import {
  getStaffProfile,
  listStaffProfiles,
  upsertStaffProfile,
  generatePayrollRecord,
  addPayrollAdjustment,
  finalizePayrollRecord,
  markPayrollPaid,
  listPayrollRecords,
  getPayrollRecord,
} from '../medicine-shops/payroll.util';
import { buildPayslipPdf, PayslipLine } from '../../utils/payslip-pdf';
import { WhatsAppSession } from '../../entities/WhatsAppSession';
import {
  getShopWhatsAppStatus,
  ShopWhatsAppStatus,
  getShopWhatsAppSession,
  resetShopWhatsAppSession,
} from '../medicine-shops/shop-whatsapp.util';
import { WhatsAppNotificationService } from '../notifications/whatsapp-notification.service';
import { WhatsAppFlow, WhatsAppFlowDefinition } from '../../entities/WhatsAppFlow';
import { WhatsAppProviderType } from '../../entities/TenantWhatsAppConfig';
import {
  getShopModuleStatus,
  getShopModuleConfig,
  updateShopModuleConfig,
  listShopFlows,
  getShopFlow,
  createShopFlow,
  generateShopFlow,
  editShopFlowWithAi,
  updateShopFlow,
  activateShopFlow,
  deactivateShopFlow,
  deleteShopFlow,
  listShopModuleSessions,
  getShopModuleSessionDetail,
  resumeShopModuleSessionBot,
  replyToShopModuleSession,
} from '../medicine-shops/shop-whatsapp-module.util';

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
    private readonly whatsAppNotification: WhatsAppNotificationService,
    private readonly shopAlerts: MedicineShopAlertsService,
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
      this.shopAlerts,
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

  // A shop can only see an order once the tenant admin has explicitly
  // relayed "payment received, please fulfil" (shopNotifiedAt) — before
  // that, the shop has no way to know whether their quote even won,
  // matching the deliberate "admin controls when the shop finds out"
  // design (see AdminService.notifyShopOrderReady).
  // Same shape admin.service.ts's own attachPatientInfo produces — a shop
  // seeing who the order is for is just as useful as the tenant admin
  // seeing it, and MedicineOrder only stores a raw patientId (no ORM
  // relation), so both sides need this same manual join.
  private async attachPatientInfo<T extends MedicineOrder>(
    orders: T[],
  ): Promise<(T & { patient: { fullName?: string; phoneNumber?: string } })[]> {
    const patientIds = [...new Set(orders.map((o) => o.patientId))];
    const patients = patientIds.length
      ? await AppDataSource.getRepository(User).findBy({ id: In(patientIds) })
      : [];
    const byId = new Map(patients.map((p) => [p.id, p]));
    return orders.map((order) => ({
      ...order,
      patient: {
        fullName: byId.get(order.patientId)?.fullName,
        phoneNumber: byId.get(order.patientId)?.phoneNumber,
      },
    }));
  }

  async listMyOrders(shopId: string): Promise<(MedicineOrder & { patient: { fullName?: string; phoneNumber?: string } })[]> {
    const orders = await AppDataSource.getRepository(MedicineOrder).find({
      where: { shopId, shopNotifiedAt: Not(IsNull()) },
      order: { shopNotifiedAt: 'DESC' },
    });
    return this.attachPatientInfo(orders);
  }

  async getMyOrder(shopId: string, orderId: string): Promise<MedicineOrder & { patient: { fullName?: string; phoneNumber?: string } }> {
    const order = await AppDataSource.getRepository(MedicineOrder).findOne({
      where: { id: orderId, shopId, shopNotifiedAt: Not(IsNull()) },
    });
    if (!order) throw AppError.notFound('Order');
    const [withPatient] = await this.attachPatientInfo([order]);
    return withPatient;
  }

  // The forward delivery sequence a shop can advance through one step at a
  // time (checked against the order's ACTUAL current status via
  // assertValidTransition, the same shared rule admin.service.ts's own
  // status update uses — includes 'confirmed' as a valid current status too
  // for a COD direct-catalog order still sitting at 'placed'). CANCELLED is
  // the one non-forward target a shop is also allowed — same as an admin
  // can, but only up through 'picked_up' (assertValidTransition already
  // has no cancel path out of 'out_for_delivery'/'delivered'). Anything
  // else (e.g. 'confirmed' — that's specifically an admin payment-
  // confirmation action) stays off-limits to a shop.
  private static readonly SHOP_ALLOWED_TARGETS: MedicineOrderStatus[] = [
    MedicineOrderStatus.PACKED,
    MedicineOrderStatus.PICKED_UP,
    MedicineOrderStatus.OUT_FOR_DELIVERY,
    MedicineOrderStatus.DELIVERED,
    MedicineOrderStatus.CANCELLED,
  ];

  async updateMyOrderStatus(
    shopId: string,
    orderId: string,
    status: MedicineOrderStatus,
    userId: string,
    cancelReason?: string,
  ): Promise<MedicineOrder> {
    const order = await this.getMyOrder(shopId, orderId);

    if (!ShopService.SHOP_ALLOWED_TARGETS.includes(status)) {
      throw AppError.badRequest('Invalid delivery status for a shop to set');
    }
    assertValidTransition(order.status, status);

    order.status = status;
    if (status === MedicineOrderStatus.CANCELLED) {
      order.cancelReason = cancelReason;
      order.cancelledBy = userId;
    }
    order.statusHistory = [
      ...order.statusHistory,
      { status, at: new Date().toISOString(), byUserId: userId, note: status === MedicineOrderStatus.CANCELLED ? cancelReason : undefined },
    ];
    const saved = await AppDataSource.getRepository(MedicineOrder).save(order);

    // Same patient notification the admin's own status-update already
    // sends (admin.service.ts#updateMedicineOrderStatus) — a shop packing/
    // shipping/cancelling an order is just as real a status change as one
    // an admin makes, so the patient shouldn't only hear about half of them.
    void this.whatsAppNotification.notifyOrderStatusChanged(
      saved,
      order.patient?.phoneNumber,
      status,
      cancelReason,
    );

    return saved;
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
    data: { fullName: string; email: string; password?: string; shopRoleId?: string },
  ): Promise<{ user: User; inviteLink?: string }> {
    const shop = await this.getShopOrThrow(shopId);
    return inviteShopStaff(this.authService, shopId, shop.tenantId, data);
  }

  async toggleShopStaffActive(shopId: string, staffId: string): Promise<User> {
    return toggleShopStaffActive(shopId, staffId);
  }

  // ── Custom shop roles & permissions ─────────────────────────────────
  async listAssignableShopPermissions(): Promise<Permission[]> {
    return listAssignableShopPermissions();
  }

  async listShopRoles(shopId: string): Promise<MedicineShopRole[]> {
    return listShopRoles(shopId);
  }

  async getShopRole(
    shopId: string,
    id: string,
  ): Promise<MedicineShopRole & { permissionKeys: string[] }> {
    return getShopRole(shopId, id);
  }

  async createShopRole(
    shopId: string,
    name: string,
    description: string | undefined,
    permissionKeys: string[],
  ): Promise<MedicineShopRole> {
    return createShopRole(shopId, name, description, permissionKeys);
  }

  async updateShopRole(
    shopId: string,
    id: string,
    data: { name?: string; description?: string; permissionKeys?: string[] },
  ): Promise<MedicineShopRole> {
    return updateShopRole(shopId, id, data);
  }

  async deleteShopRole(shopId: string, id: string): Promise<void> {
    return deleteShopRole(shopId, id);
  }

  async assignShopStaffRole(shopId: string, staffId: string, roleId: string): Promise<User> {
    return assignShopStaffRole(shopId, staffId, roleId);
  }

  // ── Attendance ───────────────────────────────────────────────────────
  async selfCheckIn(shopId: string, staffUserId: string): Promise<MedicineShopAttendance> {
    return selfCheckIn(shopId, staffUserId);
  }

  async selfCheckOut(shopId: string, staffUserId: string): Promise<MedicineShopAttendance> {
    return selfCheckOut(shopId, staffUserId);
  }

  async getMyTodayAttendance(staffUserId: string): Promise<MedicineShopAttendance | null> {
    return getMyTodayAttendance(staffUserId);
  }

  async markAttendance(
    shopId: string,
    staffUserId: string,
    date: string,
    status: AttendanceStatus,
    markedByUserId: string,
    notes?: string,
  ): Promise<MedicineShopAttendance> {
    return markAttendance(shopId, staffUserId, date, status, markedByUserId, notes);
  }

  async listAttendance(
    shopId: string,
    filters: { staffUserId?: string; from?: string; to?: string },
  ): Promise<MedicineShopAttendance[]> {
    return listAttendance(shopId, filters);
  }

  // ── Leave ────────────────────────────────────────────────────────────
  async requestLeave(
    shopId: string,
    staffUserId: string,
    startDate: string,
    endDate: string,
    reason?: string,
  ): Promise<MedicineShopLeaveRequest> {
    return requestLeave(shopId, staffUserId, startDate, endDate, reason);
  }

  async ownerDirectMarkLeave(
    shopId: string,
    staffUserId: string,
    startDate: string,
    endDate: string,
    reason: string | undefined,
    markedByUserId: string,
  ): Promise<MedicineShopLeaveRequest> {
    return ownerDirectMarkLeave(shopId, staffUserId, startDate, endDate, reason, markedByUserId);
  }

  async decideLeaveRequest(
    shopId: string,
    requestId: string,
    approve: boolean,
    decidedByUserId: string,
    decisionNote?: string,
  ): Promise<MedicineShopLeaveRequest> {
    return decideLeaveRequest(shopId, requestId, approve, decidedByUserId, decisionNote);
  }

  async listLeaveRequests(
    shopId: string,
    filters: { staffUserId?: string; status?: LeaveStatus },
  ): Promise<MedicineShopLeaveRequest[]> {
    return listLeaveRequests(shopId, filters);
  }

  async getLeaveBalance(shopId: string, staffUserId: string): Promise<LeaveBalance> {
    return getLeaveBalance(shopId, staffUserId);
  }

  // ── Payroll ──────────────────────────────────────────────────────────
  async getStaffProfile(shopId: string, userId: string): Promise<MedicineShopStaffProfile | null> {
    return getStaffProfile(shopId, userId);
  }

  async listStaffProfiles(shopId: string): Promise<MedicineShopStaffProfile[]> {
    return listStaffProfiles(shopId);
  }

  async upsertStaffProfile(
    shopId: string,
    userId: string,
    data: Parameters<typeof upsertStaffProfile>[2],
  ): Promise<MedicineShopStaffProfile> {
    return upsertStaffProfile(shopId, userId, data);
  }

  async generatePayrollRecord(
    shopId: string,
    staffUserId: string,
    month: string,
  ): Promise<MedicineShopPayrollRecord> {
    return generatePayrollRecord(shopId, staffUserId, month);
  }

  async addPayrollAdjustment(
    shopId: string,
    recordId: string,
    adjustment: PayrollAdjustment,
  ): Promise<MedicineShopPayrollRecord> {
    return addPayrollAdjustment(shopId, recordId, adjustment);
  }

  async finalizePayrollRecord(shopId: string, recordId: string): Promise<MedicineShopPayrollRecord> {
    return finalizePayrollRecord(shopId, recordId);
  }

  async markPayrollPaid(
    shopId: string,
    recordId: string,
    paidVia: string,
    notes?: string,
  ): Promise<MedicineShopPayrollRecord> {
    return markPayrollPaid(shopId, recordId, paidVia, notes);
  }

  async listPayrollRecords(
    shopId: string,
    filters: { staffUserId?: string; month?: string },
  ): Promise<MedicineShopPayrollRecord[]> {
    return listPayrollRecords(shopId, filters);
  }

  async getPayrollRecord(shopId: string, recordId: string): Promise<MedicineShopPayrollRecord> {
    return getPayrollRecord(shopId, recordId);
  }

  async downloadPayslip(
    shopId: string,
    recordId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const record = await getPayrollRecord(shopId, recordId);
    const shop = await this.getShopOrThrow(shopId);
    const employee = await AppDataSource.getRepository(User).findOne({
      where: { id: record.staffUserId },
    });
    const profile = await getStaffProfile(shopId, record.staffUserId);

    const earnings: PayslipLine[] = record.adjustments
      .filter((a) => a.type === 'bonus')
      .map((a) => ({ label: a.label, amountCents: a.amountCents }));

    const deductions: PayslipLine[] = [
      ...record.adjustments
        .filter((a) => a.type === 'deduction')
        .map((a) => ({ label: a.label, amountCents: a.amountCents })),
      ...(record.pfDeductionCents > 0 ? [{ label: 'PF (employee share)', amountCents: record.pfDeductionCents }] : []),
      ...(record.esiDeductionCents > 0 ? [{ label: 'ESI (employee share)', amountCents: record.esiDeductionCents }] : []),
      ...(record.professionalTaxCents > 0 ? [{ label: 'Professional Tax', amountCents: record.professionalTaxCents }] : []),
      ...(record.tdsCents > 0 ? [{ label: 'TDS', amountCents: record.tdsCents }] : []),
    ];

    const buffer = await buildPayslipPdf({
      shopName: shop.name,
      employeeName: employee?.fullName || employee?.email || 'Staff',
      employeeCode: profile?.employeeCode,
      month: record.month,
      workingDaysInMonth: record.workingDaysInMonth,
      presentDays: record.presentDays,
      halfDays: record.halfDays,
      paidLeaveDays: record.paidLeaveDays,
      unpaidLeaveDays: record.unpaidLeaveDays,
      absentDays: record.absentDays,
      baseSalaryCents: record.baseSalaryCents,
      proRatedGrossCents: record.proRatedGrossCents,
      earnings,
      deductions,
      netPayCents: record.netPayCents,
      status: record.status,
    });
    return { buffer, filename: `payslip-${record.month}-${record.staffUserId.slice(0, 8)}.pdf` };
  }

  // ── WhatsApp (this shop's own link status + conversation) ────────────
  async getMyWhatsAppStatus(shopId: string): Promise<ShopWhatsAppStatus> {
    return getShopWhatsAppStatus(shopId);
  }

  async getMyWhatsAppSession(shopId: string): Promise<WhatsAppSession | null> {
    return getShopWhatsAppSession(shopId);
  }

  async resetMyWhatsAppSession(shopId: string): Promise<WhatsAppSession> {
    return resetShopWhatsAppSession(shopId);
  }

  // ── WhatsApp Module (standalone shop's OWN independent WhatsApp
  // presence — provider config + flow builder + sessions, gated by
  // whatsappModuleEnabled) ──────────────────────────────────────────────
  async getWhatsAppModuleStatus(shopId: string): Promise<{ enabled: boolean; enabledAt?: Date }> {
    return getShopModuleStatus(shopId);
  }

  async getWhatsAppModuleConfig(shopId: string): ReturnType<typeof getShopModuleConfig> {
    return getShopModuleConfig(shopId);
  }

  async updateWhatsAppModuleConfig(
    shopId: string,
    data: Parameters<typeof updateShopModuleConfig>[1],
  ): Promise<{ provider: WhatsAppProviderType }> {
    return updateShopModuleConfig(shopId, data);
  }

  async listWhatsAppModuleFlows(shopId: string): Promise<WhatsAppFlow[]> {
    return listShopFlows(shopId);
  }

  async getWhatsAppModuleFlow(shopId: string, id: string): Promise<WhatsAppFlow> {
    return getShopFlow(shopId, id);
  }

  async createWhatsAppModuleFlow(shopId: string, name: string): Promise<WhatsAppFlow> {
    return createShopFlow(shopId, name);
  }

  async generateWhatsAppModuleFlow(shopId: string, name: string, prompt: string): Promise<WhatsAppFlow> {
    return generateShopFlow(this.ai, shopId, name, prompt);
  }

  async editWhatsAppModuleFlowWithAi(shopId: string, flowId: string, prompt: string): Promise<WhatsAppFlow> {
    return editShopFlowWithAi(this.ai, shopId, flowId, prompt);
  }

  async updateWhatsAppModuleFlow(
    shopId: string,
    id: string,
    updates: { name?: string; definition?: WhatsAppFlowDefinition },
  ): Promise<WhatsAppFlow> {
    return updateShopFlow(shopId, id, updates);
  }

  async activateWhatsAppModuleFlow(shopId: string, id: string): Promise<WhatsAppFlow> {
    return activateShopFlow(shopId, id);
  }

  async deactivateWhatsAppModuleFlow(shopId: string, id: string): Promise<WhatsAppFlow> {
    return deactivateShopFlow(shopId, id);
  }

  async deleteWhatsAppModuleFlow(shopId: string, id: string): Promise<void> {
    return deleteShopFlow(shopId, id);
  }

  async listWhatsAppModuleSessions(
    shopId: string,
    page: number,
    limit: number,
    awaitingHuman?: boolean,
  ): ReturnType<typeof listShopModuleSessions> {
    return listShopModuleSessions(shopId, page, limit, awaitingHuman);
  }

  async getWhatsAppModuleSessionDetail(shopId: string, id: string): Promise<WhatsAppSession> {
    return getShopModuleSessionDetail(shopId, id);
  }

  async replyToWhatsAppModuleSession(shopId: string, id: string, text: string): Promise<WhatsAppSession> {
    return replyToShopModuleSession(this.whatsAppNotification, shopId, id, text);
  }

  async resumeWhatsAppModuleSessionBot(shopId: string, id: string): Promise<WhatsAppSession> {
    return resumeShopModuleSessionBot(shopId, id);
  }
}
