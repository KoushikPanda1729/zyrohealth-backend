import { Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'tsyringe';
import { AdminService } from './admin.service';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { STORAGE_PROVIDER } from '../../config/di-tokens';
import { success, paginated } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { DocumentType } from '../../entities/DoctorDocument';
import { AppDataSource } from '../../config/database';
import { User } from '../../entities/User';
import { DoctorProfile } from '../../entities/DoctorProfile';
import { VoiceAgentPhoneNumber } from '../../entities/VoiceAgentPhoneNumber';
import { MedicineOrderStatus } from '../../entities/MedicineOrder';
import { WhatsAppFlowDefinition } from '../../entities/WhatsAppFlow';
import { WhatsAppMessageEvent } from '../../entities/WhatsAppSession';
import { WhatsAppProviderType } from '../../entities/TenantWhatsAppConfig';
import { PrescriptionUploadStatus } from '../../entities/PrescriptionUploadRequest';
import { QuotedMedicineItem } from '../../entities/MedicineShopQuote';
import { MedicineShopOwnershipType } from '../../entities/MedicineShop';
import { AmbulanceRequestStatus } from '../../entities/AmbulanceRequest';
import { extractCatalogFieldsFromBody } from '../medicine-shops/catalog.util';
import { livekitSipClient } from '../../lib/sipClient';
import { env } from '../../config/env';

function tenantOf(req: Request): string {
  if (!req.user?.tenantId) throw AppError.forbidden('No tenant context');
  return req.user.tenantId;
}

interface HasImageUrls {
  imageUrls: string[];
}

@injectable()
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    @inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  // The catalog-images bucket prefix is private — a raw imageUrls entry
  // 403s in a browser, so it needs a freshly signed URL on every read
  // rather than being served as-is. Same pattern as shop.controller.ts's
  // own signItem/signItems, duplicated rather than shared since the two
  // controllers don't otherwise depend on each other.
  private async signImageUrl(url: string): Promise<string> {
    try {
      const key = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
      return await this.storage.getSignedUrl(key, 3600);
    } catch {
      return url;
    }
  }

  private async signItem<T extends HasImageUrls>(item: T): Promise<T> {
    return { ...item, imageUrls: await Promise.all(item.imageUrls.map((u) => this.signImageUrl(u))) };
  }

  private async signItems<T extends HasImageUrls>(items: T[]): Promise<T[]> {
    return Promise.all(items.map((i) => this.signItem(i)));
  }

  listDoctors = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const status = req.query['status'] as string | undefined;
      const { data, total } = await this.adminService.listDoctors(
        tenantOf(req),
        { status, page, limit },
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  getDoctorDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const doctor = await this.adminService.getDoctorDetail(tenantOf(req), id);
      res.status(200).json(success(doctor));
    } catch (err) {
      next(err);
    }
  };

  approveDoctor = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const doctor = await this.adminService.approveDoctor(tenantOf(req), id);
      res.status(200).json(success(doctor, 'Doctor approved'));
    } catch (err) {
      next(err);
    }
  };

  rejectDoctor = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { reason } = req.body as { reason: string };
      if (!reason) throw AppError.badRequest('Rejection reason is required');
      const doctor = await this.adminService.rejectDoctor(
        tenantOf(req),
        id,
        reason,
      );
      res.status(200).json(success(doctor, 'Doctor rejected'));
    } catch (err) {
      next(err);
    }
  };

  listUsers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const role = req.query['role'] as string | undefined;
      const { data, total } = await this.adminService.listUsers(tenantOf(req), {
        role,
        page,
        limit,
      });
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  getUserDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const user = await this.adminService.getUserDetail(tenantOf(req), id);
      res.status(200).json(success(user));
    } catch (err) {
      next(err);
    }
  };

  banUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const user = await this.adminService.toggleBanUser(tenantOf(req), id);
      res
        .status(200)
        .json(success(user, user.isActive ? 'User unbanned' : 'User banned'));
    } catch (err) {
      next(err);
    }
  };

  listBookings = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const status = req.query['status'] as string | undefined;
      const { data, total } = await this.adminService.listBookings(
        tenantOf(req),
        page,
        limit,
        status,
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  listPrescriptions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const { data, total } = await this.adminService.listPrescriptions(
        tenantOf(req),
        page,
        limit,
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  listPayments = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const { data, total, totalRevenue } =
        await this.adminService.listPayments(tenantOf(req), page, limit);
      res.status(200).json({
        ...paginated(data, total, page, limit),
        totalRevenue,
      });
    } catch (err) {
      next(err);
    }
  };

  adminRefundBooking = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const payment = await this.adminService.adminRefundBooking(
        tenantOf(req),
        id,
      );
      res.status(200).json(success(payment, 'Refund initiated successfully'));
    } catch (err) {
      next(err);
    }
  };

  listMedicineOrders = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const status = req.query['status'] as string | undefined;
      const { data, total } = await this.adminService.listMedicineOrders(
        tenantOf(req),
        page,
        limit,
        status,
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  getMedicineOrderDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const order = await this.adminService.getMedicineOrderDetail(
        tenantOf(req),
        id,
      );
      res.status(200).json(success(order));
    } catch (err) {
      next(err);
    }
  };

  updateMedicineOrderStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const { status, note } = req.body as {
        status: MedicineOrderStatus;
        note?: string;
      };
      if (!Object.values(MedicineOrderStatus).includes(status)) {
        throw AppError.badRequest('Invalid status');
      }
      const order = await this.adminService.updateMedicineOrderStatus(
        tenantOf(req),
        id,
        status,
        note,
        req.user.id,
      );
      res.status(200).json(success(order, 'Order status updated'));
    } catch (err) {
      next(err);
    }
  };

  notifyShopOrderReady = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const order = await this.adminService.notifyShopOrderReady(tenantOf(req), id);
      res.status(200).json(success(order, 'Pharmacy notified'));
    } catch (err) {
      next(err);
    }
  };

  listWhatsAppSessions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const awaitingHumanRaw = req.query['awaitingHuman'] as string | undefined;
      const awaitingHuman =
        awaitingHumanRaw === undefined
          ? undefined
          : awaitingHumanRaw === 'true';
      const { data, total } = await this.adminService.listWhatsAppSessions(
        tenantOf(req),
        page,
        limit,
        awaitingHuman,
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  getWhatsAppSessionDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const session = await this.adminService.getWhatsAppSessionDetail(
        tenantOf(req),
        id,
      );
      res.status(200).json(success(session));
    } catch (err) {
      next(err);
    }
  };

  replyToWhatsAppSession = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { text } = req.body as { text: string };
      if (!text) throw AppError.badRequest('text is required');
      const session = await this.adminService.replyToWhatsAppSession(
        tenantOf(req),
        id,
        text,
      );
      res.status(200).json(success(session, 'Reply sent'));
    } catch (err) {
      next(err);
    }
  };

  resumeWhatsAppBot = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const session = await this.adminService.resumeWhatsAppBot(
        tenantOf(req),
        id,
      );
      res.status(200).json(success(session, 'Bot resumed'));
    } catch (err) {
      next(err);
    }
  };

  listWhatsAppFlows = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const flows = await this.adminService.listWhatsAppFlows(tenantOf(req));
      res.status(200).json(success(flows));
    } catch (err) {
      next(err);
    }
  };

  getWhatsAppFlow = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const flow = await this.adminService.getWhatsAppFlow(tenantOf(req), id);
      res.status(200).json(success(flow));
    } catch (err) {
      next(err);
    }
  };

  createWhatsAppFlow = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { name, definition } = req.body as {
        name: string;
        definition?: WhatsAppFlowDefinition;
      };
      if (!name) throw AppError.badRequest('name is required');
      const flow = await this.adminService.createWhatsAppFlow(
        tenantOf(req),
        name,
        definition,
      );
      res.status(201).json(success(flow, 'Flow created'));
    } catch (err) {
      next(err);
    }
  };

  generateWhatsAppFlow = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { name, prompt } = req.body as { name: string; prompt: string };
      if (!name) throw AppError.badRequest('name is required');
      if (!prompt) throw AppError.badRequest('prompt is required');
      const flow = await this.adminService.generateWhatsAppFlow(
        tenantOf(req),
        name,
        prompt,
      );
      res.status(201).json(success(flow, 'Flow generated'));
    } catch (err) {
      next(err);
    }
  };

  editWhatsAppFlowWithAi = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { prompt } = req.body as { prompt: string };
      if (!prompt) throw AppError.badRequest('prompt is required');
      const flow = await this.adminService.editWhatsAppFlowWithAi(
        tenantOf(req),
        id,
        prompt,
      );
      res.status(200).json(success(flow, 'Flow updated'));
    } catch (err) {
      next(err);
    }
  };

  updateWhatsAppFlow = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { name, definition } = req.body as {
        name?: string;
        definition?: WhatsAppFlowDefinition;
      };
      const flow = await this.adminService.updateWhatsAppFlow(
        tenantOf(req),
        id,
        { name, definition },
      );
      res.status(200).json(success(flow, 'Flow saved'));
    } catch (err) {
      next(err);
    }
  };

  activateWhatsAppFlow = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const flow = await this.adminService.activateWhatsAppFlow(
        tenantOf(req),
        id,
      );
      res.status(200).json(success(flow, 'Flow activated'));
    } catch (err) {
      next(err);
    }
  };

  deactivateWhatsAppFlow = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const flow = await this.adminService.deactivateWhatsAppFlow(
        tenantOf(req),
        id,
      );
      res.status(200).json(success(flow, 'Flow deactivated'));
    } catch (err) {
      next(err);
    }
  };

  deleteWhatsAppFlow = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await this.adminService.deleteWhatsAppFlow(tenantOf(req), id);
      res.status(200).json(success(null, 'Flow deleted'));
    } catch (err) {
      next(err);
    }
  };

  previewWhatsAppFlow = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { definition, text, sessionState } = req.body as {
        definition: WhatsAppFlowDefinition;
        text: string;
        sessionState?: {
          flowNodeId?: string | null;
          activeFlowId?: string | null;
          flowVariables?: Record<string, unknown>;
          messages?: WhatsAppMessageEvent[];
        };
      };
      if (!definition) throw AppError.badRequest('definition is required');
      if (typeof text !== 'string') throw AppError.badRequest('text is required');
      const result = await this.adminService.previewWhatsAppFlow(
        tenantOf(req),
        definition,
        text,
        sessionState,
      );
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  };

  getAnalytics = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const analytics = await this.adminService.getAnalytics(tenantOf(req));
      res.status(200).json(success(analytics));
    } catch (err) {
      next(err);
    }
  };

  listAiSessions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const { data, total } = await this.adminService.listAiSessions(
        tenantOf(req),
        page,
        limit,
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  inviteDoctor = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { phone, fullName } = req.body as {
        phone: string;
        fullName: string;
      };
      if (!phone) throw AppError.badRequest('Phone number is required');
      if (!fullName) throw AppError.badRequest('Full name is required');
      const { user, isNew } = await this.adminService.inviteDoctor(
        tenantOf(req),
        phone,
        fullName,
      );
      res
        .status(201)
        .json(
          success(
            { user, isNew },
            `Doctor ${isNew ? 'invited' : 'upgraded'} and OTP sent to ${phone}`,
          ),
        );
    } catch (err) {
      next(err);
    }
  };

  createDoctorFull = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = req.body as {
        phone: string;
        fullName: string;
        specialty?: string;
        licenseNumber?: string;
        yearsOfExperience?: number;
        qualifications?: string[];
        languages?: string[];
        bio?: string;
        consultationFee?: number;
      };
      if (!body.phone) throw AppError.badRequest('Phone number is required');
      if (!body.fullName) throw AppError.badRequest('Full name is required');
      const result = await this.adminService.createDoctorFull(tenantOf(req), {
        ...body,
        skipOtp: true,
      });
      res.status(201).json(success(result, 'Doctor created'));
    } catch (err) {
      next(err);
    }
  };

  deleteDoctorProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await this.adminService.deleteDoctorProfile(tenantOf(req), id);
      res.status(200).json(success(null, 'Doctor deleted'));
    } catch (err) {
      next(err);
    }
  };

  adminUpdateDoctorProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const body = req.body as {
        specialty?: string;
        licenseNumber?: string;
        yearsOfExperience?: number;
        qualifications?: string[];
        languages?: string[];
        bio?: string;
        consultationFee?: number;
      };
      const profile = await this.adminService.adminUpdateDoctorProfile(
        tenantOf(req),
        id,
        body,
      );
      res.status(200).json(success(profile, 'Doctor profile updated'));
    } catch (err) {
      next(err);
    }
  };

  adminUploadDocument = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      if (!req.file) throw AppError.badRequest('File is required');
      const { documentType, notes } = req.body as {
        documentType: string;
        notes?: string;
      };
      if (!documentType) throw AppError.badRequest('Document type is required');
      if (!Object.values(DocumentType).includes(documentType as DocumentType)) {
        throw AppError.badRequest(
          `Invalid document type. Valid values: ${Object.values(DocumentType).join(', ')}`,
        );
      }
      const doc = await this.adminService.adminUploadDocument(
        tenantOf(req),
        id,
        req.file,
        documentType as DocumentType,
        notes,
      );
      res.status(201).json(success(doc, 'Document uploaded'));
    } catch (err) {
      next(err);
    }
  };

  adminAddAvailability = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { dayOfWeek, startTime, endTime, slotDurationMinutes } =
        req.body as {
          dayOfWeek: string;
          startTime: string;
          endTime: string;
          slotDurationMinutes?: number;
        };
      if (!dayOfWeek || !startTime || !endTime) {
        throw AppError.badRequest(
          'dayOfWeek, startTime and endTime are required',
        );
      }
      const avail = await this.adminService.adminAddAvailability(
        tenantOf(req),
        id,
        { dayOfWeek, startTime, endTime, slotDurationMinutes },
      );
      res.status(201).json(success(avail, 'Availability added'));
    } catch (err) {
      next(err);
    }
  };

  adminDeleteAvailability = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id, availId } = req.params as { id: string; availId: string };
      await this.adminService.adminDeleteAvailability(
        tenantOf(req),
        id,
        availId,
      );
      res.status(200).json(success(null, 'Availability slot removed'));
    } catch (err) {
      next(err);
    }
  };

  getDoctorDocuments = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const docs = await this.adminService.getDoctorDocuments(
        tenantOf(req),
        id,
      );
      res.status(200).json(success(docs));
    } catch (err) {
      next(err);
    }
  };

  createAiDoctor = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { name, specialty, description, avatarUrl, systemPrompt } =
        req.body as {
          name: string;
          specialty?: string;
          description?: string;
          avatarUrl?: string;
          systemPrompt: string;
        };
      if (!name) throw AppError.badRequest('Name is required');
      if (!systemPrompt) throw AppError.badRequest('System prompt is required');
      const doctor = await this.adminService.createAiDoctor(
        tenantOf(req),
        { name, specialty, description, avatarUrl, systemPrompt },
        req.user.id,
      );
      res.status(201).json(success(doctor, 'AI Doctor created'));
    } catch (err) {
      next(err);
    }
  };

  listAiDoctors = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const { data, total } = await this.adminService.listAiDoctors(
        tenantOf(req),
        page,
        limit,
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  updateAiDoctor = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { name, specialty, description, avatarUrl, systemPrompt } =
        req.body as {
          name?: string;
          specialty?: string;
          description?: string;
          avatarUrl?: string;
          systemPrompt?: string;
        };
      const doctor = await this.adminService.updateAiDoctor(tenantOf(req), id, {
        name,
        specialty,
        description,
        avatarUrl,
        systemPrompt,
      });
      res.status(200).json(success(doctor, 'AI Doctor updated'));
    } catch (err) {
      next(err);
    }
  };

  toggleAiDoctorActive = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const doctor = await this.adminService.toggleAiDoctorActive(
        tenantOf(req),
        id,
      );
      res
        .status(200)
        .json(
          success(
            doctor,
            `AI Doctor ${doctor.isActive ? 'activated' : 'deactivated'}`,
          ),
        );
    } catch (err) {
      next(err);
    }
  };

  deleteAiDoctor = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await this.adminService.deleteAiDoctor(tenantOf(req), id);
      res.status(200).json(success(null, 'AI Doctor deleted'));
    } catch (err) {
      next(err);
    }
  };

  generateAiDoctorField = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { field, name, specialty, description, systemPrompt } =
        req.body as {
          field: 'name' | 'specialty' | 'description' | 'systemPrompt';
          name?: string;
          specialty?: string;
          description?: string;
          systemPrompt?: string;
        };
      if (!field) throw AppError.badRequest('field is required');
      if (
        !['name', 'specialty', 'description', 'systemPrompt'].includes(field)
      ) {
        throw AppError.badRequest('Invalid field');
      }
      const value = await this.adminService.generateAiDoctorField(field, {
        name,
        specialty,
        description,
        systemPrompt,
      });
      res.status(200).json(success({ value }));
    } catch (err) {
      next(err);
    }
  };

  generateDoctorProfileField = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const {
        field,
        fullName,
        specialty,
        yearsOfExperience,
        bio,
        qualifications,
        languages,
      } = req.body as {
        field: 'specialty' | 'bio' | 'qualifications' | 'languages';
        fullName?: string;
        specialty?: string;
        yearsOfExperience?: number;
        bio?: string;
        qualifications?: string[];
        languages?: string[];
      };
      if (!field) throw AppError.badRequest('field is required');
      if (
        !['specialty', 'bio', 'qualifications', 'languages'].includes(field)
      ) {
        throw AppError.badRequest('Invalid field');
      }
      const value = await this.adminService.generateDoctorProfileField(field, {
        fullName,
        specialty,
        yearsOfExperience,
        bio,
        qualifications,
        languages,
      });
      res.status(200).json(success({ value }));
    } catch (err) {
      next(err);
    }
  };

  askStudioAssistant = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { message, history } = req.body as {
        message?: string;
        history?: { role: 'user' | 'assistant'; content: string }[];
      };
      if (!message || !message.trim()) {
        throw AppError.badRequest('message is required');
      }
      const safeHistory = Array.isArray(history)
        ? history
            .filter(
              (m) =>
                (m.role === 'user' || m.role === 'assistant') &&
                typeof m.content === 'string',
            )
            .slice(-10)
        : [];
      const reply = await this.adminService.askStudioAssistant(
        tenantOf(req),
        req.user?.permissions ?? [],
        message.trim(),
        safeHistory,
      );
      res.status(200).json(success({ reply }));
    } catch (err) {
      next(err);
    }
  };

  // ── Tenant-admin role management ────────────────────────────────────

  listRoles = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const roles = await this.adminService.listRoles(tenantOf(req));
      res.status(200).json(success(roles));
    } catch (err) {
      next(err);
    }
  };

  getRole = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const role = await this.adminService.getRole(tenantOf(req), id);
      res.status(200).json(success(role));
    } catch (err) {
      next(err);
    }
  };

  createRole = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { name, permissionKeys } = req.body as {
        name: string;
        permissionKeys?: string[];
      };
      if (!name) throw AppError.badRequest('name is required');
      const role = await this.adminService.createRole(
        tenantOf(req),
        name,
        permissionKeys ?? [],
      );
      res.status(201).json(success(role, 'Role created'));
    } catch (err) {
      next(err);
    }
  };

  updateRole = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { name, permissionKeys } = req.body as {
        name?: string;
        permissionKeys?: string[];
      };
      const role = await this.adminService.updateRole(tenantOf(req), id, {
        name,
        permissionKeys,
      });
      res.status(200).json(success(role, 'Role updated'));
    } catch (err) {
      next(err);
    }
  };

  deleteRole = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await this.adminService.deleteRole(tenantOf(req), id);
      res.status(200).json(success(null, 'Role deleted'));
    } catch (err) {
      next(err);
    }
  };

  assignUserRole = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { roleId } = req.body as { roleId: string };
      if (!roleId) throw AppError.badRequest('roleId is required');
      const user = await this.adminService.assignUserRole(
        tenantOf(req),
        id,
        roleId,
      );
      res.status(200).json(success(user, 'Role assigned'));
    } catch (err) {
      next(err);
    }
  };

  inviteStaff = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { email, fullName, roleId, departmentId, password } = req.body as {
        email: string;
        fullName: string;
        roleId: string;
        departmentId?: string;
        password?: string;
      };
      if (!email) throw AppError.badRequest('email is required');
      if (!fullName) throw AppError.badRequest('fullName is required');
      if (!roleId) throw AppError.badRequest('roleId is required');
      if (password !== undefined && password.length < 8) {
        throw AppError.badRequest('Password must be at least 8 characters');
      }
      const result = await this.adminService.inviteStaff(tenantOf(req), {
        email,
        fullName,
        roleId,
        departmentId,
        password,
      });
      res.status(201).json(success(result, 'Staff account created'));
    } catch (err) {
      next(err);
    }
  };

  listAvailablePermissions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const permissions = await this.adminService.listAvailablePermissions(
        tenantOf(req),
      );
      res.status(200).json(success(permissions));
    } catch (err) {
      next(err);
    }
  };

  listDepartments = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const departments = await this.adminService.listDepartments(
        tenantOf(req),
      );
      res.status(200).json(success(departments));
    } catch (err) {
      next(err);
    }
  };

  createDepartment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { name, description } = req.body as {
        name: string;
        description?: string;
      };
      if (!name) throw AppError.badRequest('name is required');
      const department = await this.adminService.createDepartment(
        tenantOf(req),
        {
          name,
          description,
        },
      );
      res.status(201).json(success(department, 'Department created'));
    } catch (err) {
      next(err);
    }
  };

  updateDepartment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { name, description } = req.body as {
        name?: string;
        description?: string;
      };
      const department = await this.adminService.updateDepartment(
        tenantOf(req),
        id,
        {
          name,
          description,
        },
      );
      res.status(200).json(success(department, 'Department updated'));
    } catch (err) {
      next(err);
    }
  };

  deleteDepartment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await this.adminService.deleteDepartment(tenantOf(req), id);
      res.status(200).json(success(null, 'Department deleted'));
    } catch (err) {
      next(err);
    }
  };

  // ── Medicine Shops ───────────────────────────────────────────────

  listMedicineShops = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const shops = await this.adminService.listMedicineShops(tenantOf(req));
      res.status(200).json(success(shops));
    } catch (err) {
      next(err);
    }
  };

  createMedicineShop = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const {
        name,
        contactPhone,
        contactEmail,
        addressLine1,
        city,
        ownershipType,
      } = req.body as {
        name: string;
        contactPhone: string;
        contactEmail?: string;
        addressLine1?: string;
        city?: string;
        ownershipType?: MedicineShopOwnershipType;
      };
      if (!name) throw AppError.badRequest('name is required');
      if (!contactPhone) throw AppError.badRequest('contactPhone is required');
      const shop = await this.adminService.createMedicineShop(tenantOf(req), {
        name,
        contactPhone,
        contactEmail,
        addressLine1,
        city,
        ownershipType,
      });
      res.status(201).json(success(shop, 'Medicine shop created'));
    } catch (err) {
      next(err);
    }
  };

  updateMedicineShop = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const {
        name,
        contactPhone,
        contactEmail,
        addressLine1,
        city,
        isActive,
        ownershipType,
      } = req.body as {
        name?: string;
        contactPhone?: string;
        contactEmail?: string;
        addressLine1?: string;
        city?: string;
        isActive?: boolean;
        ownershipType?: MedicineShopOwnershipType;
      };
      const shop = await this.adminService.updateMedicineShop(
        tenantOf(req),
        id,
        {
          name,
          contactPhone,
          contactEmail,
          addressLine1,
          city,
          isActive,
          ownershipType,
        },
      );
      res.status(200).json(success(shop, 'Medicine shop updated'));
    } catch (err) {
      next(err);
    }
  };

  deleteMedicineShop = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await this.adminService.deleteMedicineShop(tenantOf(req), id);
      res.status(200).json(success(null, 'Medicine shop deleted'));
    } catch (err) {
      next(err);
    }
  };

  inviteMedicineShopUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { email, fullName, password } = req.body as {
        email: string;
        fullName: string;
        password?: string;
      };
      if (!email) throw AppError.badRequest('email is required');
      if (!fullName) throw AppError.badRequest('fullName is required');
      if (password !== undefined && password.length < 8) {
        throw AppError.badRequest('Password must be at least 8 characters');
      }
      const result = await this.adminService.inviteMedicineShopUser(
        tenantOf(req),
        id,
        { email, fullName, password },
      );
      res.status(201).json(success(result, 'Medicine shop login created'));
    } catch (err) {
      next(err);
    }
  };

  impersonateShop = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      if (!req.user?.id) throw AppError.unauthorized();
      const result = await this.adminService.impersonateShop(
        tenantOf(req),
        id,
        req.user.id,
      );
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  };

  listShopCatalog = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const items = await this.adminService.listShopCatalog(tenantOf(req), id);
      res.status(200).json(success(await this.signItems(items)));
    } catch (err) {
      next(err);
    }
  };

  createShopCatalogItem = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { name, priceCents } = req.body as {
        name: string;
        priceCents: number;
      };
      if (!name?.trim()) throw AppError.badRequest('name is required');
      if (!priceCents || priceCents <= 0)
        throw AppError.badRequest('priceCents must be a positive number');
      const item = await this.adminService.createShopCatalogItem(
        tenantOf(req),
        id,
        {
          name: name.trim(),
          priceCents,
          ...extractCatalogFieldsFromBody(req.body as Record<string, unknown>),
        },
      );
      res.status(201).json(success(await this.signItem(item), 'Medicine added'));
    } catch (err) {
      next(err);
    }
  };

  updateShopCatalogItem = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id, itemId } = req.params as { id: string; itemId: string };
      const { name, priceCents, isActive } = req.body as {
        name?: string;
        priceCents?: number;
        isActive?: boolean;
      };
      const item = await this.adminService.updateShopCatalogItem(
        tenantOf(req),
        id,
        itemId,
        {
          name,
          priceCents,
          isActive,
          ...extractCatalogFieldsFromBody(req.body as Record<string, unknown>),
        },
      );
      res.status(200).json(success(await this.signItem(item), 'Medicine updated'));
    } catch (err) {
      next(err);
    }
  };

  uploadShopCatalogImages = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) throw AppError.badRequest('No image uploaded');
      const nonImage = files.find((f) => !f.mimetype.startsWith('image/'));
      if (nonImage) throw AppError.badRequest('Only image uploads (JPEG/PNG/WEBP) are allowed');

      const urls = await this.adminService.uploadShopCatalogImages(
        tenantOf(req),
        id,
        files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype })),
      );
      res.status(200).json(success({ urls }));
    } catch (err) {
      next(err);
    }
  };

  deleteShopCatalogItem = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id, itemId } = req.params as { id: string; itemId: string };
      await this.adminService.deleteShopCatalogItem(tenantOf(req), id, itemId);
      res.status(200).json(success(null, 'Medicine removed'));
    } catch (err) {
      next(err);
    }
  };

  downloadShopCatalogTemplate = (_req: Request, res: Response): void => {
    const csv = this.adminService.getShopCatalogTemplateCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="medicine-catalog-template.csv"',
    );
    res.send(csv);
  };

  bulkUploadShopCatalog = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      if (!req.file) throw AppError.badRequest('No file uploaded');
      const result = await this.adminService.bulkUploadShopCatalog(
        tenantOf(req),
        id,
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
        },
      );
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

  exportShopCatalog = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const csv = await this.adminService.exportShopCatalogCsv(
        tenantOf(req),
        id,
      );
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

  getShopStockHistory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const catalogItemId = req.query['itemId'] as string | undefined;
      const history = await this.adminService.getShopStockHistory(
        tenantOf(req),
        id,
        catalogItemId,
      );
      res.status(200).json(success(history));
    } catch (err) {
      next(err);
    }
  };

  listShopCatalogItemBatches = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id, itemId } = req.params as { id: string; itemId: string };
      const batches = await this.adminService.listShopCatalogItemBatches(
        tenantOf(req),
        id,
        itemId,
      );
      res.status(200).json(success(batches));
    } catch (err) {
      next(err);
    }
  };

  addShopCatalogItemBatch = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id, itemId } = req.params as { id: string; itemId: string };
      const { batchNumber, expiryDate, quantity } = req.body as {
        batchNumber?: string;
        expiryDate?: string;
        quantity: number;
      };
      const batch = await this.adminService.addShopCatalogItemBatch(
        tenantOf(req),
        id,
        itemId,
        { batchNumber, expiryDate, quantity },
      );
      res.status(201).json(success(batch, 'Batch added'));
    } catch (err) {
      next(err);
    }
  };

  deleteShopCatalogItemBatch = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id, batchId } = req.params as { id: string; batchId: string };
      await this.adminService.deleteShopCatalogItemBatch(tenantOf(req), id, batchId);
      res.status(200).json(success(null, 'Batch removed'));
    } catch (err) {
      next(err);
    }
  };

  // ── Prescription upload requests ────────────────────────────────────

  listPrescriptionRequests = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { status } = req.query as { status?: PrescriptionUploadStatus };
      const requests = await this.adminService.listPrescriptionRequests(
        tenantOf(req),
        status,
      );
      res.status(200).json(success(requests));
    } catch (err) {
      next(err);
    }
  };

  getPrescriptionRequestDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const detail = await this.adminService.getPrescriptionRequestDetail(
        tenantOf(req),
        id,
      );
      res.status(200).json(success(detail));
    } catch (err) {
      next(err);
    }
  };

  dispatchPrescriptionToShops = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { shopIds } = req.body as { shopIds: string[] };
      if (!Array.isArray(shopIds) || shopIds.length === 0) {
        throw AppError.badRequest('shopIds must be a non-empty array');
      }
      await this.adminService.dispatchToShops(tenantOf(req), id, shopIds);
      res.status(200).json(success(null, 'Dispatched to shops'));
    } catch (err) {
      next(err);
    }
  };

  listQuotesForRequest = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const quotes = await this.adminService.listQuotesForRequest(
        tenantOf(req),
        id,
      );
      res.status(200).json(success(quotes));
    } catch (err) {
      next(err);
    }
  };

  recordManualShopQuote = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id, quoteId } = req.params as { id: string; quoteId: string };
      const { totalCents, items, note } = req.body as {
        totalCents?: number;
        items?: QuotedMedicineItem[];
        note?: string;
      };
      if ((!items || items.length === 0) && (!totalCents || totalCents <= 0)) {
        throw AppError.badRequest(
          'Provide either itemized medicines or a totalCents amount',
        );
      }
      const quote = await this.adminService.recordManualShopQuote(
        tenantOf(req),
        id,
        quoteId,
        { totalCents, items: Array.isArray(items) ? items : undefined, note },
      );
      res.status(200).json(success(quote, 'Quote recorded'));
    } catch (err) {
      next(err);
    }
  };

  selectPrescriptionQuote = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id, quoteId } = req.params as { id: string; quoteId: string };
      await this.adminService.selectQuote(tenantOf(req), id, quoteId);
      res.status(200).json(success(null, 'Receipt sent to patient'));
    } catch (err) {
      next(err);
    }
  };

  letPatientChooseQuote = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await this.adminService.letPatientChooseQuote(tenantOf(req), id);
      res.status(200).json(success(null, 'Quotes sent to patient to choose'));
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
      const { id, quoteId } = req.params as { id: string; quoteId: string };
      const { buffer, filename } = await this.adminService.getQuoteReceiptPdf(
        tenantOf(req),
        id,
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

  getMedicineOrderAutoMode = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const enabled = await this.adminService.getMedicineOrderAutoMode(
        tenantOf(req),
      );
      res.status(200).json(success({ enabled }));
    } catch (err) {
      next(err);
    }
  };

  updateMedicineOrderAutoMode = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      const result = await this.adminService.updateMedicineOrderAutoMode(
        tenantOf(req),
        !!enabled,
      );
      res.status(200).json(success({ enabled: result }, 'Auto-mode updated'));
    } catch (err) {
      next(err);
    }
  };

  getMyPermissions = (req: Request, res: Response): void => {
    res.status(200).json(
      success({
        role: req.user?.role,
        permissions: req.user?.permissions ?? [],
      }),
    );
  };

  getWhatsAppConfig = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const config = await this.adminService.getWhatsAppConfig(tenantOf(req));
      res.status(200).json(success(config));
    } catch (err) {
      next(err);
    }
  };

  updateWhatsAppConfig = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const {
        provider,
        twilioAccountSid,
        twilioAuthToken,
        twilioFromNumber,
        metaPhoneNumberId,
        metaAccessToken,
        metaAppSecret,
        metaApiVersion,
        gupshupApiKey,
        gupshupSourceNumber,
        gupshupAppName,
        gupshupWebhookSecret,
        gupshupAppId,
        otpTemplateName,
        otpTemplateLang,
      } = req.body as {
        provider: 'twilio' | 'meta' | 'gupshup';
        twilioAccountSid?: string;
        twilioAuthToken?: string;
        twilioFromNumber?: string;
        metaPhoneNumberId?: string;
        metaAccessToken?: string;
        metaAppSecret?: string;
        metaApiVersion?: string;
        gupshupApiKey?: string;
        gupshupSourceNumber?: string;
        gupshupAppName?: string;
        gupshupWebhookSecret?: string;
        gupshupAppId?: string;
        otpTemplateName?: string;
        otpTemplateLang?: string;
      };
      if (!provider) throw AppError.badRequest('provider is required');
      if (!['twilio', 'meta', 'gupshup'].includes(provider)) {
        throw AppError.badRequest('provider must be "twilio", "meta", or "gupshup"');
      }
      const result = await this.adminService.updateWhatsAppConfig(
        tenantOf(req),
        {
          provider: provider as WhatsAppProviderType,
          twilioAccountSid,
          twilioAuthToken,
          twilioFromNumber,
          metaPhoneNumberId,
          metaAccessToken,
          metaAppSecret,
          metaApiVersion,
          gupshupApiKey,
          gupshupSourceNumber,
          gupshupAppName,
          gupshupWebhookSecret,
          gupshupAppId,
          otpTemplateName,
          otpTemplateLang,
        },
      );
      res.status(200).json(success(result, 'WhatsApp settings saved'));
    } catch (err) {
      next(err);
    }
  };

  listWhatsAppTemplates = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const templates = await this.adminService.listWhatsAppTemplates(tenantOf(req));
      res.status(200).json(success(templates));
    } catch (err) {
      next(err);
    }
  };

  createWhatsAppTemplate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { elementName, category, languageCode, content, example, templateType } =
        req.body as {
          elementName?: string;
          category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
          languageCode?: string;
          content?: string;
          example?: string;
          templateType?: string;
        };
      if (!elementName || !category || !languageCode || !content || !example) {
        throw AppError.badRequest(
          'elementName, category, languageCode, content, and example are required',
        );
      }
      const template = await this.adminService.createWhatsAppTemplate(tenantOf(req), {
        elementName,
        category,
        languageCode,
        content,
        example,
        templateType,
      });
      res.status(201).json(success(template, 'Template submitted for approval'));
    } catch (err) {
      next(err);
    }
  };

  sendWhatsAppTemplate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { phone, templateName, languageCode, params } = req.body as {
        phone?: string;
        templateName?: string;
        languageCode?: string;
        params?: string[];
      };
      if (!phone || !templateName || !languageCode) {
        throw AppError.badRequest('phone, templateName, and languageCode are required');
      }
      await this.adminService.sendWhatsAppTemplate(tenantOf(req), {
        phone,
        templateName,
        languageCode,
        params: params ?? [],
      });
      res.status(200).json(success(null, 'Template message sent'));
    } catch (err) {
      next(err);
    }
  };

  // ── Voice Agent Access ────────────────────────────────────────────
  grantAgentAccess = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
        where: { id, tenantId: tenantOf(req) },
      });
      if (!profile) throw AppError.notFound('Doctor');
      await AppDataSource.getRepository(User).update(profile.userId, {
        canCreateAgent: true,
      });
      res.status(200).json(success(null, 'Agent access granted'));
    } catch (err) {
      next(err);
    }
  };

  revokeAgentAccess = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
        where: { id, tenantId: tenantOf(req) },
      });
      if (!profile) throw AppError.notFound('Doctor');
      await AppDataSource.getRepository(User).update(profile.userId, {
        canCreateAgent: false,
      });
      res.status(200).json(success(null, 'Agent access revoked'));
    } catch (err) {
      next(err);
    }
  };

  // ── Voice Agent Phone Numbers ─────────────────────────────────────
  listPhoneNumbers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const numbers = await AppDataSource.getRepository(
        VoiceAgentPhoneNumber,
      ).find({
        where: { tenantId: tenantOf(req) },
        order: { createdAt: 'DESC' },
      });
      res.status(200).json(success(numbers));
    } catch (err) {
      next(err);
    }
  };

  addPhoneNumber = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = tenantOf(req);
      const { phoneNumber, label } = req.body as {
        phoneNumber: string;
        label?: string;
      };
      if (!phoneNumber) throw AppError.badRequest('phoneNumber is required');
      const repo = AppDataSource.getRepository(VoiceAgentPhoneNumber);
      const existing = await repo.findOne({ where: { phoneNumber } });
      if (existing) throw AppError.conflict('Phone number already exists');
      const record = repo.create({
        phoneNumber,
        label,
        isActive: true,
        tenantId,
      });
      await repo.save(record);
      res.status(201).json(success(record, 'Phone number added'));
    } catch (err) {
      next(err);
    }
  };

  assignPhoneNumber = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = tenantOf(req);
      const { id } = req.params as { id: string };
      const { doctorId } = req.body as { doctorId: string };
      const repo = AppDataSource.getRepository(VoiceAgentPhoneNumber);
      const record = await repo.findOne({ where: { id, tenantId } });
      if (!record) throw AppError.notFound('Phone number');

      // Unassign from current doctor if any
      if (record.assignedDoctorId && record.assignedDoctorId !== doctorId) {
        await repo.update(
          { assignedDoctorId: record.assignedDoctorId },
          { assignedDoctorId: undefined },
        );
      }

      await repo.update(id, { assignedDoctorId: doctorId });

      // Set up LiveKit SIP inbound trunk + dispatch rule
      try {
        const agentName = `dr-${doctorId.slice(0, 8)}`;

        let inboundTrunkId = record.inboundTrunkId;
        if (!inboundTrunkId) {
          const trunk = await livekitSipClient.createInboundTrunk(
            `inbound-${record.phoneNumber}`,
            [record.phoneNumber],
          );
          inboundTrunkId = trunk.sipTrunkId;
          await repo.update(id, { inboundTrunkId });
        }

        if (!record.outboundTrunkId && env.SIP_TRUNK_ADDRESS) {
          const trunk = await livekitSipClient.createOutboundTrunk(
            `outbound-${record.phoneNumber}`,
            env.SIP_TRUNK_ADDRESS,
            [record.phoneNumber],
          );
          await repo.update(id, { outboundTrunkId: trunk.sipTrunkId });
        }

        if (!record.inboundDispatchRuleId) {
          const rule = await livekitSipClient.createSipDispatchRule(
            { type: 'individual', roomPrefix: `inbound-${agentName}-` },
            {
              name: `dispatch-${record.phoneNumber}`,
              trunkIds: [inboundTrunkId],
            },
          );
          await repo.update(id, {
            inboundDispatchRuleId: rule.sipDispatchRuleId,
          });
        }
      } catch (sipErr) {
        console.error('SIP trunk setup failed (non-fatal):', sipErr);
      }

      const updated = await repo.findOne({ where: { id } });
      res.status(200).json(success(updated, 'Phone number assigned'));
    } catch (err) {
      next(err);
    }
  };

  deletePhoneNumber = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = tenantOf(req);
      const { id } = req.params as { id: string };
      const repo = AppDataSource.getRepository(VoiceAgentPhoneNumber);
      const record = await repo.findOne({ where: { id, tenantId } });
      if (!record) throw AppError.notFound('Phone number');

      // Clean up LiveKit SIP resources
      try {
        if (record.inboundDispatchRuleId)
          await livekitSipClient.deleteSipDispatchRule(
            record.inboundDispatchRuleId,
          );
        if (record.inboundTrunkId)
          await livekitSipClient.deleteSipTrunk(record.inboundTrunkId);
        if (record.outboundTrunkId)
          await livekitSipClient.deleteSipTrunk(record.outboundTrunkId);
      } catch (sipErr) {
        console.error('SIP cleanup failed (non-fatal):', sipErr);
      }

      await repo.delete(id);
      res.status(200).json(success(null, 'Phone number deleted'));
    } catch (err) {
      next(err);
    }
  };

  // ── Hospitals ────────────────────────────────────────────────────────

  listHospitals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const hospitals = await this.adminService.listHospitals(tenantOf(req));
      res.status(200).json(success(hospitals));
    } catch (err) {
      next(err);
    }
  };

  createHospital = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        name,
        contactPhone,
        addressLine1,
        city,
        latitude,
        longitude,
        specialties,
        emergencyServicesAvailable,
      } = req.body as {
        name: string;
        contactPhone: string;
        addressLine1?: string;
        city?: string;
        latitude?: number;
        longitude?: number;
        specialties?: string[];
        emergencyServicesAvailable?: boolean;
      };
      if (!name) throw AppError.badRequest('name is required');
      if (!contactPhone) throw AppError.badRequest('contactPhone is required');
      const hospital = await this.adminService.createHospital(tenantOf(req), {
        name,
        contactPhone,
        addressLine1,
        city,
        latitude,
        longitude,
        specialties,
        emergencyServicesAvailable,
      });
      res.status(201).json(success(hospital, 'Hospital created'));
    } catch (err) {
      next(err);
    }
  };

  updateHospital = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const {
        name,
        contactPhone,
        addressLine1,
        city,
        latitude,
        longitude,
        specialties,
        emergencyServicesAvailable,
        isActive,
      } = req.body as {
        name?: string;
        contactPhone?: string;
        addressLine1?: string;
        city?: string;
        latitude?: number;
        longitude?: number;
        specialties?: string[];
        emergencyServicesAvailable?: boolean;
        isActive?: boolean;
      };
      const hospital = await this.adminService.updateHospital(tenantOf(req), id, {
        name,
        contactPhone,
        addressLine1,
        city,
        latitude,
        longitude,
        specialties,
        emergencyServicesAvailable,
        isActive,
      });
      res.status(200).json(success(hospital, 'Hospital updated'));
    } catch (err) {
      next(err);
    }
  };

  // ── Ambulance requests ───────────────────────────────────────────────

  listAmbulanceRequests = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const requests = await this.adminService.listAmbulanceRequests(tenantOf(req));
      res.status(200).json(success(requests));
    } catch (err) {
      next(err);
    }
  };

  updateAmbulanceRequestStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { status, adminNotes } = req.body as {
        status: AmbulanceRequestStatus;
        adminNotes?: string;
      };
      if (!status) throw AppError.badRequest('status is required');
      const request = await this.adminService.updateAmbulanceRequestStatus(tenantOf(req), id, {
        status,
        adminNotes,
      });
      res.status(200).json(success(request, 'Ambulance request updated'));
    } catch (err) {
      next(err);
    }
  };

  // ── Articles ─────────────────────────────────────────────────────────

  listArticles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const articles = await this.adminService.listArticles(tenantOf(req));
      res.status(200).json(success(articles));
    } catch (err) {
      next(err);
    }
  };

  createArticle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, body, imageUrl, category, authorName, readTimeMinutes, isPublished } =
        req.body as {
          title: string;
          body: string;
          imageUrl?: string;
          category?: string;
          authorName?: string;
          readTimeMinutes?: number;
          isPublished?: boolean;
        };
      if (!title) throw AppError.badRequest('title is required');
      if (!body) throw AppError.badRequest('body is required');
      const article = await this.adminService.createArticle(tenantOf(req), {
        title,
        body,
        imageUrl,
        category,
        authorName,
        readTimeMinutes,
        isPublished,
      });
      res.status(201).json(success(article, 'Article created'));
    } catch (err) {
      next(err);
    }
  };

  updateArticle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { title, body, imageUrl, category, authorName, readTimeMinutes, isPublished } =
        req.body as {
          title?: string;
          body?: string;
          imageUrl?: string;
          category?: string;
          authorName?: string;
          readTimeMinutes?: number;
          isPublished?: boolean;
        };
      const article = await this.adminService.updateArticle(tenantOf(req), id, {
        title,
        body,
        imageUrl,
        category,
        authorName,
        readTimeMinutes,
        isPublished,
      });
      res.status(200).json(success(article, 'Article updated'));
    } catch (err) {
      next(err);
    }
  };

  // ── Women's health categories ─────────────────────────────────────────

  listWomenHealthCategories = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const categories = await this.adminService.listWomenHealthCategories(tenantOf(req));
      res.status(200).json(success(categories));
    } catch (err) {
      next(err);
    }
  };

  createWomenHealthCategory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { label, icon, colorStart, colorEnd, description, facts, tips, isPublished } =
        req.body as {
          label: string;
          icon: string;
          colorStart: string;
          colorEnd: string;
          description: string;
          facts?: string[];
          tips?: { title: string; body: string }[];
          isPublished?: boolean;
        };
      if (!label) throw AppError.badRequest('label is required');
      if (!description) throw AppError.badRequest('description is required');
      const category = await this.adminService.createWomenHealthCategory(tenantOf(req), {
        label,
        icon,
        colorStart,
        colorEnd,
        description,
        facts,
        tips,
        isPublished,
      });
      res.status(201).json(success(category, "Women's health category created"));
    } catch (err) {
      next(err);
    }
  };

  updateWomenHealthCategory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const { label, icon, colorStart, colorEnd, description, facts, tips, isPublished } =
        req.body as {
          label?: string;
          icon?: string;
          colorStart?: string;
          colorEnd?: string;
          description?: string;
          facts?: string[];
          tips?: { title: string; body: string }[];
          isPublished?: boolean;
        };
      const category = await this.adminService.updateWomenHealthCategory(tenantOf(req), id, {
        label,
        icon,
        colorStart,
        colorEnd,
        description,
        facts,
        tips,
        isPublished,
      });
      res.status(200).json(success(category, "Women's health category updated"));
    } catch (err) {
      next(err);
    }
  };
}
