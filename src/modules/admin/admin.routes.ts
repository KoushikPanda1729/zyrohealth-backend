import { Router } from 'express';
import { container } from 'tsyringe';
import { AdminController } from './admin.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { requirePermission } from '../../middleware/requirePermission.middleware';
import {
  uploadMiddleware,
  catalogUploadMiddleware,
} from '../../middleware/upload.middleware';

const router = Router();
const ctrl = container.resolve(AdminController);

router.use(verifyToken, attachRole, requireRole('admin'));

router.get('/me/permissions', (req, res) => {
  ctrl.getMyPermissions(req, res);
});

// Open to any admin-role user — the permission-scoping happens inside the
// service itself (it only fetches, and hands the AI, the data domains this
// specific caller is entitled to), same as /me/permissions above.
router.post('/ai-assistant/query', (req, res, next) => {
  void ctrl.askStudioAssistant(req, res, next);
});

router.get('/doctors', requirePermission('doctors.view'), (req, res, next) => {
  void ctrl.listDoctors(req, res, next);
});
router.get(
  '/doctors/:id',
  requirePermission('doctors.view'),
  (req, res, next) => {
    void ctrl.getDoctorDetail(req, res, next);
  },
);
router.patch(
  '/doctors/:id/approve',
  requirePermission('doctors.manage'),
  (req, res, next) => {
    void ctrl.approveDoctor(req, res, next);
  },
);
router.patch(
  '/doctors/:id/reject',
  requirePermission('doctors.manage'),
  (req, res, next) => {
    void ctrl.rejectDoctor(req, res, next);
  },
);
router.patch(
  '/doctors/:id/profile',
  requirePermission('doctors.manage'),
  (req, res, next) => {
    void ctrl.adminUpdateDoctorProfile(req, res, next);
  },
);
router.get(
  '/doctors/:id/documents',
  requirePermission('doctors.view'),
  (req, res, next) => {
    void ctrl.getDoctorDocuments(req, res, next);
  },
);
router.post(
  '/doctors/:id/documents',
  requirePermission('doctors.manage'),
  uploadMiddleware.single('file'),
  (req, res, next) => {
    void ctrl.adminUploadDocument(req, res, next);
  },
);
router.post(
  '/doctors/:id/availability',
  requirePermission('doctors.manage'),
  (req, res, next) => {
    void ctrl.adminAddAvailability(req, res, next);
  },
);
router.delete(
  '/doctors/:id/availability/:availId',
  requirePermission('doctors.manage'),
  (req, res, next) => {
    void ctrl.adminDeleteAvailability(req, res, next);
  },
);

router.get('/users', requirePermission('users.view'), (req, res, next) => {
  void ctrl.listUsers(req, res, next);
});
router.get('/users/:id', requirePermission('users.view'), (req, res, next) => {
  void ctrl.getUserDetail(req, res, next);
});
router.patch(
  '/users/:id/ban',
  requirePermission('users.manage'),
  (req, res, next) => {
    void ctrl.banUser(req, res, next);
  },
);

