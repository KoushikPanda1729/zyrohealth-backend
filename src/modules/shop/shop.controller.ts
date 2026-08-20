import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { ShopService } from './shop.service';
import { success } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { QuotedMedicineItem } from '../../entities/MedicineShopQuote';
import { extractCatalogFieldsFromBody } from '../medicine-shops/catalog.util';
import { extractSupplierFieldsFromBody } from '../medicine-shops/supplier.util';
import { PurchaseOrderLineItem } from '../../entities/MedicineShopPurchaseOrder';
import { SaleLineItemInput } from '../medicine-shops/billing.util';
import { SalePaymentMode, ControlledDrugInfo } from '../../entities/MedicineShopSale';
import { AttendanceStatus } from '../../entities/MedicineShopAttendance';
import { LeaveStatus } from '../../entities/MedicineShopLeaveRequest';
import { PayrollMode } from '../../entities/MedicineShopStaffProfile';
import { WhatsAppProviderType } from '../../entities/TenantWhatsAppConfig';
import { WhatsAppFlowDefinition } from '../../entities/WhatsAppFlow';
import { MedicineOrderStatus } from '../../entities/MedicineOrder';

interface StaffProfileUpdateBody {
  employeeCode?: string;
  joinedAt?: string;
  monthlyBaseSalaryCents?: number;
  annualLeaveQuota?: number;
  payrollMode?: PayrollMode;
  pfEnabled?: boolean;
  pfEmployeePercent?: number;
  esiEnabled?: boolean;
  esiEmployeePercent?: number;
  professionalTaxEnabled?: boolean;
  professionalTaxCents?: number;
  tdsEnabled?: boolean;
  tdsPercent?: number;
  isActive?: boolean;
}

function shopOf(req: Request): string {
  if (!req.user?.shopId) throw AppError.forbidden('No shop context');
  return req.user.shopId;
}

function userIdOf(req: Request): string {
  if (!req.user?.id) throw AppError.unauthorized();
  return req.user.id;
}

