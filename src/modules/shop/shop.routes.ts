import { Router } from 'express';
import { container } from 'tsyringe';
import { ShopController } from './shop.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { requireShopOwner } from '../../middleware/requireShopOwner.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import {
  uploadMiddleware,
  catalogUploadMiddleware,
} from '../../middleware/upload.middleware';

const router = Router();
const ctrl = container.resolve(ShopController);

router.use(verifyToken, attachRole, requireRole('shop'));
// The owner always passes every requirePermission check below (attachRole
// grants them permissions: ['*'], same as super_admin) — everyone else's
// access depends on their assigned MedicineShopRole. Billing/viewing/
// customer routes stay ungated (open to any shop staff) to match the
// original cashier-tier behavior; only what used to be hard owner-only
// gates are now delegable via a custom role. Staff/role administration
// itself stays requireShopOwner — a delegated permission should never be
// able to grant itself (or anyone else) more permissions.

router.get('/me', (req, res, next) => {
  void ctrl.getMyProfile(req, res, next);
});

// Registered before the /catalog/:itemId routes below so Express doesn't
// match these literal path segments as an :itemId param.
router.get('/catalog/bulk-upload/template', ctrl.downloadCatalogTemplate);
router.post(
  '/catalog/bulk-upload',
  requirePermission('shop_catalog.manage'),
  catalogUploadMiddleware.single('file'),
  (req, res, next) => {
    void ctrl.bulkUploadCatalog(req, res, next);
  },
);
router.post(
  '/catalog/scan',
  requirePermission('shop_catalog.manage'),
  uploadMiddleware.array('files', 4),
  (req, res, next) => {
    void ctrl.scanCatalogImage(req, res, next);
  },
);
router.post(
  '/catalog/images',
  requirePermission('shop_catalog.manage'),
  uploadMiddleware.array('files', 6),
  (req, res, next) => {
    void ctrl.uploadCatalogImages(req, res, next);
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
router.post('/catalog', requirePermission('shop_catalog.manage'), (req, res, next) => {
  void ctrl.createCatalogItem(req, res, next);
});
router.patch('/catalog/:itemId', requirePermission('shop_catalog.manage'), (req, res, next) => {
  void ctrl.updateCatalogItem(req, res, next);
});
router.delete('/catalog/:itemId', requirePermission('shop_catalog.manage'), (req, res, next) => {
  void ctrl.deleteCatalogItem(req, res, next);
});

// ── Suppliers ─────────────────────────────────────────────────────────
router.get('/suppliers', (req, res, next) => {
  void ctrl.listSuppliers(req, res, next);
});
router.post('/suppliers', requirePermission('shop_suppliers.manage'), (req, res, next) => {
  void ctrl.createSupplier(req, res, next);
});
router.patch('/suppliers/:supplierId', requirePermission('shop_suppliers.manage'), (req, res, next) => {
  void ctrl.updateSupplier(req, res, next);
});
router.delete('/suppliers/:supplierId', requirePermission('shop_suppliers.manage'), (req, res, next) => {
  void ctrl.deleteSupplier(req, res, next);
});

// ── Purchase Orders ───────────────────────────────────────────────────
router.get('/purchase-orders', (req, res, next) => {
  void ctrl.listPurchaseOrders(req, res, next);
});
router.post('/purchase-orders', requirePermission('shop_purchase_orders.manage'), (req, res, next) => {
  void ctrl.createPurchaseOrder(req, res, next);
});
router.post('/purchase-orders/auto-create-from-low-stock', requirePermission('shop_purchase_orders.manage'), (req, res, next) => {
  void ctrl.createPurchaseOrdersFromLowStock(req, res, next);
});
router.patch('/purchase-orders/:poId', requirePermission('shop_purchase_orders.manage'), (req, res, next) => {
  void ctrl.updatePurchaseOrder(req, res, next);
});
router.patch('/purchase-orders/:poId/send', requirePermission('shop_purchase_orders.manage'), (req, res, next) => {
  void ctrl.markPurchaseOrderSent(req, res, next);
});
router.patch('/purchase-orders/:poId/receive', requirePermission('shop_purchase_orders.manage'), (req, res, next) => {
  void ctrl.markPurchaseOrderReceived(req, res, next);
});
router.patch('/purchase-orders/:poId/cancel', requirePermission('shop_purchase_orders.manage'), (req, res, next) => {
  void ctrl.cancelPurchaseOrder(req, res, next);
});
router.delete('/purchase-orders/:poId', requirePermission('shop_purchase_orders.manage'), (req, res, next) => {
  void ctrl.deletePurchaseOrder(req, res, next);
});

// ── Batches (per catalog item) ───────────────────────────────────────
router.get('/catalog/:itemId/batches', (req, res, next) => {
  void ctrl.listBatches(req, res, next);
});
router.post('/catalog/:itemId/batches', requirePermission('shop_catalog.manage'), (req, res, next) => {
  void ctrl.addBatch(req, res, next);
});
router.delete('/catalog/batches/:batchId', requirePermission('shop_catalog.manage'), (req, res, next) => {
  void ctrl.deleteBatch(req, res, next);
});
router.post('/catalog/:itemId/adjust-stock', requirePermission('shop_catalog.manage'), (req, res, next) => {
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

router.get('/reports/daily-reconciliation', requirePermission('shop_reports.view'), (req, res, next) => {
  void ctrl.getDailyReconciliation(req, res, next);
});
router.get('/reports/analytics', requirePermission('shop_reports.view'), (req, res, next) => {
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
router.put('/supplier-prices', requirePermission('shop_supplier_prices.manage'), (req, res, next) => {
  void ctrl.setSupplierPrice(req, res, next);
});
router.delete('/supplier-prices/:priceId', requirePermission('shop_supplier_prices.manage'), (req, res, next) => {
  void ctrl.deleteSupplierPrice(req, res, next);
});

// ── Demand prediction ──────────────────────────────────────────────────
router.get('/restock-suggestions', (req, res, next) => {
  void ctrl.getRestockSuggestions(req, res, next);
});

// ── Staff — owner-only in every direction. Custom-role permissions are
// delegable to non-owner staff for the modules above, but staff/role
// ADMINISTRATION itself never is — otherwise a delegated shop_staff.manage
// permission could grant its holder (or anyone else) more power than the
// owner intended. ───────────────────────────────────────────────────────
router.get('/staff', requireShopOwner, (req, res, next) => {
  void ctrl.listShopStaff(req, res, next);
});
router.post('/staff', requireShopOwner, (req, res, next) => {
  void ctrl.inviteShopStaff(req, res, next);
});
router.patch('/staff/:staffId/toggle-active', requireShopOwner, (req, res, next) => {
  void ctrl.toggleShopStaffActive(req, res, next);
});
router.patch('/staff/:staffId/role', requireShopOwner, (req, res, next) => {
  void ctrl.assignShopStaffRole(req, res, next);
});

// ── Custom roles & module-wise permissions — owner-only (see above) ────
router.get('/permissions', requireShopOwner, (req, res, next) => {
  void ctrl.listAssignableShopPermissions(req, res, next);
});
router.get('/roles', requireShopOwner, (req, res, next) => {
  void ctrl.listShopRoles(req, res, next);
});
router.get('/roles/:roleId', requireShopOwner, (req, res, next) => {
  void ctrl.getShopRole(req, res, next);
});
router.post('/roles', requireShopOwner, (req, res, next) => {
  void ctrl.createShopRole(req, res, next);
});
router.patch('/roles/:roleId', requireShopOwner, (req, res, next) => {
  void ctrl.updateShopRole(req, res, next);
});
router.delete('/roles/:roleId', requireShopOwner, (req, res, next) => {
  void ctrl.deleteShopRole(req, res, next);
});

// ── Attendance — self-service for everyone, managing others requires
// shop_attendance.manage (owner always has it) ─────────────────────────
router.post('/attendance/check-in', (req, res, next) => {
  void ctrl.selfCheckIn(req, res, next);
});
router.post('/attendance/check-out', (req, res, next) => {
  void ctrl.selfCheckOut(req, res, next);
});
router.get('/attendance/me/today', (req, res, next) => {
  void ctrl.getMyTodayAttendance(req, res, next);
});
router.get('/attendance/me', (req, res, next) => {
  void ctrl.getMyAttendanceHistory(req, res, next);
});
router.get('/attendance', requirePermission('shop_attendance.manage'), (req, res, next) => {
  void ctrl.listAttendance(req, res, next);
});
router.put('/attendance/:staffId', requirePermission('shop_attendance.manage'), (req, res, next) => {
  void ctrl.markAttendance(req, res, next);
});

// ── Leave — self-service request/balance for everyone, approving/
// direct-marking others requires shop_leave.manage ─────────────────────
router.post('/leave/requests', (req, res, next) => {
  void ctrl.requestLeave(req, res, next);
});
router.get('/leave/me/balance', (req, res, next) => {
  void ctrl.getMyLeaveBalance(req, res, next);
});
router.get('/leave/me/requests', (req, res, next) => {
  void ctrl.getMyLeaveRequests(req, res, next);
});
router.get('/leave/requests', requirePermission('shop_leave.manage'), (req, res, next) => {
  void ctrl.listLeaveRequests(req, res, next);
});
router.patch('/leave/requests/:requestId/decide', requirePermission('shop_leave.manage'), (req, res, next) => {
  void ctrl.decideLeaveRequest(req, res, next);
});
router.post('/leave/:staffId/mark', requirePermission('shop_leave.manage'), (req, res, next) => {
  void ctrl.ownerDirectMarkLeave(req, res, next);
});
router.get('/leave/:staffId/balance', requirePermission('shop_leave.manage'), (req, res, next) => {
  void ctrl.getStaffLeaveBalance(req, res, next);
});

// ── Payroll — every shop user can always see their OWN payroll records
// and download their OWN payslip (records/payslip.pdf routes below stay
// ungated and self-filter in the controller); shop_payroll.view/manage
// only gates seeing or changing OTHER staff members' salary/payroll
// data. ──────────────────────────────────────────────────────────────────
router.get('/payroll/staff-profiles', requirePermission('shop_payroll.view'), (req, res, next) => {
  void ctrl.listStaffProfiles(req, res, next);
});
router.put('/payroll/staff-profiles/:staffId', requirePermission('shop_payroll.manage'), (req, res, next) => {
  void ctrl.upsertStaffProfile(req, res, next);
});
// Open to any shop staff — listPayrollRecords/downloadPayslip enforce
// "your own records, or shop_payroll.view for everyone else's" internally.
router.get('/payroll/records', (req, res, next) => {
  void ctrl.listPayrollRecords(req, res, next);
});
router.post('/payroll/:staffId/generate', requirePermission('shop_payroll.manage'), (req, res, next) => {
  void ctrl.generatePayrollRecord(req, res, next);
});
router.post('/payroll/records/:recordId/adjustments', requirePermission('shop_payroll.manage'), (req, res, next) => {
  void ctrl.addPayrollAdjustment(req, res, next);
});
router.patch('/payroll/records/:recordId/finalize', requirePermission('shop_payroll.manage'), (req, res, next) => {
  void ctrl.finalizePayrollRecord(req, res, next);
});
router.patch('/payroll/records/:recordId/mark-paid', requirePermission('shop_payroll.manage'), (req, res, next) => {
  void ctrl.markPayrollPaid(req, res, next);
});
router.get('/payroll/records/:recordId/payslip.pdf', (req, res, next) => {
  void ctrl.downloadPayslip(req, res, next);
});

// ── WhatsApp — status/conversation viewing (of the shop-replies-to-
// tenant-quote-requests relationship) open to any shop staff; resetting a
// stuck conversation is owner-only. This is a DIFFERENT, simpler concern
// than the WhatsApp Module block below. ────────────────────────────────
router.get('/whatsapp/status', (req, res, next) => {
  void ctrl.getMyWhatsAppStatus(req, res, next);
});
router.get('/whatsapp/session', (req, res, next) => {
  void ctrl.getMyWhatsAppSession(req, res, next);
});
router.post('/whatsapp/session/reset', requireShopOwner, (req, res, next) => {
  void ctrl.resetMyWhatsAppSession(req, res, next);
});

// ── WhatsApp Module — a standalone shop's OWN independent WhatsApp
// Business presence (own provider account, own flow builder, own
// customer conversations), only usable once a platform super admin has
// enabled it for this shop (see platform.routes.ts). Owner-only in every
// direction — this is credentials + a whole separate customer channel,
// not day-to-day operational work to delegate. ─────────────────────────
router.get('/whatsapp-module/status', requireShopOwner, (req, res, next) => {
  void ctrl.getWhatsAppModuleStatus(req, res, next);
});
router.get('/whatsapp-module/config', requireShopOwner, (req, res, next) => {
  void ctrl.getWhatsAppModuleConfig(req, res, next);
});
router.put('/whatsapp-module/config', requireShopOwner, (req, res, next) => {
  void ctrl.updateWhatsAppModuleConfig(req, res, next);
});
router.get('/whatsapp-module/flows', requireShopOwner, (req, res, next) => {
  void ctrl.listWhatsAppModuleFlows(req, res, next);
});
router.get('/whatsapp-module/flows/:flowId', requireShopOwner, (req, res, next) => {
  void ctrl.getWhatsAppModuleFlow(req, res, next);
});
router.post('/whatsapp-module/flows', requireShopOwner, (req, res, next) => {
  void ctrl.createWhatsAppModuleFlow(req, res, next);
});
router.post('/whatsapp-module/flows/generate', requireShopOwner, (req, res, next) => {
  void ctrl.generateWhatsAppModuleFlow(req, res, next);
});
router.post('/whatsapp-module/flows/:flowId/generate', requireShopOwner, (req, res, next) => {
  void ctrl.editWhatsAppModuleFlowWithAi(req, res, next);
});
router.patch('/whatsapp-module/flows/:flowId', requireShopOwner, (req, res, next) => {
  void ctrl.updateWhatsAppModuleFlow(req, res, next);
});
router.patch('/whatsapp-module/flows/:flowId/activate', requireShopOwner, (req, res, next) => {
  void ctrl.activateWhatsAppModuleFlow(req, res, next);
});
router.patch('/whatsapp-module/flows/:flowId/deactivate', requireShopOwner, (req, res, next) => {
  void ctrl.deactivateWhatsAppModuleFlow(req, res, next);
});
router.delete('/whatsapp-module/flows/:flowId', requireShopOwner, (req, res, next) => {
  void ctrl.deleteWhatsAppModuleFlow(req, res, next);
});
router.get('/whatsapp-module/sessions', requireShopOwner, (req, res, next) => {
  void ctrl.listWhatsAppModuleSessions(req, res, next);
});
router.get('/whatsapp-module/sessions/:sessionId', requireShopOwner, (req, res, next) => {
  void ctrl.getWhatsAppModuleSessionDetail(req, res, next);
});
router.post('/whatsapp-module/sessions/:sessionId/reply', requireShopOwner, (req, res, next) => {
  void ctrl.replyToWhatsAppModuleSession(req, res, next);
});
router.post('/whatsapp-module/sessions/:sessionId/resume-bot', requireShopOwner, (req, res, next) => {
  void ctrl.resumeWhatsAppModuleSessionBot(req, res, next);
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

// ── Orders — visible only once the tenant admin has relayed a paid order
// to this shop (see AdminService.notifyShopOrderReady); any shop staff can
// advance the delivery status, same open-to-everyone convention as
// Billing/Requests above. ──────────────────────────────────────────────
router.get('/orders', (req, res, next) => {
  void ctrl.listMyOrders(req, res, next);
});
router.get('/orders/:orderId', (req, res, next) => {
  void ctrl.getMyOrder(req, res, next);
});
router.patch('/orders/:orderId/status', (req, res, next) => {
  void ctrl.updateMyOrderStatus(req, res, next);
});

export { router as shopRouter };