router.get(
  '/bookings',
  requirePermission('bookings.view'),
  (req, res, next) => {
    void ctrl.listBookings(req, res, next);
  },
);
router.post(
  '/bookings/:id/refund',
  requirePermission('bookings.manage'),
  (req, res, next) => {
    void ctrl.adminRefundBooking(req, res, next);
  },
);
router.get(
  '/prescriptions',
  requirePermission('prescriptions.view'),
  (req, res, next) => {
    void ctrl.listPrescriptions(req, res, next);
  },
);
router.get(
  '/payments',
  requirePermission('payments.view'),
  (req, res, next) => {
    void ctrl.listPayments(req, res, next);
  },
);
router.get(
  '/medicine-orders',
  requirePermission('medicine_orders.view'),
  (req, res, next) => {
    void ctrl.listMedicineOrders(req, res, next);
  },
);
// Medicine order auto-mode (per-tenant) — registered before the /:id route
// below so Express doesn't match "auto-mode" as an :id param.
router.get(
  '/medicine-orders/auto-mode',
  requirePermission('medicine_shops.view'),
  (req, res, next) => {
    void ctrl.getMedicineOrderAutoMode(req, res, next);
  },
);
router.patch(
  '/medicine-orders/auto-mode',
  requirePermission('medicine_shops.manage'),
  (req, res, next) => {
    void ctrl.updateMedicineOrderAutoMode(req, res, next);
  },
);
router.get(
  '/medicine-orders/:id',
  requirePermission('medicine_orders.view'),
  (req, res, next) => {
    void ctrl.getMedicineOrderDetail(req, res, next);
  },
);
router.patch(
  '/medicine-orders/:id/status',
  requirePermission('medicine_orders.manage'),
  (req, res, next) => {
    void ctrl.updateMedicineOrderStatus(req, res, next);
  },
);
router.post(
  '/medicine-orders/:id/notify-shop',
  requirePermission('medicine_orders.manage'),
  (req, res, next) => {
    void ctrl.notifyShopOrderReady(req, res, next);
  },
);
router.get(
  '/whatsapp/sessions',
  requirePermission('whatsapp.view'),
  (req, res, next) => {
    void ctrl.listWhatsAppSessions(req, res, next);
  },
);
router.get(
  '/whatsapp/sessions/:id',
  requirePermission('whatsapp.view'),
  (req, res, next) => {
    void ctrl.getWhatsAppSessionDetail(req, res, next);
  },
);
router.post(
  '/whatsapp/sessions/:id/reply',
  requirePermission('whatsapp.manage_sessions'),
  (req, res, next) => {
    void ctrl.replyToWhatsAppSession(req, res, next);
  },
);
router.post(
  '/whatsapp/sessions/:id/resume-bot',
  requirePermission('whatsapp.manage_sessions'),
  (req, res, next) => {
    void ctrl.resumeWhatsAppBot(req, res, next);
  },
);

router.get(
  '/whatsapp/flows',
  requirePermission('whatsapp.manage_flows'),
  (req, res, next) => {
    void ctrl.listWhatsAppFlows(req, res, next);
  },
);
router.get(
  '/whatsapp/flows/:id',
  requirePermission('whatsapp.manage_flows'),
  (req, res, next) => {
    void ctrl.getWhatsAppFlow(req, res, next);
  },
);
router.post(
  '/whatsapp/flows',
  requirePermission('whatsapp.manage_flows'),
  (req, res, next) => {
    void ctrl.createWhatsAppFlow(req, res, next);
  },
);
router.post(
  '/whatsapp/flows/generate',
  requirePermission('whatsapp.manage_flows'),
  (req, res, next) => {
    void ctrl.generateWhatsAppFlow(req, res, next);
  },
);
router.patch(
  '/whatsapp/flows/:id',
  requirePermission('whatsapp.manage_flows'),
  (req, res, next) => {
    void ctrl.updateWhatsAppFlow(req, res, next);
  },
);
router.post(
  '/whatsapp/flows/:id/generate',
  requirePermission('whatsapp.manage_flows'),
  (req, res, next) => {
    void ctrl.editWhatsAppFlowWithAi(req, res, next);
  },
);
router.post(
  '/whatsapp/flows/:id/activate',
  requirePermission('whatsapp.manage_flows'),
  (req, res, next) => {
    void ctrl.activateWhatsAppFlow(req, res, next);
  },
);
router.post(
  '/whatsapp/flows/:id/deactivate',
  requirePermission('whatsapp.manage_flows'),
  (req, res, next) => {
    void ctrl.deactivateWhatsAppFlow(req, res, next);
  },
);
router.delete(
  '/whatsapp/flows/:id',
  requirePermission('whatsapp.manage_flows'),
  (req, res, next) => {
    void ctrl.deleteWhatsAppFlow(req, res, next);
  },
);

router.get(
  '/whatsapp/config',
  requirePermission('whatsapp.manage_flows'),
  (req, res, next) => {
    void ctrl.getWhatsAppConfig(req, res, next);
  },
);
router.put(
  '/whatsapp/config',
  requirePermission('whatsapp.manage_flows'),
  (req, res, next) => {
    void ctrl.updateWhatsAppConfig(req, res, next);
  },
);

router.get(
  '/analytics',
  requirePermission('analytics.view'),
  (req, res, next) => {
    void ctrl.getAnalytics(req, res, next);
  },
);
router.get(
  '/ai-sessions',
  requirePermission('analytics.view'),
  (req, res, next) => {
    void ctrl.listAiSessions(req, res, next);
  },
);