@injectable()
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  listMyQuoteRequests = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const requests = await this.shopService.listMyQuoteRequests(shopOf(req));
      res.status(200).json(success(requests));
    } catch (err) {
      next(err);
    }
  };

  submitQuote = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { quoteId } = req.params as { quoteId: string };
      const { totalCents, items, note } = req.body as {
        totalCents: number;
        items?: QuotedMedicineItem[];
        note?: string;
      };
      if (!totalCents || totalCents <= 0) {
        throw AppError.badRequest('totalCents must be a positive number');
      }
      const quote = await this.shopService.submitQuote(shopOf(req), quoteId, {
        totalCents,
        items: Array.isArray(items) ? items : undefined,
        note,
      });
      res.status(200).json(success(quote, 'Quote submitted'));
    } catch (err) {
      next(err);
    }
  };

  declineQuote = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { quoteId } = req.params as { quoteId: string };
      const quote = await this.shopService.declineQuote(shopOf(req), quoteId);
      res.status(200).json(success(quote, 'Quote declined'));
    } catch (err) {
      next(err);
    }
  };

  downloadQuoteReceipt = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { quoteId } = req.params as { quoteId: string };
      const { buffer, filename } = await this.shopService.getQuoteReceiptPdf(
        shopOf(req),
        quoteId,
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  };

  listMyOrders = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const orders = await this.shopService.listMyOrders(shopOf(req));
      res.status(200).json(success(orders));
    } catch (err) {
      next(err);
    }
  };

  getMyOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { orderId } = req.params as { orderId: string };
      const order = await this.shopService.getMyOrder(shopOf(req), orderId);
      res.status(200).json(success(order));
    } catch (err) {
      next(err);
    }
  };

  updateMyOrderStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { orderId } = req.params as { orderId: string };
      const { status } = req.body as { status: MedicineOrderStatus };
      const order = await this.shopService.updateMyOrderStatus(shopOf(req), orderId, status);
      res.status(200).json(success(order, 'Order status updated'));
    } catch (err) {
      next(err);
    }
  };

  getMyProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const profile = await this.shopService.getMyProfile(shopOf(req));
      res.status(200).json(success({
        ...profile,
        isOwner: req.user?.shopStaffRole === 'owner',
        permissions: req.user?.permissions ?? [],
      }));
    } catch (err) {
      next(err);
    }
  };

  listCatalog = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const items = await this.shopService.listMyCatalog(shopOf(req));
      res.status(200).json(success(items));
    } catch (err) {
      next(err);
    }
  };

  createCatalogItem = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { name, priceCents } = req.body as {
        name: string;
        priceCents: number;
      };
      if (!name?.trim()) throw AppError.badRequest('name is required');
      if (!priceCents || priceCents <= 0)
        throw AppError.badRequest('priceCents must be a positive number');
      const item = await this.shopService.createCatalogItem(shopOf(req), {
        name: name.trim(),
        priceCents,
        ...extractCatalogFieldsFromBody(req.body as Record<string, unknown>),
      });
      res.status(201).json(success(item, 'Medicine added'));
    } catch (err) {
      next(err);
    }
  };

  updateCatalogItem = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { itemId } = req.params as { itemId: string };
      const { name, priceCents, isActive } = req.body as {
        name?: string;
        priceCents?: number;
        isActive?: boolean;
      };
      const item = await this.shopService.updateCatalogItem(
        shopOf(req),
        itemId,
        {
          name,
          priceCents,
          isActive,
          ...extractCatalogFieldsFromBody(req.body as Record<string, unknown>),
        },
      );
      res.status(200).json(success(item, 'Medicine updated'));
    } catch (err) {
      next(err);
    }
  };

  deleteCatalogItem = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { itemId } = req.params as { itemId: string };
      await this.shopService.deleteCatalogItem(shopOf(req), itemId);
      res.status(200).json(success(null, 'Medicine removed'));
    } catch (err) {
      next(err);
    }
  };

  downloadCatalogTemplate = (_req: Request, res: Response): void => {
    const csv = this.shopService.getCatalogTemplateCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="medicine-catalog-template.csv"',
    );
    res.send(csv);
  };

  bulkUploadCatalog = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.file) throw AppError.badRequest('No file uploaded');
      const result = await this.shopService.bulkUploadCatalog(shopOf(req), {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
      });
      res
        .status(200)
        .json(
          success(
            result,
            `${result.createdCount} added, ${result.updatedCount} updated`,
          ),
        );
    } catch (err) {
      next(err);
    }
  };

  scanCatalogImage = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) throw AppError.badRequest('No image uploaded');
      const nonImage = files.find((f) => !f.mimetype.startsWith('image/'));
      if (nonImage)
        throw AppError.badRequest(
          'Only photo uploads (JPEG/PNG/WEBP) can be scanned',
        );

      const fields = await this.shopService.scanCatalogImage(
        files.map((f) => ({
          base64: f.buffer.toString('base64'),
          mimeType: f.mimetype,
        })),
      );
      res.status(200).json(success(fields));
    } catch (err) {
      next(err);
    }
  };

  exportCatalog = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const csv = await this.shopService.exportCatalogCsv(shopOf(req));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="medicine-catalog-export.csv"',
      );
      res.send(csv);
    } catch (err) {
      next(err);
    }
  };

  getStockHistory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const catalogItemId = req.query['itemId'] as string | undefined;
      const history = await this.shopService.getStockHistory(
        shopOf(req),
        catalogItemId,
      );
      res.status(200).json(success(history));
    } catch (err) {
      next(err);
    }
  };

  exportStockHistory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { format, from, to, itemId } = req.query as {
        format?: string;
        from?: string;
        to?: string;
        itemId?: string;
      };
      const filter = { from, to, catalogItemId: itemId };
      if (format === 'xlsx') {
        const buffer = await this.shopService.exportStockHistoryXlsx(shopOf(req), filter);
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader('Content-Disposition', 'attachment; filename="stock-history.xlsx"');
        res.send(buffer);
      } else {
        const csv = await this.shopService.exportStockHistoryCsv(shopOf(req), filter);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="stock-history.csv"');
        res.send(csv);
      }
    } catch (err) {
      next(err);
    }
  };

  // ── Suppliers ───────────────────────────────────────────────────────
  listSuppliers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const suppliers = await this.shopService.listSuppliers(shopOf(req));
      res.status(200).json(success(suppliers));
    } catch (err) {
      next(err);
    }
  };

  createSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const supplier = await this.shopService.createSupplier(
        shopOf(req),
        extractSupplierFieldsFromBody(req.body as Record<string, unknown>),
      );
      res.status(201).json(success(supplier, 'Supplier added'));
    } catch (err) {
      next(err);
    }
  };

  updateSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { supplierId } = req.params as { supplierId: string };
      const supplier = await this.shopService.updateSupplier(
        shopOf(req),
        supplierId,
        extractSupplierFieldsFromBody(req.body as Record<string, unknown>),
      );
      res.status(200).json(success(supplier, 'Supplier updated'));
    } catch (err) {
      next(err);
    }
  };

  deleteSupplier = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { supplierId } = req.params as { supplierId: string };
      await this.shopService.deleteSupplier(shopOf(req), supplierId);
      res.status(200).json(success(null, 'Supplier removed'));
    } catch (err) {
      next(err);
    }
  };

  // ── Purchase Orders ─────────────────────────────────────────────────
  listPurchaseOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orders = await this.shopService.listPurchaseOrders(shopOf(req));
      res.status(200).json(success(orders));
    } catch (err) {
      next(err);
    }
  };

  createPurchaseOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { supplierId, items, note } = req.body as {
        supplierId?: string;
        items: PurchaseOrderLineItem[];
        note?: string;
      };
      const po = await this.shopService.createPurchaseOrder(shopOf(req), {
        supplierId,
        items,
        note,
      });
      res.status(201).json(success(po, 'Purchase order created'));
    } catch (err) {
      next(err);
    }
  };

  createPurchaseOrdersFromLowStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orders = await this.shopService.createPurchaseOrdersFromLowStock(shopOf(req));
      res.status(201).json(success(orders, `${orders.length} purchase order(s) created`));
    } catch (err) {
      next(err);
    }
  };

  updatePurchaseOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { poId } = req.params as { poId: string };
      const { supplierId, items, note } = req.body as {
        supplierId?: string;
        items: PurchaseOrderLineItem[];
        note?: string;
      };
      const po = await this.shopService.updatePurchaseOrder(shopOf(req), poId, {
        supplierId,
        items,
        note,
      });
      res.status(200).json(success(po, 'Purchase order updated'));
    } catch (err) {
      next(err);
    }
  };

  markPurchaseOrderSent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { poId } = req.params as { poId: string };
      const result = await this.shopService.markPurchaseOrderSent(shopOf(req), poId);
      res.status(200).json(success(result, 'Purchase order marked sent'));
    } catch (err) {
      next(err);
    }
  };

  markPurchaseOrderReceived = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { poId } = req.params as { poId: string };
      const po = await this.shopService.markPurchaseOrderReceived(shopOf(req), poId);
      res.status(200).json(success(po, 'Purchase order received — stock updated'));
    } catch (err) {
      next(err);
    }
  };

  cancelPurchaseOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { poId } = req.params as { poId: string };
      const po = await this.shopService.cancelPurchaseOrder(shopOf(req), poId);
      res.status(200).json(success(po, 'Purchase order cancelled'));
    } catch (err) {
      next(err);
    }
  };

  deletePurchaseOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { poId } = req.params as { poId: string };
      await this.shopService.deletePurchaseOrder(shopOf(req), poId);
      res.status(200).json(success(null, 'Purchase order deleted'));
    } catch (err) {
      next(err);
    }
  };

  // ── Batches ─────────────────────────────────────────────────────────
  listBatches = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { itemId } = req.params as { itemId: string };
      const batches = await this.shopService.listBatches(shopOf(req), itemId);
      res.status(200).json(success(batches));
    } catch (err) {
      next(err);
    }
  };

  addBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { itemId } = req.params as { itemId: string };
      const { batchNumber, expiryDate, quantity } = req.body as {
        batchNumber?: string;
        expiryDate?: string;
        quantity: number;
      };
      const batch = await this.shopService.addBatch(shopOf(req), itemId, {
        batchNumber,
        expiryDate,
        quantity,
      });
      res.status(201).json(success(batch, 'Batch added'));
    } catch (err) {
      next(err);
    }
  };

  deleteBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { batchId } = req.params as { batchId: string };
      await this.shopService.deleteBatch(shopOf(req), batchId);
      res.status(200).json(success(null, 'Batch removed'));
    } catch (err) {
      next(err);
    }
  };

  // ── Stock adjustments (returns/damage) ─────────────────────────────
  adjustStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { itemId } = req.params as { itemId: string };
      const { type, quantity, note } = req.body as {
        type: 'return' | 'damage';
        quantity: number;
        note?: string;
      };
      const item = await this.shopService.adjustStock(shopOf(req), itemId, type, quantity, note);
      res.status(200).json(success(item, type === 'return' ? 'Return recorded' : 'Damage recorded'));
    } catch (err) {
      next(err);
    }
  };

  // ── Billing (Sales) ─────────────────────────────────────────────────
  createSale = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { customerId, customerName, items, paymentMode, amountPaidCents, controlledDrugInfo, note } =
        req.body as {
          customerId?: string;
          customerName?: string;
          items: SaleLineItemInput[];
          paymentMode: SalePaymentMode;
          amountPaidCents?: number;
          controlledDrugInfo?: ControlledDrugInfo;
          note?: string;
        };
      const sale = await this.shopService.createSale(shopOf(req), {
        customerId,
        customerName,
        items,
        paymentMode,
        amountPaidCents,
        controlledDrugInfo,
        note,
      });
      res.status(201).json(success(sale, `Invoice #${sale.invoiceNumber} created`));
    } catch (err) {
      next(err);
    }
  };

  listSales = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const sales = await this.shopService.listSales(shopOf(req), { from, to });
      res.status(200).json(success(sales));
    } catch (err) {
      next(err);
    }
  };

  getSale = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { saleId } = req.params as { saleId: string };
      const sale = await this.shopService.getSale(shopOf(req), saleId);
      res.status(200).json(success(sale));
    } catch (err) {
      next(err);
    }
  };

  listControlledDrugRegister = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const sales = await this.shopService.listControlledDrugRegister(shopOf(req), { from, to });
      res.status(200).json(success(sales));
    } catch (err) {
      next(err);
    }
  };

  getDailyReconciliation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { date } = req.query as { date?: string };
      const summary = await this.shopService.getDailyReconciliation(
        shopOf(req),
        date || new Date().toISOString().slice(0, 10),
      );
      res.status(200).json(success(summary));
    } catch (err) {
      next(err);
    }
  };

  getSalesAnalytics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const today = new Date().toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const analytics = await this.shopService.getSalesAnalytics(
        shopOf(req),
        from || thirtyDaysAgo,
        to || today,
      );
      res.status(200).json(success(analytics));
    } catch (err) {
      next(err);
    }
  };

  // ── Customers + credit ledger ───────────────────────────────────────
  listCustomers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const customers = await this.shopService.listCustomers(shopOf(req));
      res.status(200).json(success(customers));
    } catch (err) {
      next(err);
    }
  };

  createCustomer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, phone, address } = req.body as { name: string; phone?: string; address?: string };
      const customer = await this.shopService.createCustomer(shopOf(req), { name, phone, address });
      res.status(201).json(success(customer, 'Customer added'));
    } catch (err) {
      next(err);
    }
  };

  updateCustomer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { customerId } = req.params as { customerId: string };
      const { name, phone, address, isActive } = req.body as {
        name?: string;
        phone?: string;
        address?: string;
        isActive?: boolean;
      };
      const customer = await this.shopService.updateCustomer(shopOf(req), customerId, {
        name,
        phone,
        address,
        isActive,
      });
      res.status(200).json(success(customer, 'Customer updated'));
    } catch (err) {
      next(err);
    }
  };

  getCustomerLedger = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { customerId } = req.params as { customerId: string };
      const ledger = await this.shopService.getCustomerLedger(shopOf(req), customerId);
      res.status(200).json(success(ledger));
    } catch (err) {
      next(err);
    }
  };

  recordCustomerPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { customerId } = req.params as { customerId: string };
      const { amountCents, note } = req.body as { amountCents: number; note?: string };
      const customer = await this.shopService.recordCustomerPayment(shopOf(req), customerId, amountCents, note);
      res.status(200).json(success(customer, 'Payment recorded'));
    } catch (err) {
      next(err);
    }
  };

  // ── Distributor price comparison ────────────────────────────────────
  listSupplierPrices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const prices = await this.shopService.listSupplierPricesForShop(shopOf(req));
      res.status(200).json(success(prices));
    } catch (err) {
      next(err);
    }
  };

  setSupplierPrice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { supplierId, catalogItemId, priceCents } = req.body as {
        supplierId: string;
        catalogItemId: string;
        priceCents: number;
      };
      const price = await this.shopService.setSupplierPrice(shopOf(req), supplierId, catalogItemId, priceCents);
      res.status(200).json(success(price, 'Supplier price saved'));
    } catch (err) {
      next(err);
    }
  };

  deleteSupplierPrice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { priceId } = req.params as { priceId: string };
      await this.shopService.deleteSupplierPrice(shopOf(req), priceId);
      res.status(200).json(success(null, 'Supplier price removed'));
    } catch (err) {
      next(err);
    }
  };

  compareSuppliersForItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { itemId } = req.params as { itemId: string };
      const quotes = await this.shopService.compareSuppliersForItem(shopOf(req), itemId);
      res.status(200).json(success(quotes));
    } catch (err) {
      next(err);
    }
  };

  // ── Demand prediction ────────────────────────────────────────────────
  getRestockSuggestions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const suggestions = await this.shopService.computeRestockSuggestions(shopOf(req));
      res.status(200).json(success(suggestions));
    } catch (err) {
      next(err);
    }
  };

  // ── Staff (owner/cashier sub-roles) ─────────────────────────────────
  listShopStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staff = await this.shopService.listShopStaff(shopOf(req));
      res.status(200).json(success(staff));
    } catch (err) {
      next(err);
    }
  };

  inviteShopStaff = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fullName, email, password, shopRoleId } = req.body as {
        fullName: string; email: string; password?: string; shopRoleId?: string;
      };
      if (!fullName) throw AppError.badRequest('fullName is required');
      if (!email) throw AppError.badRequest('email is required');
      if (password !== undefined && password.length < 8) {
        throw AppError.badRequest('Password must be at least 8 characters');
      }
      const result = await this.shopService.inviteShopStaff(shopOf(req), { fullName, email, password, shopRoleId });
      res.status(201).json(success(result, 'Staff account created'));
    } catch (err) {
      next(err);
    }
  };

  toggleShopStaffActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { staffId } = req.params as { staffId: string };
      const staff = await this.shopService.toggleShopStaffActive(shopOf(req), staffId);
      res.status(200).json(success(staff, staff.isActive ? 'Staff account unbanned' : 'Staff account banned'));
    } catch (err) {
      next(err);
    }
  };

  // ── Custom shop roles & permissions ─────────────────────────────────
  listAssignableShopPermissions = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const perms = await this.shopService.listAssignableShopPermissions();
      res.status(200).json(success(perms));
    } catch (err) {
      next(err);
    }
  };

  listShopRoles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const roles = await this.shopService.listShopRoles(shopOf(req));
      res.status(200).json(success(roles));
    } catch (err) {
      next(err);
    }
  };

  getShopRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roleId } = req.params as { roleId: string };
      const role = await this.shopService.getShopRole(shopOf(req), roleId);
      res.status(200).json(success(role));
    } catch (err) {
      next(err);
    }
  };

  createShopRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, description, permissionKeys } = req.body as {
        name: string; description?: string; permissionKeys?: string[];
      };
      if (!name) throw AppError.badRequest('name is required');
      const role = await this.shopService.createShopRole(
        shopOf(req), name, description, Array.isArray(permissionKeys) ? permissionKeys : [],
      );
      res.status(201).json(success(role, 'Role created'));
    } catch (err) {
      next(err);
    }
  };

  updateShopRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roleId } = req.params as { roleId: string };
      const { name, description, permissionKeys } = req.body as {
        name?: string; description?: string; permissionKeys?: string[];
      };
      const role = await this.shopService.updateShopRole(shopOf(req), roleId, { name, description, permissionKeys });
      res.status(200).json(success(role, 'Role updated'));
    } catch (err) {
      next(err);
    }
  };

  deleteShopRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roleId } = req.params as { roleId: string };
      await this.shopService.deleteShopRole(shopOf(req), roleId);
      res.status(200).json(success(null, 'Role deleted'));
    } catch (err) {
      next(err);
    }
  };

  assignShopStaffRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { staffId } = req.params as { staffId: string };
      const { roleId } = req.body as { roleId: string };
      if (!roleId) throw AppError.badRequest('roleId is required');
      const staff = await this.shopService.assignShopStaffRole(shopOf(req), staffId, roleId);
      res.status(200).json(success(staff, 'Role assigned'));
    } catch (err) {
      next(err);
    }
  };

  // ── Attendance ───────────────────────────────────────────────────────
  selfCheckIn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const row = await this.shopService.selfCheckIn(shopOf(req), userIdOf(req));
      res.status(200).json(success(row, 'Checked in'));
    } catch (err) {
      next(err);
    }
  };

  selfCheckOut = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const row = await this.shopService.selfCheckOut(shopOf(req), userIdOf(req));
      res.status(200).json(success(row, 'Checked out'));
    } catch (err) {
      next(err);
    }
  };

  getMyTodayAttendance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const row = await this.shopService.getMyTodayAttendance(userIdOf(req));
      res.status(200).json(success(row));
    } catch (err) {
      next(err);
    }
  };

  markAttendance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { staffId } = req.params as { staffId: string };
      const { date, status, notes } = req.body as { date: string; status: AttendanceStatus; notes?: string };
      if (!date) throw AppError.badRequest('date is required');
      if (!status) throw AppError.badRequest('status is required');
      const row = await this.shopService.markAttendance(shopOf(req), staffId, date, status, userIdOf(req), notes);
      res.status(200).json(success(row, 'Attendance updated'));
    } catch (err) {
      next(err);
    }
  };

  listAttendance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { staffId, from, to } = req.query as { staffId?: string; from?: string; to?: string };
      const rows = await this.shopService.listAttendance(shopOf(req), { staffUserId: staffId, from, to });
      res.status(200).json(success(rows));
    } catch (err) {
      next(err);
    }
  };

  // Self-scoped history (not just today's status) — every staff member can
  // see their OWN past attendance, no permission needed since it's their
  // own data. Distinct from listAttendance above, which is the owner/
  // manager view across all staff.
  getMyAttendanceHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const rows = await this.shopService.listAttendance(shopOf(req), { staffUserId: userIdOf(req), from, to });
      res.status(200).json(success(rows));
    } catch (err) {
      next(err);
    }
  };

  // ── Leave ────────────────────────────────────────────────────────────
  requestLeave = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { startDate, endDate, reason } = req.body as { startDate: string; endDate: string; reason?: string };
      if (!startDate || !endDate) throw AppError.badRequest('startDate and endDate are required');
      const request = await this.shopService.requestLeave(shopOf(req), userIdOf(req), startDate, endDate, reason);
      res.status(201).json(success(request, 'Leave requested'));
    } catch (err) {
      next(err);
    }
  };

  ownerDirectMarkLeave = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { staffId } = req.params as { staffId: string };
      const { startDate, endDate, reason } = req.body as { startDate: string; endDate: string; reason?: string };
      if (!startDate || !endDate) throw AppError.badRequest('startDate and endDate are required');
      const request = await this.shopService.ownerDirectMarkLeave(
        shopOf(req), staffId, startDate, endDate, reason, userIdOf(req),
      );
      res.status(201).json(success(request, 'Leave marked'));
    } catch (err) {
      next(err);
    }
  };

  decideLeaveRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { requestId } = req.params as { requestId: string };
      const { approve, decisionNote } = req.body as { approve: boolean; decisionNote?: string };
      const request = await this.shopService.decideLeaveRequest(
        shopOf(req), requestId, !!approve, userIdOf(req), decisionNote,
      );
      res.status(200).json(success(request, approve ? 'Leave approved' : 'Leave rejected'));
    } catch (err) {
      next(err);
    }
  };

  listLeaveRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { staffId, status } = req.query as { staffId?: string; status?: LeaveStatus };
      const requests = await this.shopService.listLeaveRequests(shopOf(req), { staffUserId: staffId, status });
      res.status(200).json(success(requests));
    } catch (err) {
      next(err);
    }
  };

  getMyLeaveBalance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const balance = await this.shopService.getLeaveBalance(shopOf(req), userIdOf(req));
      res.status(200).json(success(balance));
    } catch (err) {
      next(err);
    }
  };

  // Self-scoped history — every staff member can see their OWN past leave
  // requests (any status), not just the current balance. Distinct from
  // listLeaveRequests above, which requires shop_leave.manage since it
  // lists across all staff.
  getMyLeaveRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requests = await this.shopService.listLeaveRequests(shopOf(req), { staffUserId: userIdOf(req) });
      res.status(200).json(success(requests));
    } catch (err) {
      next(err);
    }
  };

  getStaffLeaveBalance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { staffId } = req.params as { staffId: string };
      const balance = await this.shopService.getLeaveBalance(shopOf(req), staffId);
      res.status(200).json(success(balance));
    } catch (err) {
      next(err);
    }
  };

  // ── Payroll ──────────────────────────────────────────────────────────
  listStaffProfiles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profiles = await this.shopService.listStaffProfiles(shopOf(req));
      res.status(200).json(success(profiles));
    } catch (err) {
      next(err);
    }
  };

  upsertStaffProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { staffId } = req.params as { staffId: string };
      const profile = await this.shopService.upsertStaffProfile(
        shopOf(req), staffId, req.body as StaffProfileUpdateBody,
      );
      res.status(200).json(success(profile, 'Salary profile saved'));
    } catch (err) {
      next(err);
    }
  };

  generatePayrollRecord = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { staffId } = req.params as { staffId: string };
      const { month } = req.body as { month: string };
      if (!month) throw AppError.badRequest('month is required (YYYY-MM)');
      const record = await this.shopService.generatePayrollRecord(shopOf(req), staffId, month);
      res.status(200).json(success(record, 'Payroll generated'));
    } catch (err) {
      next(err);
    }
  };

  addPayrollAdjustment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { recordId } = req.params as { recordId: string };
      const { label, amountCents, type } = req.body as { label: string; amountCents: number; type: 'bonus' | 'deduction' };
      if (!label || !amountCents || !type) throw AppError.badRequest('label, amountCents, and type are required');
      const record = await this.shopService.addPayrollAdjustment(shopOf(req), recordId, { label, amountCents, type });
      res.status(200).json(success(record, 'Adjustment added'));
    } catch (err) {
      next(err);
    }
  };

  finalizePayrollRecord = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { recordId } = req.params as { recordId: string };
      const record = await this.shopService.finalizePayrollRecord(shopOf(req), recordId);
      res.status(200).json(success(record, 'Payroll finalized'));
    } catch (err) {
      next(err);
    }
  };

  markPayrollPaid = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { recordId } = req.params as { recordId: string };
      const { paidVia, notes } = req.body as { paidVia: string; notes?: string };
      if (!paidVia) throw AppError.badRequest('paidVia is required');
      const record = await this.shopService.markPayrollPaid(shopOf(req), recordId, paidVia, notes);
      res.status(200).json(success(record, 'Marked as paid'));
    } catch (err) {
      next(err);
    }
  };

  // Anyone can see their OWN payroll history/payslip — shop_payroll.view
  // only gates seeing OTHER staff members' salary data, not your own pay.
  private canViewAllPayroll(req: Request): boolean {
    const perms = req.user?.permissions ?? [];
    return perms.includes('*') || perms.includes('shop_payroll.view');
  }

  listPayrollRecords = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { staffId, month } = req.query as { staffId?: string; month?: string };
      const staffUserId = this.canViewAllPayroll(req) ? staffId : userIdOf(req);
      const records = await this.shopService.listPayrollRecords(shopOf(req), { staffUserId, month });
      res.status(200).json(success(records));
    } catch (err) {
      next(err);
    }
  };

  downloadPayslip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { recordId } = req.params as { recordId: string };
      const shopId = shopOf(req);
      if (!this.canViewAllPayroll(req)) {
        const record = await this.shopService.getPayrollRecord(shopId, recordId);
        if (record.staffUserId !== userIdOf(req)) throw AppError.forbidden();
      }
      const { buffer, filename } = await this.shopService.downloadPayslip(shopId, recordId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  };

  // ── WhatsApp ─────────────────────────────────────────────────────────
  getMyWhatsAppStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await this.shopService.getMyWhatsAppStatus(shopOf(req));
      res.status(200).json(success(status));
    } catch (err) {
      next(err);
    }
  };

  getMyWhatsAppSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await this.shopService.getMyWhatsAppSession(shopOf(req));
      res.status(200).json(success(session));
    } catch (err) {
      next(err);
    }
  };

  resetMyWhatsAppSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await this.shopService.resetMyWhatsAppSession(shopOf(req));
      res.status(200).json(success(session, 'Conversation reset'));
    } catch (err) {
      next(err);
    }
  };

  // ── WhatsApp Module ──────────────────────────────────────────────────
  getWhatsAppModuleStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await this.shopService.getWhatsAppModuleStatus(shopOf(req));
      res.status(200).json(success(status));
    } catch (err) {
      next(err);
    }
  };

  getWhatsAppModuleConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await this.shopService.getWhatsAppModuleConfig(shopOf(req));
      res.status(200).json(success(config));
    } catch (err) {
      next(err);
    }
  };

  updateWhatsAppModuleConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { provider } = req.body as { provider?: WhatsAppProviderType };
      if (!provider) throw AppError.badRequest('provider is required');
      const result = await this.shopService.updateWhatsAppModuleConfig(shopOf(req), req.body as Parameters<ShopService['updateWhatsAppModuleConfig']>[1]);
      res.status(200).json(success(result, 'WhatsApp settings saved'));
    } catch (err) {
      next(err);
    }
  };

  listWhatsAppModuleFlows = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const flows = await this.shopService.listWhatsAppModuleFlows(shopOf(req));
      res.status(200).json(success(flows));
    } catch (err) {
      next(err);
    }
  };

  getWhatsAppModuleFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { flowId } = req.params as { flowId: string };
      const flow = await this.shopService.getWhatsAppModuleFlow(shopOf(req), flowId);
      res.status(200).json(success(flow));
    } catch (err) {
      next(err);
    }
  };

  createWhatsAppModuleFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name } = req.body as { name: string };
      if (!name) throw AppError.badRequest('name is required');
      const flow = await this.shopService.createWhatsAppModuleFlow(shopOf(req), name);
      res.status(201).json(success(flow, 'Flow created'));
    } catch (err) {
      next(err);
    }
  };

  generateWhatsAppModuleFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, prompt } = req.body as { name: string; prompt: string };
      if (!name || !prompt) throw AppError.badRequest('name and prompt are required');
      const flow = await this.shopService.generateWhatsAppModuleFlow(shopOf(req), name, prompt);
      res.status(201).json(success(flow, 'Flow generated'));
    } catch (err) {
      next(err);
    }
  };

  editWhatsAppModuleFlowWithAi = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { flowId } = req.params as { flowId: string };
      const { prompt } = req.body as { prompt: string };
      if (!prompt) throw AppError.badRequest('prompt is required');
      const flow = await this.shopService.editWhatsAppModuleFlowWithAi(shopOf(req), flowId, prompt);
      res.status(200).json(success(flow, 'Flow updated'));
    } catch (err) {
      next(err);
    }
  };

  updateWhatsAppModuleFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { flowId } = req.params as { flowId: string };
      const { name, definition } = req.body as { name?: string; definition?: WhatsAppFlowDefinition };
      const flow = await this.shopService.updateWhatsAppModuleFlow(shopOf(req), flowId, { name, definition });
      res.status(200).json(success(flow, 'Flow saved'));
    } catch (err) {
      next(err);
    }
  };

  activateWhatsAppModuleFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { flowId } = req.params as { flowId: string };
      const flow = await this.shopService.activateWhatsAppModuleFlow(shopOf(req), flowId);
      res.status(200).json(success(flow, 'Flow activated'));
    } catch (err) {
      next(err);
    }
  };

  deactivateWhatsAppModuleFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { flowId } = req.params as { flowId: string };
      const flow = await this.shopService.deactivateWhatsAppModuleFlow(shopOf(req), flowId);
      res.status(200).json(success(flow, 'Flow deactivated'));
    } catch (err) {
      next(err);
    }
  };

  deleteWhatsAppModuleFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { flowId } = req.params as { flowId: string };
      await this.shopService.deleteWhatsAppModuleFlow(shopOf(req), flowId);
      res.status(200).json(success(null, 'Flow deleted'));
    } catch (err) {
      next(err);
    }
  };

  listWhatsAppModuleSessions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, awaitingHuman } = req.query as { page?: string; limit?: string; awaitingHuman?: string };
      const result = await this.shopService.listWhatsAppModuleSessions(
        shopOf(req),
        page ? parseInt(page, 10) : 1,
        limit ? parseInt(limit, 10) : 20,
        awaitingHuman !== undefined ? awaitingHuman === 'true' : undefined,
      );
      res.status(200).json({ success: true, data: result.data, pagination: { total: result.total } });
    } catch (err) {
      next(err);
    }
  };

  getWhatsAppModuleSessionDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params as { sessionId: string };
      const session = await this.shopService.getWhatsAppModuleSessionDetail(shopOf(req), sessionId);
      res.status(200).json(success(session));
    } catch (err) {
      next(err);
    }
  };

  replyToWhatsAppModuleSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params as { sessionId: string };
      const { text } = req.body as { text: string };
      if (!text?.trim()) throw AppError.badRequest('text is required');
      const session = await this.shopService.replyToWhatsAppModuleSession(shopOf(req), sessionId, text.trim());
      res.status(200).json(success(session, 'Reply sent'));
    } catch (err) {
      next(err);
    }
  };

  resumeWhatsAppModuleSessionBot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params as { sessionId: string };
      const session = await this.shopService.resumeWhatsAppModuleSessionBot(shopOf(req), sessionId);
      res.status(200).json(success(session, 'Bot resumed'));
    } catch (err) {
      next(err);
    }
  };
}
