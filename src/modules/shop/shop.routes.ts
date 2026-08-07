import { Router } from 'express';
import { container } from 'tsyringe';
import { ShopController } from './shop.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { requireShopOwner } from '../../middleware/requireShopOwner.middleware';
import {
  uploadMiddleware,
  catalogUploadMiddleware,
} from '../../middleware/upload.middleware';

const router = Router();
const ctrl = container.resolve(ShopController);

router.use(verifyToken, attachRole, requireRole('shop'));
// A cashier (see requireShopOwner.middleware.ts) can bill at the counter,
// view the catalog/customers/sales, and record customer payments — but
// not touch catalog data, suppliers/purchase orders, or financial
// reports, and can't invite more staff. Applied per-route below rather
// than as a blanket gate, since most of this router (billing, viewing)
// should stay open to a cashier.

router.get('/me', (req, res, next) => {
  void ctrl.getMyProfile(req, res, next);
});

// Registered before the /catalog/:itemId routes below so Express doesn't
// match these literal path segments as an :itemId param.
router.get('/catalog/bulk-upload/template', ctrl.downloadCatalogTemplate);
router.post(
  '/catalog/bulk-upload',
  requireShopOwner,
  catalogUploadMiddleware.single('file'),
  (req, res, next) => {
    void ctrl.bulkUploadCatalog(req, res, next);
  },
);
router.post(
  '/catalog/scan',
  requireShopOwner,
  uploadMiddleware.array('files', 4),
  (req, res, next) => {
    void ctrl.scanCatalogImage(req, res, next);
  },
);
router.get('/catalog/export', (req, res, next) => {
  void ctrl.exportCatalog(req, res, next);
});
router.get('/catalog/stock-history', (req, res, next) => {
  void ctrl.getStockHistory(req, res, next);
});
router.get('/catalog/stock-history/export', (req, res, next) => {
  void ctrl.exportStockHistory(req, res, next);
});

router.get('/catalog', (req, res, next) => {
  void ctrl.listCatalog(req, res, next);
});
router.post('/catalog', requireShopOwner, (req, res, next) => {
  void ctrl.createCatalogItem(req, res, next);
});
router.patch('/catalog/:itemId', requireShopOwner, (req, res, next) => {
  void ctrl.updateCatalogItem(req, res, next);
});
router.delete('/catalog/:itemId', requireShopOwner, (req, res, next) => {
  void ctrl.deleteCatalogItem(req, res, next);
});

// ── Suppliers ─────────────────────────────────────────────────────────
router.get('/suppliers', (req, res, next) => {
  void ctrl.listSuppliers(req, res, next);
});
router.post('/suppliers', requireShopOwner, (req, res, next) => {
  void ctrl.createSupplier(req, res, next);
});
router.patch('/suppliers/:supplierId', requireShopOwner, (req, res, next) => {
  void ctrl.updateSupplier(req, res, next);
});
router.delete('/suppliers/:supplierId', requireShopOwner, (req, res, next) => {
  void ctrl.deleteSupplier(req, res, next);
});

// ── Purchase Orders ───────────────────────────────────────────────────
router.get('/purchase-orders', (req, res, next) => {
  void ctrl.listPurchaseOrders(req, res, next);
});
router.post('/purchase-orders', requireShopOwner, (req, res, next) => {
  void ctrl.createPurchaseOrder(req, res, next);
});
router.post('/purchase-orders/auto-create-from-low-stock', requireShopOwner, (req, res, next) => {
  void ctrl.createPurchaseOrdersFromLowStock(req, res, next);
});
router.patch('/purchase-orders/:poId', requireShopOwner, (req, res, next) => {
  void ctrl.updatePurchaseOrder(req, res, next);
});
router.patch('/purchase-orders/:poId/send', requireShopOwner, (req, res, next) => {
  void ctrl.markPurchaseOrderSent(req, res, next);
});
router.patch('/purchase-orders/:poId/receive', requireShopOwner, (req, res, next) => {
  void ctrl.markPurchaseOrderReceived(req, res, next);
});
router.patch('/purchase-orders/:poId/cancel', requireShopOwner, (req, res, next) => {
  void ctrl.cancelPurchaseOrder(req, res, next);
});
router.delete('/purchase-orders/:poId', requireShopOwner, (req, res, next) => {
  void ctrl.deletePurchaseOrder(req, res, next);
});

