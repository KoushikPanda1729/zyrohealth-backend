import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { PlatformService } from './platform.service';
import { success } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

@injectable()
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  listPermissionsCatalog = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const permissions = await this.platformService.listPermissionsCatalog();
      res.status(200).json(success(permissions));
    } catch (err) {
      next(err);
    }
  };

  listTenants = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenants = await this.platformService.listTenants();
      res.status(200).json(success(tenants));
    } catch (err) {
      next(err);
    }
  };

  getTenantDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const tenant = await this.platformService.getTenantDetail(id);
      res.status(200).json(success(tenant));
    } catch (err) {
      next(err);
    }
  };

  createTenant = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const {
        name,
        contactEmail,
        whatsappFromNumber,
        subdomain,
        address,
        moduleKeys,
        adminEmail,
        adminFullName,
      } = req.body as {
        name: string;
        contactEmail?: string;
        whatsappFromNumber?: string;
        subdomain?: string;
        address?: string;
        moduleKeys?: string[];
        adminEmail: string;
        adminFullName: string;
      };
      if (!name) throw AppError.badRequest('name is required');
      if (!adminEmail) throw AppError.badRequest('adminEmail is required');
      if (!adminFullName)
        throw AppError.badRequest('adminFullName is required');

      const result = await this.platformService.createTenant({
        name,
        contactEmail,
        whatsappFromNumber,
        subdomain,
        address,
        moduleKeys: moduleKeys ?? [],
        adminEmail,
        adminFullName,
      });
      res.status(201).json(success(result, 'Tenant created'));
    } catch (err) {
      next(err);
    }
  };

  updateTenant = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { name, contactEmail, whatsappFromNumber, address, isActive } =
        req.body as {
          name?: string;
          contactEmail?: string;
          whatsappFromNumber?: string;
          address?: string;
          isActive?: boolean;
        };
      const tenant = await this.platformService.updateTenant(id, {
        name,
        contactEmail,
        whatsappFromNumber,
        address,
        isActive,
      });
      res.status(200).json(success(tenant, 'Tenant updated'));
    } catch (err) {
      next(err);
    }
  };

  updateTenantEntitlements = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { moduleKeys } = req.body as { moduleKeys: string[] };
      const rows = await this.platformService.updateTenantEntitlements(
        id,
        moduleKeys ?? [],
      );
      res.status(200).json(success(rows, 'Entitlements updated'));
    } catch (err) {
      next(err);
    }
  };

  impersonateTenant = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const result = await this.platformService.impersonateTenant(id);
      res.status(200).json(success(result, 'Switched to tenant'));
    } catch (err) {
      next(err);
    }
  };

  listTenantAdmins = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const admins = await this.platformService.listTenantAdmins();
      res.status(200).json(success(admins));
    } catch (err) {
      next(err);
    }
  };

  listMedicineShops = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const shops = await this.platformService.listMedicineShopsAcrossTenants();
      res.status(200).json(success(shops));
    } catch (err) {
      next(err);
    }
  };

  setMedicineShopWhatsAppModule = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { enabled, fromNumber } = req.body as { enabled: boolean; fromNumber?: string };
      const shop = await this.platformService.setMedicineShopWhatsAppModule(id, !!enabled, fromNumber);
      res.status(200).json(success(shop, enabled ? 'WhatsApp module enabled' : 'WhatsApp module disabled'));
    } catch (err) {
      next(err);
    }
  };

  listShopPayoutSummaries = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const summaries = await this.platformService.listShopPayoutSummaries();
      res.status(200).json(success(summaries));
    } catch (err) {
      next(err);
    }
  };

  listShopPayoutEntries = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { shopId } = req.params as { shopId: string };
      const entries = await this.platformService.listShopPayoutEntries(shopId);
      res.status(200).json(success(entries));
    } catch (err) {
      next(err);
    }
  };

  settleShopPayouts = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { shopId } = req.params as { shopId: string };
      const { note } = req.body as { note?: string };
      const result = await this.platformService.settleShopPayouts(shopId, req.user.id, note);
      res.status(200).json(success(result, 'Payout marked settled'));
    } catch (err) {
      next(err);
    }
  };

  createStandaloneMedicineShop = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const {
        shopName,
        contactPhone,
        contactEmail,
        addressLine1,
        city,
        loginEmail,
        loginFullName,
        loginPassword,
      } = req.body as {
        shopName: string;
        contactPhone: string;
        contactEmail?: string;
        addressLine1?: string;
        city?: string;
        loginEmail: string;
        loginFullName: string;
        loginPassword?: string;
      };
      if (!shopName) throw AppError.badRequest('shopName is required');
      if (!contactPhone) throw AppError.badRequest('contactPhone is required');
      if (!loginEmail) throw AppError.badRequest('loginEmail is required');
      if (!loginFullName)
        throw AppError.badRequest('loginFullName is required');
      if (loginPassword !== undefined && loginPassword.length < 8) {
        throw AppError.badRequest('Password must be at least 8 characters');
      }
      const result = await this.platformService.createStandaloneMedicineShop({
        shopName,
        contactPhone,
        contactEmail,
        addressLine1,
        city,
        loginEmail,
        loginFullName,
        loginPassword,
      });
      res.status(201).json(success(result, 'Medicine shop onboarded'));
    } catch (err) {
      next(err);
    }
  };

  createTenantAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { fullName, email, tenantId, password } = req.body as {
        fullName: string;
        email: string;
        tenantId: string;
        password?: string;
      };
      if (!fullName) throw AppError.badRequest('fullName is required');
      if (!email) throw AppError.badRequest('email is required');
      if (!tenantId) throw AppError.badRequest('tenantId is required');
      if (password !== undefined && password.length < 8) {
        throw AppError.badRequest('Password must be at least 8 characters');
      }
      const result = await this.platformService.createTenantAdmin({
        fullName,
        email,
        tenantId,
        password,
      });
      res.status(201).json(success(result, 'Tenant admin created'));
    } catch (err) {
      next(err);
    }
  };

  updateTenantAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { fullName, email } = req.body as {
        fullName?: string;
        email?: string;
      };
      const user = await this.platformService.updateTenantAdmin(id, {
        fullName,
        email,
      });
      res.status(200).json(success(user, 'Tenant admin updated'));
    } catch (err) {
      next(err);
    }
  };

  toggleTenantAdminActive = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const user = await this.platformService.toggleTenantAdminActive(id);
      res
        .status(200)
        .json(success(user, user.isActive ? 'Admin unbanned' : 'Admin banned'));
    } catch (err) {
      next(err);
    }
  };

  listPlatformSupportAccounts = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const accounts = await this.platformService.listPlatformSupportAccounts();
      res.status(200).json(success(accounts));
    } catch (err) {
      next(err);
    }
  };

  createPlatformSupportAccount = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { fullName, email, password } = req.body as {
        fullName: string;
        email: string;
        password?: string;
      };
      if (!fullName) throw AppError.badRequest('fullName is required');
      if (!email) throw AppError.badRequest('email is required');
      if (password !== undefined && password.length < 8) {
        throw AppError.badRequest('Password must be at least 8 characters');
      }
      const result = await this.platformService.createPlatformSupportAccount({
        fullName,
        email,
        password,
      });
      res.status(201).json(success(result, 'Platform support account created'));
    } catch (err) {
      next(err);
    }
  };

  togglePlatformSupportActive = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const user = await this.platformService.togglePlatformSupportActive(id);
      res
        .status(200)
        .json(
          success(user, user.isActive ? 'Account unbanned' : 'Account banned'),
        );
    } catch (err) {
      next(err);
    }
  };

  getAppConfig = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await this.platformService.getAppConfig();
      res.status(200).json(success(config));
    } catch (err) {
      next(err);
    }
  };

  updateAppConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        topTabHealth,
        topTabAiDoctor,
        topTabWomen,
        quickActionDoctor,
        quickActionPharmacy,
        quickActionPrescription,
        quickActionHospital,
        quickActionAmbulance,
        sectionPromoBanner,
        sectionTopDoctors,
        sectionHealthArticles,
        bottomNavMessage,
        bottomNavCalendar,
        bottomNavProfile,
        supportEmail,
        legalEntityName,
        registeredAddress,
        supportPhone,
      } = req.body as {
        topTabHealth?: boolean;
        topTabAiDoctor?: boolean;
        topTabWomen?: boolean;
        quickActionDoctor?: boolean;
        quickActionPharmacy?: boolean;
        quickActionPrescription?: boolean;
        quickActionHospital?: boolean;
        quickActionAmbulance?: boolean;
        sectionPromoBanner?: boolean;
        sectionTopDoctors?: boolean;
        sectionHealthArticles?: boolean;
        bottomNavMessage?: boolean;
        bottomNavCalendar?: boolean;
        bottomNavProfile?: boolean;
        supportEmail?: string | null;
        legalEntityName?: string | null;
        registeredAddress?: string | null;
        supportPhone?: string | null;
      };
      const config = await this.platformService.updateAppConfig({
        topTabHealth,
        topTabAiDoctor,
        topTabWomen,
        quickActionDoctor,
        quickActionPharmacy,
        quickActionPrescription,
        quickActionHospital,
        quickActionAmbulance,
        sectionPromoBanner,
        sectionTopDoctors,
        sectionHealthArticles,
        bottomNavMessage,
        supportEmail,
        legalEntityName,
        registeredAddress,
        supportPhone,
        bottomNavCalendar,
        bottomNavProfile,
      });
      res.status(200).json(success(config, 'App configuration updated'));
    } catch (err) {
      next(err);
    }
  };

  listBanners = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const banners = await this.platformService.listBanners();
      res.status(200).json(success(banners));
    } catch (err) {
      next(err);
    }
  };

  createBanner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, ctaText, ctaLink, backgroundColor, sortOrder, isPublished } = req.body as {
        title: string;
        ctaText?: string;
        ctaLink?: string;
        backgroundColor?: string;
        sortOrder?: string;
        isPublished?: string;
      };
      if (!title) throw AppError.badRequest('title is required');
      const banner = await this.platformService.createBanner(
        {
          title,
          ctaText,
          ctaLink,
          backgroundColor,
          sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
          isPublished: isPublished !== undefined ? isPublished === 'true' : undefined,
        },
        req.file,
      );
      res.status(201).json(success(banner, 'Banner created'));
    } catch (err) {
      next(err);
    }
  };

  updateBanner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { title, ctaText, ctaLink, backgroundColor, sortOrder, isPublished } = req.body as {
        title?: string;
        ctaText?: string;
        ctaLink?: string;
        backgroundColor?: string;
        sortOrder?: string;
        isPublished?: string;
      };
      const banner = await this.platformService.updateBanner(
        id,
        {
          title,
          ctaText,
          ctaLink,
          backgroundColor,
          sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
          isPublished: isPublished !== undefined ? isPublished === 'true' : undefined,
        },
        req.file,
      );
      res.status(200).json(success(banner, 'Banner updated'));
    } catch (err) {
      next(err);
    }
  };

  deleteBanner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await this.platformService.deleteBanner(id);
      res.status(200).json(success(null, 'Banner deleted'));
    } catch (err) {
      next(err);
    }
  };

  listPolicies = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const policies = await this.platformService.listPolicies();
      res.status(200).json(success(policies));
    } catch (err) {
      next(err);
    }
  };

  createPolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { slug, title, content, isPublished } = req.body as {
        slug: string;
        title: string;
        content?: string;
        isPublished?: boolean;
      };
      if (!slug) throw AppError.badRequest('slug is required');
      if (!title) throw AppError.badRequest('title is required');
      const policy = await this.platformService.createPolicy({
        slug,
        title,
        content,
        isPublished,
      });
      res.status(201).json(success(policy, 'Policy created'));
    } catch (err) {
      next(err);
    }
  };

  updatePolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { slug, title, content, isPublished } = req.body as {
        slug?: string;
        title?: string;
        content?: string;
        isPublished?: boolean;
      };
      const policy = await this.platformService.updatePolicy(id, {
        slug,
        title,
        content,
        isPublished,
      });
      res.status(200).json(success(policy, 'Policy updated'));
    } catch (err) {
      next(err);
    }
  };

  deletePolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await this.platformService.deletePolicy(id);
      res.status(200).json(success(null, 'Policy deleted'));
    } catch (err) {
      next(err);
    }
  };

  generatePolicy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, instructions } = req.body as {
        title?: string;
        instructions?: string;
      };
      if (!title) throw AppError.badRequest('title is required');
      const content = await this.platformService.generatePolicyContent(
        title,
        instructions,
      );
      res.status(200).json(success({ content }));
    } catch (err) {
      next(err);
    }
  };
}