router.post(
  '/doctors/invite',
  requirePermission('doctors.manage'),
  (req, res, next) => {
    void ctrl.inviteDoctor(req, res, next);
  },
);
router.post(
  '/doctors/create',
  requirePermission('doctors.manage'),
  (req, res, next) => {
    void ctrl.createDoctorFull(req, res, next);
  },
);
router.post(
  '/doctors/generate',
  requirePermission('doctors.manage'),
  (req, res, next) => {
    void ctrl.generateDoctorProfileField(req, res, next);
  },
);
router.delete(
  '/doctors/:id',
  requirePermission('doctors.manage'),
  (req, res, next) => {
    void ctrl.deleteDoctorProfile(req, res, next);
  },
);

// AI Doctor CRUD
router.get(
  '/ai-doctors',
  requirePermission('ai_doctors.view'),
  (req, res, next) => {
    void ctrl.listAiDoctors(req, res, next);
  },
);
router.post(
  '/ai-doctors',
  requirePermission('ai_doctors.manage'),
  (req, res, next) => {
    void ctrl.createAiDoctor(req, res, next);
  },
);
router.post(
  '/ai-doctors/generate',
  requirePermission('ai_doctors.manage'),
  (req, res, next) => {
    void ctrl.generateAiDoctorField(req, res, next);
  },
);
router.patch(
  '/ai-doctors/:id',
  requirePermission('ai_doctors.manage'),
  (req, res, next) => {
    void ctrl.updateAiDoctor(req, res, next);
  },
);
router.patch(
  '/ai-doctors/:id/toggle-active',
  requirePermission('ai_doctors.manage'),
  (req, res, next) => {
    void ctrl.toggleAiDoctorActive(req, res, next);
  },
);
router.delete(
  '/ai-doctors/:id',
  requirePermission('ai_doctors.manage'),
  (req, res, next) => {
    void ctrl.deleteAiDoctor(req, res, next);
  },
);

// Voice Agent access control
router.patch(
  '/doctors/:id/grant-agent-access',
  requirePermission('voice_agent.manage'),
  (req, res, next) => {
    void ctrl.grantAgentAccess(req, res, next);
  },
);
router.patch(
  '/doctors/:id/revoke-agent-access',
  requirePermission('voice_agent.manage'),
  (req, res, next) => {
    void ctrl.revokeAgentAccess(req, res, next);
  },
);

// Voice Agent phone number pool
router.get(
  '/voice-agent/phone-numbers',
  requirePermission('voice_agent.view'),
  (req, res, next) => {
    void ctrl.listPhoneNumbers(req, res, next);
  },
);
router.post(
  '/voice-agent/phone-numbers',
  requirePermission('voice_agent.manage'),
  (req, res, next) => {
    void ctrl.addPhoneNumber(req, res, next);
  },
);
router.patch(
  '/voice-agent/phone-numbers/:id/assign',
  requirePermission('voice_agent.manage'),
  (req, res, next) => {
    void ctrl.assignPhoneNumber(req, res, next);
  },
);
router.delete(
  '/voice-agent/phone-numbers/:id',
  requirePermission('voice_agent.manage'),
  (req, res, next) => {
    void ctrl.deletePhoneNumber(req, res, next);
  },
);

// Tenant-admin role management
router.get(
  '/roles/available-permissions',
  requirePermission('roles.manage'),
  (req, res, next) => {
    void ctrl.listAvailablePermissions(req, res, next);
  },
);
router.get('/roles', requirePermission('roles.manage'), (req, res, next) => {
  void ctrl.listRoles(req, res, next);
});
router.get(
  '/roles/:id',
  requirePermission('roles.manage'),
  (req, res, next) => {
    void ctrl.getRole(req, res, next);
  },
);
router.post('/roles', requirePermission('roles.manage'), (req, res, next) => {
  void ctrl.createRole(req, res, next);
});
router.patch(
  '/roles/:id',
  requirePermission('roles.manage'),
  (req, res, next) => {
    void ctrl.updateRole(req, res, next);
  },
);
router.delete(
  '/roles/:id',
  requirePermission('roles.manage'),
  (req, res, next) => {
    void ctrl.deleteRole(req, res, next);
  },
);
router.patch(
  '/users/:id/role',
  requirePermission('roles.manage'),
  (req, res, next) => {
    void ctrl.assignUserRole(req, res, next);
  },
);
router.post('/staff', requirePermission('roles.manage'), (req, res, next) => {
  void ctrl.inviteStaff(req, res, next);
});

