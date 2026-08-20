import { Router } from 'express';
import { container } from 'tsyringe';
import { PlatformController } from './platform.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { uploadMiddleware } from '../../middleware/upload.middleware';

const router = Router();
const ctrl = container.resolve(PlatformController);

router.use(verifyToken, attachRole);

// Read routes — a lighter "platform_support" tier can view every tenant/
// shop for troubleshooting, but everything that creates, edits,
// deactivates, impersonates, or invites stays super_admin-only below.
const canView = requireRole('super_admin', 'platform_support');
const canManage = requireRole('super_admin');

router.get('/permissions', canView, (req, res, next) => {
  void ctrl.listPermissionsCatalog(req, res, next);
});

router.get('/tenants', canView, (req, res, next) => {
  void ctrl.listTenants(req, res, next);
});
router.get('/tenants/:id', canView, (req, res, next) => {
  void ctrl.getTenantDetail(req, res, next);
});
router.post('/tenants', canManage, (req, res, next) => {
  void ctrl.createTenant(req, res, next);
});
router.patch('/tenants/:id', canManage, (req, res, next) => {
  void ctrl.updateTenant(req, res, next);
});
router.put('/tenants/:id/entitlements', canManage, (req, res, next) => {
  void ctrl.updateTenantEntitlements(req, res, next);
});
router.post('/tenants/:id/impersonate', canManage, (req, res, next) => {
  void ctrl.impersonateTenant(req, res, next);
});

router.get('/admins', canView, (req, res, next) => {
  void ctrl.listTenantAdmins(req, res, next);
});
router.get('/medicine-shops', canView, (req, res, next) => {
  void ctrl.listMedicineShops(req, res, next);
});
router.post('/medicine-shops', canManage, (req, res, next) => {
  void ctrl.createStandaloneMedicineShop(req, res, next);
});
router.patch('/medicine-shops/:id/whatsapp-module', canManage, (req, res, next) => {
  void ctrl.setMedicineShopWhatsAppModule(req, res, next);
});
router.get('/shop-payouts', canView, (req, res, next) => {
  void ctrl.listShopPayoutSummaries(req, res, next);
});
router.get('/shop-payouts/:shopId', canView, (req, res, next) => {
  void ctrl.listShopPayoutEntries(req, res, next);
});
router.post('/shop-payouts/:shopId/settle', canManage, (req, res, next) => {
  void ctrl.settleShopPayouts(req, res, next);
});
router.post('/admins', canManage, (req, res, next) => {
  void ctrl.createTenantAdmin(req, res, next);
});
router.patch('/admins/:id', canManage, (req, res, next) => {
  void ctrl.updateTenantAdmin(req, res, next);
});
router.patch('/admins/:id/toggle-active', canManage, (req, res, next) => {
  void ctrl.toggleTenantAdminActive(req, res, next);
});

// Platform Support accounts — deliberately super_admin-only in both
// directions (a support-tier account can't see or create other platform
// accounts, let alone escalate itself).
router.get('/support-accounts', canManage, (req, res, next) => {
  void ctrl.listPlatformSupportAccounts(req, res, next);
});
router.post('/support-accounts', canManage, (req, res, next) => {
  void ctrl.createPlatformSupportAccount(req, res, next);
});
router.patch(
  '/support-accounts/:id/toggle-active',
  canManage,
  (req, res, next) => {
    void ctrl.togglePlatformSupportActive(req, res, next);
  },
);

// Global mobile app config (Home screen top tabs / quick-actions) — read
// by both the health-admin config page and (indirectly, via the separate
// public modules/app-config router) the mobile app itself.
router.get('/config', canView, (req, res, next) => {
  void ctrl.getAppConfig(req, res, next);
});
router.patch('/config', canManage, (req, res, next) => {
  void ctrl.updateAppConfig(req, res, next);
});

// Home screen promo banners — managed alongside the App Config page,
// shown to every patient regardless of tenant (see modules/banners's
// public router for the mobile-facing read side).
router.get('/banners', canView, (req, res, next) => {
  void ctrl.listBanners(req, res, next);
});
router.post(
  '/banners',
  canManage,
  uploadMiddleware.single('image'),
  (req, res, next) => {
    void ctrl.createBanner(req, res, next);
  },
);
router.patch(
  '/banners/:id',
  canManage,
  uploadMiddleware.single('image'),
  (req, res, next) => {
    void ctrl.updateBanner(req, res, next);
  },
);
router.delete('/banners/:id', canManage, (req, res, next) => {
  void ctrl.deleteBanner(req, res, next);
});

// Legal/policy documents (privacy policy, refund policy, terms of
// service, etc.) — managed on the Policies admin page, read publicly via
// the separate modules/policies router (health-frontend's /privacy and
// /policies/[slug] pages).
router.get('/policies', canView, (req, res, next) => {
  void ctrl.listPolicies(req, res, next);
});
router.post('/policies', canManage, (req, res, next) => {
  void ctrl.createPolicy(req, res, next);
});
router.post('/policies/generate', canManage, (req, res, next) => {
  void ctrl.generatePolicy(req, res, next);
});
router.patch('/policies/:id', canManage, (req, res, next) => {
  void ctrl.updatePolicy(req, res, next);
});
router.delete('/policies/:id', canManage, (req, res, next) => {
  void ctrl.deletePolicy(req, res, next);
});

export { router as platformRouter };
