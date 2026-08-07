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

function shopOf(req: Request): string {
  if (!req.user?.shopId) throw AppError.forbidden('No shop context');
  return req.user.shopId;
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

  getMyProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const profile = await this.shopService.getMyProfile(shopOf(req));
      res.status(200).json(success(profile));
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
      const { fullName, email, password } = req.body as { fullName: string; email: string; password?: string };
      if (!fullName) throw AppError.badRequest('fullName is required');
      if (!email) throw AppError.badRequest('email is required');
      if (password !== undefined && password.length < 8) {
        throw AppError.badRequest('Password must be at least 8 characters');
      }
      const result = await this.shopService.inviteShopStaff(shopOf(req), { fullName, email, password });
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
}