router.get(
  '/departments',
  requirePermission('users.manage'),
  (req, res, next) => {
    void ctrl.listDepartments(req, res, next);
  },
);
router.post(
  '/departments',
  requirePermission('users.manage'),
  (req, res, next) => {
    void ctrl.createDepartment(req, res, next);
  },
);
router.patch(
  '/departments/:id',
  requirePermission('users.manage'),
  (req, res, next) => {
    void ctrl.updateDepartment(req, res, next);
  },
);
router.delete(
  '/departments/:id',
  requirePermission('users.manage'),
  (req, res, next) => {
    void ctrl.deleteDepartment(req, res, next);
  },
);

// Medicine Shops
router.get(
  '/medicine-shops',
  requirePermission('medicine_shops.view'),
  (req, res, next) => {
    void ctrl.listMedicineShops(req, res, next);
  },
);
router.post(
  '/medicine-shops',
  requirePermission('medicine_shops.manage'),
  (req, res, next) => {
    void ctrl.createMedicineShop(req, res, next);
  },
);
router.patch(
  '/medicine-shops/:id',
  requirePermission('medicine_shops.manage'),
  (req, res, next) => {
    void ctrl.updateMedicineShop(req, res, next);
  },
);
router.delete(
  '/medicine-shops/:id',
  requirePermission('medicine_shops.manage'),
  (req, res, next) => {
    void ctrl.deleteMedicineShop(req, res, next);
  },
);
router.post(
  '/medicine-shops/:id/invite',
  requirePermission('medicine_shops.manage'),
  (req, res, next) => {
    void ctrl.inviteMedicineShopUser(req, res, next);
  },
);
router.post(
  '/medicine-shops/:id/impersonate',
  requirePermission('medicine_shops.manage'),
  (req, res, next) => {
    void ctrl.impersonateShop(req, res, next);
  },
);
router.get(
  '/medicine-shops/:id/catalog',
  requirePermission('medicine_shops.view'),
  (req, res, next) => {
    void ctrl.listShopCatalog(req, res, next);
  },
);
router.post(
  '/medicine-shops/:id/catalog',
  requirePermission('medicine_shops.dispatch'),
  (req, res, next) => {
    void ctrl.createShopCatalogItem(req, res, next);
  },
);
router.patch(
  '/medicine-shops/:id/catalog/:itemId',
  requirePermission('medicine_shops.dispatch'),
  (req, res, next) => {
    void ctrl.updateShopCatalogItem(req, res, next);
  },
);
router.delete(
  '/medicine-shops/:id/catalog/:itemId',
  requirePermission('medicine_shops.dispatch'),
  (req, res, next) => {
    void ctrl.deleteShopCatalogItem(req, res, next);
  },
);
router.get(
  '/medicine-shops/:id/catalog/bulk-upload/template',
  requirePermission('medicine_shops.view'),
  ctrl.downloadShopCatalogTemplate,
);
router.post(
  '/medicine-shops/:id/catalog/bulk-upload',
  requirePermission('medicine_shops.dispatch'),
  catalogUploadMiddleware.single('file'),
  (req, res, next) => {
    void ctrl.bulkUploadShopCatalog(req, res, next);
  },
);
router.get(
  '/medicine-shops/:id/catalog/export',
  requirePermission('medicine_shops.view'),
  (req, res, next) => {
    void ctrl.exportShopCatalog(req, res, next);
  },
);
router.get(
  '/medicine-shops/:id/catalog/stock-history',
  requirePermission('medicine_shops.view'),
  (req, res, next) => {
    void ctrl.getShopStockHistory(req, res, next);
  },
);
router.get(
  '/medicine-shops/:id/catalog/:itemId/batches',
  requirePermission('medicine_shops.view'),
  (req, res, next) => {
    void ctrl.listShopCatalogItemBatches(req, res, next);
  },
);
router.post(
  '/medicine-shops/:id/catalog/:itemId/batches',
  requirePermission('medicine_shops.dispatch'),
  (req, res, next) => {
    void ctrl.addShopCatalogItemBatch(req, res, next);
  },
);
router.delete(
  '/medicine-shops/:id/catalog/batches/:batchId',
  requirePermission('medicine_shops.dispatch'),
  (req, res, next) => {
    void ctrl.deleteShopCatalogItemBatch(req, res, next);
  },
);