// ── Batches (per catalog item) ───────────────────────────────────────
router.get('/catalog/:itemId/batches', (req, res, next) => {
  void ctrl.listBatches(req, res, next);
});
router.post('/catalog/:itemId/batches', requireShopOwner, (req, res, next) => {
  void ctrl.addBatch(req, res, next);
});
router.delete('/catalog/batches/:batchId', requireShopOwner, (req, res, next) => {
  void ctrl.deleteBatch(req, res, next);
});
router.post('/catalog/:itemId/adjust-stock', requireShopOwner, (req, res, next) => {
  void ctrl.adjustStock(req, res, next);
});
router.get('/catalog/:itemId/supplier-comparison', (req, res, next) => {
  void ctrl.compareSuppliersForItem(req, res, next);
});

// ── Billing (Sales) ───────────────────────────────────────────────────
router.get('/sales', (req, res, next) => {
  void ctrl.listSales(req, res, next);
});
router.post('/sales', (req, res, next) => {
  void ctrl.createSale(req, res, next);
});
router.get('/sales/controlled-drug-register', (req, res, next) => {
  void ctrl.listControlledDrugRegister(req, res, next);
});
router.get('/sales/:saleId', (req, res, next) => {
  void ctrl.getSale(req, res, next);
});

router.get('/reports/daily-reconciliation', requireShopOwner, (req, res, next) => {
  void ctrl.getDailyReconciliation(req, res, next);
});
router.get('/reports/analytics', requireShopOwner, (req, res, next) => {
  void ctrl.getSalesAnalytics(req, res, next);
});

// ── Customers + credit ledger ─────────────────────────────────────────
router.get('/customers', (req, res, next) => {
  void ctrl.listCustomers(req, res, next);
});
router.post('/customers', (req, res, next) => {
  void ctrl.createCustomer(req, res, next);
});
router.patch('/customers/:customerId', (req, res, next) => {
  void ctrl.updateCustomer(req, res, next);
});
router.get('/customers/:customerId/ledger', (req, res, next) => {
  void ctrl.getCustomerLedger(req, res, next);
});
router.post('/customers/:customerId/payments', (req, res, next) => {
  void ctrl.recordCustomerPayment(req, res, next);
});

// ── Distributor price comparison ──────────────────────────────────────
router.get('/supplier-prices', (req, res, next) => {
  void ctrl.listSupplierPrices(req, res, next);
});
router.put('/supplier-prices', requireShopOwner, (req, res, next) => {
  void ctrl.setSupplierPrice(req, res, next);
});
router.delete('/supplier-prices/:priceId', requireShopOwner, (req, res, next) => {
  void ctrl.deleteSupplierPrice(req, res, next);
});

// ── Demand prediction ──────────────────────────────────────────────────
router.get('/restock-suggestions', (req, res, next) => {
  void ctrl.getRestockSuggestions(req, res, next);
});

// ── Staff (owner/cashier sub-roles) — owner-only in every direction ────
router.get('/staff', requireShopOwner, (req, res, next) => {
  void ctrl.listShopStaff(req, res, next);
});
router.post('/staff', requireShopOwner, (req, res, next) => {
  void ctrl.inviteShopStaff(req, res, next);
});
router.patch('/staff/:staffId/toggle-active', requireShopOwner, (req, res, next) => {
  void ctrl.toggleShopStaffActive(req, res, next);
});

router.get('/quote-requests', (req, res, next) => {
  void ctrl.listMyQuoteRequests(req, res, next);
});
router.patch('/quote-requests/:quoteId', (req, res, next) => {
  void ctrl.submitQuote(req, res, next);
});
router.post('/quote-requests/:quoteId/decline', (req, res, next) => {
  void ctrl.declineQuote(req, res, next);
});
router.get('/quote-requests/:quoteId/receipt.pdf', (req, res, next) => {
  void ctrl.downloadQuoteReceipt(req, res, next);
});

export { router as shopRouter };