// Prescription upload requests
router.get(
  '/prescription-requests',
  requirePermission('medicine_shops.view'),
  (req, res, next) => {
    void ctrl.listPrescriptionRequests(req, res, next);
  },
);
router.get(
  '/prescription-requests/:id',
  requirePermission('medicine_shops.view'),
  (req, res, next) => {
    void ctrl.getPrescriptionRequestDetail(req, res, next);
  },
);
router.post(
  '/prescription-requests/:id/dispatch',
  requirePermission('medicine_shops.dispatch'),
  (req, res, next) => {
    void ctrl.dispatchPrescriptionToShops(req, res, next);
  },
);
router.get(
  '/prescription-requests/:id/quotes',
  requirePermission('medicine_shops.view'),
  (req, res, next) => {
    void ctrl.listQuotesForRequest(req, res, next);
  },
);
router.patch(
  '/prescription-requests/:id/quotes/:quoteId',
  requirePermission('medicine_shops.dispatch'),
  (req, res, next) => {
    void ctrl.recordManualShopQuote(req, res, next);
  },
);
router.post(
  '/prescription-requests/:id/quotes/:quoteId/select',
  requirePermission('medicine_shops.dispatch'),
  (req, res, next) => {
    void ctrl.selectPrescriptionQuote(req, res, next);
  },
);
router.post(
  '/prescription-requests/:id/let-patient-choose',
  requirePermission('medicine_shops.dispatch'),
  (req, res, next) => {
    void ctrl.letPatientChooseQuote(req, res, next);
  },
);
router.get(
  '/prescription-requests/:id/quotes/:quoteId/receipt.pdf',
  requirePermission('medicine_shops.view'),
  (req, res, next) => {
    void ctrl.downloadQuoteReceipt(req, res, next);
  },
);

// Hospitals
router.get('/hospitals', requirePermission('hospitals.view'), (req, res, next) => {
  void ctrl.listHospitals(req, res, next);
});
router.post('/hospitals', requirePermission('hospitals.manage'), (req, res, next) => {
  void ctrl.createHospital(req, res, next);
});
router.patch('/hospitals/:id', requirePermission('hospitals.manage'), (req, res, next) => {
  void ctrl.updateHospital(req, res, next);
});

// Ambulance requests
router.get('/ambulance-requests', requirePermission('ambulance.view'), (req, res, next) => {
  void ctrl.listAmbulanceRequests(req, res, next);
});
router.patch(
  '/ambulance-requests/:id',
  requirePermission('ambulance.manage'),
  (req, res, next) => {
    void ctrl.updateAmbulanceRequestStatus(req, res, next);
  },
);

// Articles
router.get('/articles', requirePermission('articles.view'), (req, res, next) => {
  void ctrl.listArticles(req, res, next);
});
router.post('/articles', requirePermission('articles.manage'), (req, res, next) => {
  void ctrl.createArticle(req, res, next);
});
router.patch('/articles/:id', requirePermission('articles.manage'), (req, res, next) => {
  void ctrl.updateArticle(req, res, next);
});

// Women's health categories
router.get(
  '/women-health-categories',
  requirePermission('women_health.view'),
  (req, res, next) => {
    void ctrl.listWomenHealthCategories(req, res, next);
  },
);
router.post(
  '/women-health-categories',
  requirePermission('women_health.manage'),
  (req, res, next) => {
    void ctrl.createWomenHealthCategory(req, res, next);
  },
);
router.patch(
  '/women-health-categories/:id',
  requirePermission('women_health.manage'),
  (req, res, next) => {
    void ctrl.updateWomenHealthCategory(req, res, next);
  },
);

export { router as adminRouter };
