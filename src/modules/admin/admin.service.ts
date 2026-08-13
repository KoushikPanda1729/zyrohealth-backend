import { injectable, inject } from 'tsyringe';
import { In } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from '../../config/database';
import { User, UserRole } from '../../entities/User';
import { DoctorProfile, ApprovalStatus } from '../../entities/DoctorProfile';
import {
  DoctorAvailability,
  DayOfWeek,
} from '../../entities/DoctorAvailability';
import { DoctorDocument, DocumentType } from '../../entities/DoctorDocument';
import { Booking, BookingStatus } from '../../entities/Booking';
import { Prescription } from '../../entities/Prescription';
import { Payment, PaymentStatus } from '../../entities/Payment';
import { AiSession } from '../../entities/AiSession';
import { AiDoctor } from '../../entities/AiDoctor';
import {
  MedicineOrder,
  MedicineOrderStatus,
  MedicineOrderPaymentStatus,
} from '../../entities/MedicineOrder';
import { WhatsAppSession } from '../../entities/WhatsAppSession';
import {
  WhatsAppFlow,
  WhatsAppFlowDefinition,
} from '../../entities/WhatsAppFlow';
import { parseGeneratedFlow } from '../whatsapp/whatsapp-flow-parse.util';
import { VoiceAgent } from '../../entities/VoiceAgent';
import { VoiceAgentPhoneNumber } from '../../entities/VoiceAgentPhoneNumber';
import { Role } from '../../entities/Role';
import { RolePermission } from '../../entities/RolePermission';
import { Permission } from '../../entities/Permission';
import { Department } from '../../entities/Department';
import {
  TenantWhatsAppConfig,
  WhatsAppProviderType,
} from '../../entities/TenantWhatsAppConfig';
import { Tenant } from '../../entities/Tenant';
import {
  MedicineShop,
  MedicineShopOwnershipType,
} from '../../entities/MedicineShop';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import {
  MedicineShopStockMovement,
  StockMovementReason,
} from '../../entities/MedicineShopStockMovement';
import {
  applyCatalogFields,
  bulkUpsertCatalogRows,
  buildCatalogExportCsv,
  BulkUploadResult,
  CatalogItemInput,
  listStockMovements,
  saveCatalogItemWithLedger,
} from '../medicine-shops/catalog.util';
import { listBatches, addBatch, deleteBatch, BatchInput } from '../medicine-shops/batch.util';
import { MedicineShopCatalogItemBatch } from '../../entities/MedicineShopCatalogItemBatch';
import {
  parseCatalogFile,
  buildCatalogTemplateCsv,
} from '../medicine-shops/catalog-import.util';
import {
  PrescriptionUploadRequest,
  PrescriptionUploadStatus,
} from '../../entities/PrescriptionUploadRequest';
import {
  MedicineShopQuote,
  MedicineShopQuoteStatus,
  QuoteSubmissionChannel,
  QuotedMedicineItem,
} from '../../entities/MedicineShopQuote';
import { IAuthProvider } from '../../providers/auth/auth.provider.interface';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { IPaymentProvider } from '../../providers/payment/payment.provider.interface';
import { IAiProvider } from '../../providers/ai/ai.provider.interface';
import {
  AUTH_PROVIDER,
  STORAGE_PROVIDER,
  PAYMENT_PROVIDER,
  AI_PROVIDER,
} from '../../config/container';
import { AppError } from '../../utils/app-error';
import { assertValidTransition } from '../../utils/order-status-transitions';
import { WhatsAppNotificationService } from '../notifications/whatsapp-notification.service';
import { FLOW_GENERATION_SYSTEM_PROMPT } from '../whatsapp/whatsapp-flow-generation.prompt';
import { listTenantEntitledKeys } from '../tenancy/permissions.util';
import { buildQuoteReceiptPdf } from '../../utils/quote-receipt-pdf';
import { encryptSecret } from '../../utils/crypto.util';
import { env } from '../../config/env';
import { AuthService } from '../auth/auth.service';
import { WhatsAppBotService } from '../whatsapp/whatsapp-bot.service';
import {
  recordShopQuote,
  markSiblingQuotesNotSelected,
} from '../medicine-shops/quote-processing.util';
import { MedicineShopAlertsService } from '../medicine-shops/medicine-shop-alerts.service';

@injectable()
export class AdminService {
  constructor(
    @inject(AUTH_PROVIDER) private readonly authProvider: IAuthProvider,
    @inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
    @inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: IPaymentProvider,
    @inject(AI_PROVIDER) private readonly ai: IAiProvider,
    private readonly whatsapp: WhatsAppNotificationService,
    private readonly authService: AuthService,
    private readonly whatsAppBot: WhatsAppBotService,
    private readonly shopAlerts: MedicineShopAlertsService,
  ) {}

  async listDoctors(
    tenantId: string,
    filters: { status?: string; page: number; limit: number },
  ): Promise<{ data: DoctorProfile[]; total: number }> {
    const qb = AppDataSource.getRepository(DoctorProfile)
      .createQueryBuilder('dp')
      .leftJoinAndSelect('dp.user', 'user')
      .where('dp.tenant_id = :tenantId', { tenantId });

    if (filters.status) {
      qb.andWhere('dp.approval_status = :status', { status: filters.status });
    }

    const [data, total] = await qb
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .getManyAndCount();

    return { data, total };
  }

  async getDoctorDetail(tenantId: string, id: string): Promise<DoctorProfile> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { id, tenantId },
      relations: ['user', 'availabilities'],
    });
    if (!profile) throw AppError.notFound('Doctor');
    return profile;
  }

  async approveDoctor(tenantId: string, id: string): Promise<DoctorProfile> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { id, tenantId },
    });
    if (!profile) throw AppError.notFound('Doctor');
    profile.approvalStatus = ApprovalStatus.APPROVED;
    profile.isAvailable = true;
    const saved =
      await AppDataSource.getRepository(DoctorProfile).save(profile);

    const doctorUser = await AppDataSource.getRepository(User).findOne({
      where: { id: profile.userId },
    });
    void this.whatsapp.notifyDoctorApproved(tenantId, doctorUser?.phoneNumber);

    return saved;
  }

  async rejectDoctor(
    tenantId: string,
    id: string,
    reason: string,
  ): Promise<DoctorProfile> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { id, tenantId },
    });
    if (!profile) throw AppError.notFound('Doctor');
    profile.approvalStatus = ApprovalStatus.REJECTED;
    profile.rejectionReason = reason;
    const saved =
      await AppDataSource.getRepository(DoctorProfile).save(profile);

    const doctorUser = await AppDataSource.getRepository(User).findOne({
      where: { id: profile.userId },
    });
    void this.whatsapp.notifyDoctorRejected(
      tenantId,
      reason,
      doctorUser?.phoneNumber,
    );

    return saved;
  }

  async listUsers(
    tenantId: string,
    filters: { role?: string; page: number; limit: number },
  ): Promise<{ data: User[]; total: number }> {
    const where: { tenantId: string; role?: User['role'] } = { tenantId };
    if (filters.role) {
      where.role = filters.role as User['role'];
    }

    const [data, total] = await AppDataSource.getRepository(User).findAndCount({
      where,
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total };
  }

  async getUserDetail(tenantId: string, id: string): Promise<User> {
    const user = await AppDataSource.getRepository(User).findOne({
      where: { id, tenantId },
      relations: ['patientProfile', 'doctorProfile'],
    });
    if (!user) throw AppError.notFound('User');
    return user;
  }

  async toggleBanUser(tenantId: string, id: string): Promise<User> {
    const user = await AppDataSource.getRepository(User).findOne({
      where: { id, tenantId },
    });
    if (!user) throw AppError.notFound('User');
    user.isActive = !user.isActive;
    return AppDataSource.getRepository(User).save(user);
  }

  async listBookings(
    tenantId: string,
    page: number,
    limit: number,
    status?: string,
  ): Promise<{ data: object[]; total: number }> {
    const where: { tenantId: string; status?: Booking['status'] } = {
      tenantId,
    };
    if (status) where.status = status as Booking['status'];
    const [data, total] = await AppDataSource.getRepository(
      Booking,
    ).findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['patient', 'doctor', 'payment'],
    });
    const mapped = data.map((b) => ({
      id: b.id,
      status: b.status,
      scheduledAt: b.scheduledAt,
      consultationFeeCents: b.consultationFeeCents,
      amount: b.payment?.amountCents ?? b.consultationFeeCents,
      patient: {
        fullName:
          b.patient?.fullName ||
          b.patient?.phoneNumber ||
          b.patient?.email ||
          '—',
        phoneNumber: b.patient?.phoneNumber,
        email: b.patient?.email,
      },
      doctor: {
        fullName: b.doctor?.fullName || b.doctor?.email || '—',
      },
      paymentStatus: b.payment?.status,
      createdAt: b.createdAt,
    }));
    return { data: mapped, total };
  }

  async listPrescriptions(
    tenantId: string,
    page: number,
    limit: number,
  ): Promise<{ data: Prescription[]; total: number }> {
    const [data, total] = await AppDataSource.getRepository(
      Prescription,
    ).findAndCount({
      where: { tenantId },
      relations: [
        'booking',
        'booking.doctor',
        'booking.patient',
        'booking.doctor.doctorProfile',
      ],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total };
  }

  async listPayments(
    tenantId: string,
    page: number,
    limit: number,
  ): Promise<{ data: Payment[]; total: number; totalRevenue: number }> {
    const [data, total] = await AppDataSource.getRepository(
      Payment,
    ).findAndCount({
      where: { tenantId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['booking'],
    });

    const revenueResult = await AppDataSource.getRepository(Payment)
      .createQueryBuilder('p')
      .select('SUM(p.amount_cents)', 'total')
      .where('p.status = :status AND p.tenant_id = :tenantId', {
        status: PaymentStatus.SUCCESS,
        tenantId,
      })
      .getRawOne<{ total: string }>();

    return {
      data,
      total,
      totalRevenue: parseInt(revenueResult?.total ?? '0', 10),
    };
  }

  async adminRefundBooking(
    tenantId: string,
    bookingId: string,
  ): Promise<Payment> {
    return AppDataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const bookingRepo = manager.getRepository(Booking);

      const payment = await paymentRepo.findOne({
        where: { bookingId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) throw AppError.notFound('Payment');
      if (payment.status !== PaymentStatus.SUCCESS) {
        throw AppError.unprocessable('Payment is not in a refundable state');
      }
      if (!payment.paymentIntentId) {
        throw AppError.unprocessable('No payment intent found for refund');
      }

      const refund = await this.paymentProvider.createRefund(
        payment.paymentIntentId,
        payment.amountCents,
      );
      payment.status = PaymentStatus.REFUNDED;
      payment.refundId = refund.refundId;
      payment.refundAmountCents = refund.amountCents;
      payment.refundedAt = new Date();
      const saved = await paymentRepo.save(payment);

      await bookingRepo.update(
        { id: bookingId, tenantId },
        { status: BookingStatus.CANCELLED },
      );
      return saved;
    });
  }

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

  async listMedicineOrders(
    tenantId: string,
    page: number,
    limit: number,
    status?: string,
  ): Promise<{ data: object[]; total: number }> {
    const where: { tenantId: string; status?: MedicineOrder['status'] } = {
      tenantId,
    };
    if (status) where.status = status as MedicineOrder['status'];
    const [data, total] = await AppDataSource.getRepository(
      MedicineOrder,
    ).findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data: await this.attachPatientInfo(data), total };
  }

  async getMedicineOrderDetail(tenantId: string, id: string): Promise<object> {
    const order = await AppDataSource.getRepository(MedicineOrder).findOne({
      where: { id, tenantId },
    });
    if (!order) throw AppError.notFound('Order');
    const [withPatient] = await this.attachPatientInfo([order]);
    return withPatient;
  }

  async updateMedicineOrderStatus(
    tenantId: string,
    id: string,
    status: MedicineOrderStatus,
    note: string | undefined,
    adminUserId: string,
  ): Promise<MedicineOrder> {
    const repo = AppDataSource.getRepository(MedicineOrder);
    const order = await repo.findOne({ where: { id, tenantId } });
    if (!order) throw AppError.notFound('Order');

    assertValidTransition(order.status, status);

    order.status = status;
    if (status === MedicineOrderStatus.CANCELLED) {
      order.cancelReason = note;
      order.cancelledBy = adminUserId;
    }
    order.statusHistory = [
      ...order.statusHistory,
      { status, at: new Date().toISOString(), byUserId: adminUserId, note },
    ];
    await repo.save(order);

    const patient = await AppDataSource.getRepository(User).findOne({
      where: { id: order.patientId },
    });
    void this.whatsapp.notifyOrderStatusChanged(
      order,
      patient?.phoneNumber,
      status,
    );

    return order;
  }

  private async attachUserInfo<T extends { userId?: string }>(
    sessions: T[],
  ): Promise<
    (T & { user: { fullName?: string; phoneNumber?: string } | null })[]
  > {
    const userIds = [
      ...new Set(
        sessions.map((s) => s.userId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const users = userIds.length
      ? await AppDataSource.getRepository(User).findBy({ id: In(userIds) })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return sessions.map((s) => ({
      ...s,
      user: s.userId
        ? {
            fullName: byId.get(s.userId)?.fullName,
            phoneNumber: byId.get(s.userId)?.phoneNumber,
          }
        : null,
    }));
  }

  async listWhatsAppSessions(
    tenantId: string,
    page: number,
    limit: number,
    awaitingHuman?: boolean,
  ): Promise<{ data: object[]; total: number }> {
    const where: Record<string, unknown> = { tenantId };
    if (awaitingHuman !== undefined) where['awaitingHuman'] = awaitingHuman;
    const [data, total] = await AppDataSource.getRepository(
      WhatsAppSession,
    ).findAndCount({
      where,
      order: { lastMessageAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: await this.attachUserInfo(data), total };
  }

  async getWhatsAppSessionDetail(
    tenantId: string,
    id: string,
  ): Promise<object> {
    const session = await AppDataSource.getRepository(WhatsAppSession).findOne({
      where: { id, tenantId },
    });
    if (!session) throw AppError.notFound('WhatsApp session');
    const [withUser] = await this.attachUserInfo([session]);
    return withUser;
  }

  async replyToWhatsAppSession(
    tenantId: string,
    id: string,
    text: string,
  ): Promise<WhatsAppSession> {
    const repo = AppDataSource.getRepository(WhatsAppSession);
    const session = await repo.findOne({ where: { id, tenantId } });
    if (!session) throw AppError.notFound('WhatsApp session');

    await this.whatsapp.sendRaw(tenantId, session.phoneNumber, text);

    session.messages = [
      ...session.messages,
      { role: 'admin', content: text, timestamp: new Date().toISOString() },
    ];
    session.awaitingHuman = true;
    session.lastMessageAt = new Date();
    return repo.save(session);
  }

  async resumeWhatsAppBot(
    tenantId: string,
    id: string,
  ): Promise<WhatsAppSession> {
    const repo = AppDataSource.getRepository(WhatsAppSession);
    const session = await repo.findOne({ where: { id, tenantId } });
    if (!session) throw AppError.notFound('WhatsApp session');
    session.awaitingHuman = false;
    return repo.save(session);
  }

  async listWhatsAppFlows(tenantId: string): Promise<WhatsAppFlow[]> {
    return AppDataSource.getRepository(WhatsAppFlow).find({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
    });
  }

  async getWhatsAppFlow(tenantId: string, id: string): Promise<WhatsAppFlow> {
    const flow = await AppDataSource.getRepository(WhatsAppFlow).findOne({
      where: { id, tenantId },
    });
    if (!flow) throw AppError.notFound('Flow');
    return flow;
  }

  async createWhatsAppFlow(
    tenantId: string,
    name: string,
  ): Promise<WhatsAppFlow> {
    const repo = AppDataSource.getRepository(WhatsAppFlow);
    const flow = repo.create({
      tenantId,
      name,
      isActive: false,
      definition: { nodes: [], edges: [] },
    });
    return repo.save(flow);
  }

  // Lets an admin describe a flow in plain English instead of manually
  // dragging nodes/edges — the AI returns a node/edge graph (validated
  // against the same node types the flow engine actually executes), which
  // we then auto-layout and save as a new flow ready to review/tweak.
  async generateWhatsAppFlow(
    tenantId: string,
    name: string,
    prompt: string,
  ): Promise<WhatsAppFlow> {
    const result = await this.ai.chat({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: FLOW_GENERATION_SYSTEM_PROMPT,
      patientContext: {
        bloodGroup: '',
        allergies: [],
        chronicConditions: [],
        history: [],
      },
      sessionId: 'whatsapp-flow-generation',
    });

    const definition = parseGeneratedFlow(result.reply);

    const repo = AppDataSource.getRepository(WhatsAppFlow);
    const flow = repo.create({ tenantId, name, isActive: false, definition });
    return repo.save(flow);
  }

  // Same idea as generateWhatsAppFlow, but for editing a flow that already
  // has content — the current definition is included as context so the AI
  // extends/modifies it instead of starting from a blank graph.
  async editWhatsAppFlowWithAi(
    tenantId: string,
    flowId: string,
    prompt: string,
  ): Promise<WhatsAppFlow> {
    const repo = AppDataSource.getRepository(WhatsAppFlow);
    const flow = await repo.findOne({ where: { id: flowId, tenantId } });
    if (!flow) throw AppError.notFound('Flow');

    const hasExistingContent = flow.definition.nodes.length > 0;
    const userMessage = hasExistingContent
      ? `Here is the CURRENT flow definition as JSON:\n${JSON.stringify(flow.definition)}\n\n` +
        `Modify or extend this flow according to the instruction below, keeping any parts that aren't ` +
        `mentioned unchanged. Return the FULL updated flow definition (all nodes and edges, not just the new ones).\n\n` +
        `Instruction: ${prompt}`
      : prompt;

    const result = await this.ai.chat({
      messages: [{ role: 'user', content: userMessage }],
      systemPrompt: FLOW_GENERATION_SYSTEM_PROMPT,
      patientContext: {
        bloodGroup: '',
        allergies: [],
        chronicConditions: [],
        history: [],
      },
      sessionId: 'whatsapp-flow-generation',
    });

    flow.definition = parseGeneratedFlow(result.reply);
    return repo.save(flow);
  }

  async updateWhatsAppFlow(
    tenantId: string,
    id: string,
    updates: { name?: string; definition?: WhatsAppFlowDefinition },
  ): Promise<WhatsAppFlow> {
    const repo = AppDataSource.getRepository(WhatsAppFlow);
    const flow = await repo.findOne({ where: { id, tenantId } });
    if (!flow) throw AppError.notFound('Flow');
    if (updates.name !== undefined) flow.name = updates.name;
    if (updates.definition !== undefined) flow.definition = updates.definition;
    return repo.save(flow);
  }

  async activateWhatsAppFlow(
    tenantId: string,
    id: string,
  ): Promise<WhatsAppFlow> {
    const repo = AppDataSource.getRepository(WhatsAppFlow);
    const flow = await repo.findOne({ where: { id, tenantId } });
    if (!flow) throw AppError.notFound('Flow');
    await repo.update({ tenantId, isActive: true }, { isActive: false });
    flow.isActive = true;
    return repo.save(flow);
  }

  async deactivateWhatsAppFlow(
    tenantId: string,
    id: string,
  ): Promise<WhatsAppFlow> {
    const repo = AppDataSource.getRepository(WhatsAppFlow);
    const flow = await repo.findOne({ where: { id, tenantId } });
    if (!flow) throw AppError.notFound('Flow');
    flow.isActive = false;
    return repo.save(flow);
  }

  async deleteWhatsAppFlow(tenantId: string, id: string): Promise<void> {
    const result = await AppDataSource.getRepository(WhatsAppFlow).delete({
      id,
      tenantId,
    });
    if (!result.affected) throw AppError.notFound('Flow');
  }

  async getAnalytics(tenantId: string): Promise<{
    totalRevenue: number;
    revenueThisMonth: number;
    totalUsers: number;
    newUsersThisMonth: number;
    totalDoctors: number;
    approvedDoctors: number;
    pendingDoctors: number;
    totalConsults: number;
    consultsThisMonth: number;
    totalAiSessions: number;
    aiReferralRate: number;
    topDoctorsByRating: DoctorProfile[];
    revenueByMonth: { month: string; amount: number }[];
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalRevenue,
      revenueThisMonth,
      totalUsers,
      newUsersThisMonth,
      totalDoctors,
      approvedDoctors,
      pendingDoctors,
      totalConsults,
      consultsThisMonth,
      totalAiSessions,
      aiReferralCount,
      topDoctors,
    ] = await Promise.all([
      AppDataSource.getRepository(Payment)
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount_cents), 0)', 'total')
        .where('p.status = :s AND p.tenant_id = :tenantId', {
          s: PaymentStatus.SUCCESS,
          tenantId,
        })
        .getRawOne<{ total: string }>()
        .then((r) => parseInt(r?.total ?? '0', 10)),

      AppDataSource.getRepository(Payment)
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount_cents), 0)', 'total')
        .where(
          'p.status = :s AND p.created_at >= :start AND p.tenant_id = :tenantId',
          {
            s: PaymentStatus.SUCCESS,
            start: startOfMonth,
            tenantId,
          },
        )
        .getRawOne<{ total: string }>()
        .then((r) => parseInt(r?.total ?? '0', 10)),

      AppDataSource.getRepository(User).count({ where: { tenantId } }),
      AppDataSource.getRepository(User)
        .createQueryBuilder('u')
        .where('u.created_at >= :start AND u.tenant_id = :tenantId', {
          start: startOfMonth,
          tenantId,
        })
        .getCount(),
      AppDataSource.getRepository(DoctorProfile).count({
        where: { tenantId },
      }),
      AppDataSource.getRepository(DoctorProfile).count({
        where: { approvalStatus: ApprovalStatus.APPROVED, tenantId },
      }),
      AppDataSource.getRepository(DoctorProfile).count({
        where: { approvalStatus: ApprovalStatus.PENDING, tenantId },
      }),
      AppDataSource.getRepository(Booking).count({ where: { tenantId } }),
      AppDataSource.getRepository(Booking)
        .createQueryBuilder('b')
        .where('b.created_at >= :start AND b.tenant_id = :tenantId', {
          start: startOfMonth,
          tenantId,
        })
        .getCount(),
      AppDataSource.getRepository(AiSession).count({ where: { tenantId } }),
      AppDataSource.getRepository(AiSession).count({
        where: { referToDoctor: true, tenantId },
      }),
      AppDataSource.getRepository(DoctorProfile).find({
        where: { tenantId },
        order: { rating: 'DESC' },
        take: 5,
        relations: ['user'],
      }),
    ]);

    const revenueByMonth: { month: string; amount: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const result = await AppDataSource.getRepository(Payment)
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount_cents), 0)', 'total')
        .where(
          'p.status = :s AND p.created_at >= :start AND p.created_at < :end AND p.tenant_id = :tenantId',
          {
            s: PaymentStatus.SUCCESS,
            start: d,
            end: next,
            tenantId,
          },
        )
        .getRawOne<{ total: string }>();
      revenueByMonth.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        amount: parseInt(result?.total ?? '0', 10),
      });
    }

    return {
      totalRevenue,
      revenueThisMonth,
      totalUsers,
      newUsersThisMonth,
      totalDoctors,
      approvedDoctors,
      pendingDoctors,
      totalConsults,
      consultsThisMonth,
      totalAiSessions,
      aiReferralRate:
        totalAiSessions > 0 ? aiReferralCount / totalAiSessions : 0,
      topDoctorsByRating: topDoctors,
      revenueByMonth,
    };
  }

  async listAiSessions(
    tenantId: string,
    page: number,
    limit: number,
  ): Promise<{ data: AiSession[]; total: number }> {
    const [data, total] = await AppDataSource.getRepository(
      AiSession,
    ).findAndCount({
      where: { tenantId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['user'],
    });
    return { data, total };
  }

  async inviteDoctor(
    tenantId: string,
    phone: string,
    fullName: string,
  ): Promise<{ user: User; isNew: boolean }> {
    const userRepo = AppDataSource.getRepository(User);
    let isNew = false;
    let user = await userRepo.findOne({
      where: { phoneNumber: phone, tenantId },
    });

    if (user) {
      if (user.role === UserRole.DOCTOR) {
        throw AppError.conflict(
          'A doctor with this phone number already exists',
        );
      }
      user.role = UserRole.DOCTOR;
      if (fullName) user.fullName = fullName;
      await userRepo.save(user);
    } else {
      isNew = true;
      user = userRepo.create({
        firebaseUid: `phone_${tenantId}_${phone}`,
        phoneNumber: phone,
        fullName,
        role: UserRole.DOCTOR,
        isActive: true,
        tenantId,
      });
      await userRepo.save(user);
    }

    await this.authProvider.sendOtp(phone);
    return { user, isNew };
  }

  async createDoctorFull(
    tenantId: string,
    data: {
      phone: string;
      fullName: string;
      specialty?: string;
      licenseNumber?: string;
      yearsOfExperience?: number;
      qualifications?: string[];
      languages?: string[];
      bio?: string;
      consultationFee?: number;
      skipOtp?: boolean;
    },
  ): Promise<{ user: User; profile: DoctorProfile; isNew: boolean }> {
    const userRepo = AppDataSource.getRepository(User);
    const profileRepo = AppDataSource.getRepository(DoctorProfile);

    let isNew = false;
    let user = await userRepo.findOne({
      where: { phoneNumber: data.phone, tenantId },
    });

    if (user) {
      if (user.role === UserRole.DOCTOR) {
        throw AppError.conflict(
          'A doctor with this phone number already exists',
        );
      }
      user.role = UserRole.DOCTOR;
      user.fullName = data.fullName;
      await userRepo.save(user);
    } else {
      isNew = true;
      user = userRepo.create({
        firebaseUid: `phone_${tenantId}_${data.phone}`,
        phoneNumber: data.phone,
        fullName: data.fullName,
        role: UserRole.DOCTOR,
        isActive: true,
        tenantId,
      });
      await userRepo.save(user);
    }

    let profile = await profileRepo.findOne({
      where: { userId: user.id, tenantId },
    });
    if (!profile) {
      profile = profileRepo.create({ userId: user.id, tenantId });
    }

    if (data.specialty !== undefined) profile.specialty = data.specialty;
    if (data.licenseNumber !== undefined)
      profile.licenseNumber = data.licenseNumber;
    if (data.yearsOfExperience !== undefined)
      profile.yearsOfExperience = data.yearsOfExperience;
    if (data.qualifications !== undefined)
      profile.qualifications = data.qualifications;
    if (data.languages !== undefined) profile.languages = data.languages;
    if (data.bio !== undefined) profile.bio = data.bio;
    if (data.consultationFee !== undefined)
      profile.consultationFee = data.consultationFee;

    await profileRepo.save(profile);
    if (!data.skipOtp) {
      await this.authProvider.sendOtp(data.phone);
    }

    return { user, profile, isNew };
  }

  async adminUpdateDoctorProfile(
    tenantId: string,
    doctorProfileId: string,
    data: {
      specialty?: string;
      licenseNumber?: string;
      yearsOfExperience?: number;
      qualifications?: string[];
      languages?: string[];
      bio?: string;
      consultationFee?: number;
    },
  ): Promise<DoctorProfile> {
    const repo = AppDataSource.getRepository(DoctorProfile);
    const profile = await repo.findOne({
      where: { id: doctorProfileId, tenantId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    Object.assign(profile, data);
    return repo.save(profile);
  }

  async adminUploadDocument(
    tenantId: string,
    doctorProfileId: string,
    file: Express.Multer.File,
    documentType: DocumentType,
    notes?: string,
  ): Promise<DoctorDocument> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { id: doctorProfileId, tenantId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');

    const ext = file.originalname.split('.').pop() ?? 'bin';
    const key = `doctor-documents/${profile.id}/${documentType}-${Date.now()}.${ext}`;
    const fileUrl = await this.storage.upload(key, file.buffer, file.mimetype);

    const repo = AppDataSource.getRepository(DoctorDocument);
    const doc = repo.create({
      doctorProfileId,
      documentType,
      fileUrl,
      fileName: file.originalname,
      mimeType: file.mimetype,
      notes,
    });
    const saved = await repo.save(doc);
    const signedUrl = await this.storage.getSignedUrl(key, 3600);
    return { ...saved, signedUrl } as DoctorDocument & { signedUrl: string };
  }

  async adminAddAvailability(
    tenantId: string,
    doctorProfileId: string,
    data: {
      dayOfWeek: string;
      startTime: string;
      endTime: string;
      slotDurationMinutes?: number;
    },
  ): Promise<DoctorAvailability> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { id: doctorProfileId, tenantId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');

    const repo = AppDataSource.getRepository(DoctorAvailability);
    const avail = repo.create({
      doctorProfileId,
      dayOfWeek: data.dayOfWeek as DayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      slotDurationMinutes: data.slotDurationMinutes ?? 30,
      isActive: true,
    });
    return repo.save(avail);
  }

  async adminDeleteAvailability(
    tenantId: string,
    doctorProfileId: string,
    availId: string,
  ): Promise<void> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { id: doctorProfileId, tenantId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');

    const repo = AppDataSource.getRepository(DoctorAvailability);
    const avail = await repo.findOne({
      where: { id: availId, doctorProfileId },
    });
    if (!avail) throw AppError.notFound('Availability slot');
    await repo.remove(avail);
  }

  async getDoctorDocuments(
    tenantId: string,
    doctorProfileId: string,
  ): Promise<(DoctorDocument & { signedUrl: string })[]> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { id: doctorProfileId, tenantId },
    });
    if (!profile) throw AppError.notFound('Doctor');
    const docs = await AppDataSource.getRepository(DoctorDocument).find({
      where: { doctorProfileId },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      docs.map(async (doc) => {
        try {
          const key = new URL(doc.fileUrl).pathname.slice(1);
          const signedUrl = await this.storage.getSignedUrl(key, 3600);
          return { ...doc, signedUrl };
        } catch {
          return { ...doc, signedUrl: doc.fileUrl };
        }
      }),
    );
  }

  async createAiDoctor(
    tenantId: string,
    data: {
      name: string;
      specialty?: string;
      description?: string;
      avatarUrl?: string;
      systemPrompt: string;
    },
    createdBy: string,
  ): Promise<AiDoctor> {
    const doctor = AppDataSource.getRepository(AiDoctor).create({
      ...data,
      tenantId,
      createdBy,
      isActive: true,
    });
    return AppDataSource.getRepository(AiDoctor).save(doctor);
  }

  async listAiDoctors(
    tenantId: string,
    page: number,
    limit: number,
  ): Promise<{ data: AiDoctor[]; total: number }> {
    const [data, total] = await AppDataSource.getRepository(
      AiDoctor,
    ).findAndCount({
      where: { tenantId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['creator'],
    });
    return { data, total };
  }

  async updateAiDoctor(
    tenantId: string,
    id: string,
    data: Partial<{
      name: string;
      specialty: string;
      description: string;
      avatarUrl: string;
      systemPrompt: string;
    }>,
  ): Promise<AiDoctor> {
    const doctor = await AppDataSource.getRepository(AiDoctor).findOne({
      where: { id, tenantId },
    });
    if (!doctor) throw AppError.notFound('AI Doctor');
    Object.assign(doctor, data);
    return AppDataSource.getRepository(AiDoctor).save(doctor);
  }

  async toggleAiDoctorActive(tenantId: string, id: string): Promise<AiDoctor> {
    const doctor = await AppDataSource.getRepository(AiDoctor).findOne({
      where: { id, tenantId },
    });
    if (!doctor) throw AppError.notFound('AI Doctor');
    doctor.isActive = !doctor.isActive;
    return AppDataSource.getRepository(AiDoctor).save(doctor);
  }

  async deleteDoctorProfile(
    tenantId: string,
    profileId: string,
  ): Promise<void> {
    const profileRepo = AppDataSource.getRepository(DoctorProfile);
    const profile = await profileRepo.findOne({
      where: { id: profileId, tenantId },
      relations: ['user'],
    });
    if (!profile) throw AppError.notFound('Doctor');
    await profileRepo.remove(profile);
  }

  async deleteAiDoctor(tenantId: string, id: string): Promise<void> {
    const doctor = await AppDataSource.getRepository(AiDoctor).findOne({
      where: { id, tenantId },
    });
    if (!doctor) throw AppError.notFound('AI Doctor');
    // Null out sessions referencing this AI doctor before deletion
    await AppDataSource.query(
      `UPDATE ai_sessions SET ai_doctor_id = NULL WHERE ai_doctor_id = $1`,
      [id],
    );
    await AppDataSource.getRepository(AiDoctor).remove(doctor);
  }

  // Generates one field of an AI doctor's config at a time — whichever
  // other fields are already filled in are passed as context so the
  // suggestion stays coherent (e.g. a "Description" generated after
  // "Specialty: Cardiology" reflects cardiology, not something generic).
  async generateAiDoctorField(
    field: 'name' | 'specialty' | 'description' | 'systemPrompt',
    context: {
      name?: string;
      specialty?: string;
      description?: string;
      systemPrompt?: string;
    },
  ): Promise<string> {
    const contextLines = [
      context.name && `Name so far: ${context.name}`,
      context.specialty && `Specialty so far: ${context.specialty}`,
      context.description && `Description so far: ${context.description}`,
      context.systemPrompt && `System prompt so far: ${context.systemPrompt}`,
    ]
      .filter(Boolean)
      .join('\n');

    const instructions: Record<typeof field, string> = {
      name: `Suggest a display name for this AI doctor persona, in the format "Dr. <FirstName> (<Specialty or General Physician>)". Invent a plausible specialty if none is given yet.`,
      specialty: `Suggest a single medical specialty (e.g. Cardiology, Dermatology, General Physician, Pediatrics) that fits this AI doctor.`,
      description: `Write a 1-2 sentence patient-facing description of what this AI doctor specializes in and how it can help.`,
      systemPrompt: `Write a THOROUGH, detailed system prompt (at least 250-400 words, multiple short paragraphs plus a numbered list — not a brief summary) of instructions for this AI doctor persona to follow when chatting with patients on the ZyroHealth telemedicine platform. Tailor everything to the specialty if one is given, and cover ALL of:
1. A warm framing of who they are and their role
2. How to actively listen and ask targeted, specialty-specific follow-up questions
3. Specific red-flag symptoms for this specialty that should trigger an urgent "seek in-person/ER care now" recommendation
4. The kind of general guidance/education they CAN safely give within this specialty
5. Explicit boundaries: never give a definitive diagnosis, never prescribe medication, always recommend a real doctor for anything concerning or persistent
6. The tone and communication style to use`,
    };

    // A different random angle each call, plus an explicit instruction not
    // to default to the same generic answer — otherwise a fixed prompt
    // tends to make the model converge on the same "safest" completion
    // every time, which defeats the point of a "generate again" button.
    const VARIATION_HINTS = [
      'Lean into a warm, reassuring, gentle tone for this one.',
      'Lean into a crisp, efficient, no-nonsense tone for this one.',
      'Lean into an encouraging, upbeat, friendly tone for this one.',
      'Lean into a calm, methodical, detail-oriented tone for this one.',
      'Lean into a down-to-earth, conversational, plain-spoken tone for this one.',
      'Give this one an especially experienced, senior-clinician feel.',
      'Give this one a modern, approachable, younger-clinician feel.',
    ];
    const variationHint =
      VARIATION_HINTS[Math.floor(Math.random() * VARIATION_HINTS.length)];

    const prompt = `${instructions[field]}\n\n${variationHint}\n\n${contextLines || 'No other fields have been filled in yet — invent a plausible, coherent persona from scratch.'}\n\nThis may be regenerated multiple times — give a genuinely different, fresh alternative each time rather than the most common/generic answer.\n\nReturn ONLY the ${field === 'systemPrompt' ? 'system prompt text' : field} itself — no quotes, no markdown, no explanation, no labels.`;

    const result = await this.ai.chat({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt:
        'You generate varied, production-ready configuration content for AI doctor personas on a telemedicine admin panel. Follow the instruction exactly and return only the requested value. Never repeat the same phrasing you might have used before — always produce a fresh take.',
      patientContext: {
        bloodGroup: '',
        allergies: [],
        chronicConditions: [],
        history: [],
      },
      sessionId: 'ai-doctor-field-generation',
    });

    return result.reply.trim().replace(/^["'`]|["'`]$/g, '');
  }

  // Generates one field of a REAL doctor's profile at a time, for the
  // "Add Doctor" wizard — same per-field AI-assist UX as generateAiDoctorField
  // above, but tuned for a real licensed clinician's profile rather than a
  // synthetic AI persona (no licenseNumber field here — that's a real
  // regulatory identifier and must never be fabricated).
  async generateDoctorProfileField(
    field: 'specialty' | 'bio' | 'qualifications' | 'languages',
    context: {
      fullName?: string;
      specialty?: string;
      yearsOfExperience?: number;
      bio?: string;
      qualifications?: string[];
      languages?: string[];
    },
  ): Promise<string> {
    const contextLines = [
      context.fullName && `Doctor's name: ${context.fullName}`,
      context.specialty && `Specialty so far: ${context.specialty}`,
      context.yearsOfExperience != null &&
        `Years of experience: ${context.yearsOfExperience}`,
      context.bio && `Bio so far: ${context.bio}`,
      context.qualifications?.length &&
        `Qualifications so far: ${context.qualifications.join(', ')}`,
      context.languages?.length &&
        `Languages so far: ${context.languages.join(', ')}`,
    ]
      .filter(Boolean)
      .join('\n');

    const instructions: Record<typeof field, string> = {
      specialty: `Suggest a single realistic medical specialty (e.g. Cardiology, Dermatology, General Physician, Pediatrics) that fits this real doctor, based on their name and any other details given.`,
      bio: `Write a warm, professional 2-4 sentence public-facing bio for this real doctor's profile, in third person, naturally referencing their specialty and years of experience if known. It should read like a genuine clinician's bio, not a marketing blurb.`,
      qualifications: `Suggest a realistic, ordered list of 2-4 medical qualifications/degrees (e.g. MBBS, MD, DNB, FRCS) appropriate for this doctor's specialty and experience level. Return ONLY a comma-separated list, nothing else.`,
      languages: `Suggest a realistic list of 2-3 languages this doctor might speak, suited for a telemedicine platform serving Indian patients (typically English, Hindi, plus one relevant regional language). Return ONLY a comma-separated list, nothing else.`,
    };

    const VARIATION_HINTS = [
      'Lean into a warm, reassuring, gentle tone for this one.',
      'Lean into a crisp, efficient, no-nonsense tone for this one.',
      'Lean into an encouraging, upbeat, friendly tone for this one.',
      'Lean into a calm, methodical, detail-oriented tone for this one.',
      'Lean into a down-to-earth, conversational, plain-spoken tone for this one.',
      'Give this one an especially experienced, senior-clinician feel.',
      'Give this one a modern, approachable, younger-clinician feel.',
    ];
    const variationHint =
      VARIATION_HINTS[Math.floor(Math.random() * VARIATION_HINTS.length)];

    const prompt = `${instructions[field]}\n\n${variationHint}\n\n${contextLines || 'No other fields have been filled in yet — infer something plausible from the name alone, or a common sensible default if the name gives no hint.'}\n\nThis may be regenerated multiple times — give a genuinely different, fresh alternative each time rather than the most common/generic answer.\n\nReturn ONLY the ${field === 'bio' ? 'bio text' : field} itself — no quotes, no markdown, no explanation, no labels.`;

    const result = await this.ai.chat({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt:
        'You generate realistic, professional profile content for real licensed doctors on a telemedicine admin panel. Follow the instruction exactly and return only the requested value. Never repeat the same phrasing you might have used before — always produce a fresh take.',
      patientContext: {
        bloodGroup: '',
        allergies: [],
        chronicConditions: [],
        history: [],
      },
      sessionId: 'doctor-profile-field-generation',
    });

    return result.reply.trim().replace(/^["'`]|["'`]$/g, '');
  }

  // ── AI Studio Assistant ──────────────────────────────────────────────
  // Free-form Q&A over this tenant's own operational data, gated per
  // domain by the asking user's real permission set (same keys
  // requirePermission() checks on the REST routes). Data for a domain is
  // only ever fetched — and therefore only ever handed to the model — if
  // the caller is entitled to it, so a Receptionist scoped to
  // bookings.view alone can never get a revenue number out of this even
  // by asking directly; the figure was never in the prompt to begin with.
  async askStudioAssistant(
    tenantId: string,
    permissions: string[],
    message: string,
    history: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<string> {
    const has = (key: string): boolean =>
      permissions.includes('*') || permissions.includes(key);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const DOMAIN_PERMS: Record<string, string> = {
      Doctors: 'doctors.view',
      Bookings: 'bookings.view',
      Prescriptions: 'prescriptions.view',
      'Medicine Orders': 'medicine_orders.view',
      'Revenue & Payments': 'payments.view',
      WhatsApp: 'whatsapp.view',
      'Voice Agent': 'voice_agent.view',
      'AI Doctors': 'ai_doctors.view',
      'Users & Staff': 'users.view',
    };
    const deniedDomains = Object.entries(DOMAIN_PERMS)
      .filter(([, key]) => !has(key) && key !== 'payments.view')
      .map(([label]) => label);
    if (!has('payments.view') && !has('analytics.view')) {
      deniedDomains.push('Revenue & Payments');
    }

    const sections: string[] = [];

    if (has('doctors.view')) {
      const doctorRepo = AppDataSource.getRepository(DoctorProfile);
      const [total, approved, pending, rejected, topDoctors] =
        await Promise.all([
          doctorRepo.count({ where: { tenantId } }),
          doctorRepo.count({
            where: { tenantId, approvalStatus: ApprovalStatus.APPROVED },
          }),
          doctorRepo.count({
            where: { tenantId, approvalStatus: ApprovalStatus.PENDING },
          }),
          doctorRepo.count({
            where: { tenantId, approvalStatus: ApprovalStatus.REJECTED },
          }),
          doctorRepo.find({
            where: { tenantId, approvalStatus: ApprovalStatus.APPROVED },
            relations: ['user'],
            order: { rating: 'DESC' },
            take: 5,
          }),
        ]);
      sections.push(
        `DOCTORS — total: ${total}, approved: ${approved}, pending approval: ${pending}, rejected: ${rejected}. ` +
          `Top rated: ${
            topDoctors
              .map(
                (d) =>
                  `${d.user?.fullName ?? 'Unknown'} (${d.specialty ?? 'general'}, rating ${d.rating ?? 'n/a'}, ${d.totalConsultations ?? 0} consults)`,
              )
              .join('; ') || 'none yet'
          }.`,
      );
    }

    if (has('bookings.view')) {
      const bookingRepo = AppDataSource.getRepository(Booking);
      const [total, thisMonth, pending, paid, active, completed, cancelled] =
        await Promise.all([
          bookingRepo.count({ where: { tenantId } }),
          bookingRepo
            .createQueryBuilder('b')
            .where('b.tenant_id = :tenantId AND b.created_at >= :start', {
              tenantId,
              start: startOfMonth,
            })
            .getCount(),
          bookingRepo.count({
            where: { tenantId, status: BookingStatus.PENDING },
          }),
          bookingRepo.count({
            where: { tenantId, status: BookingStatus.PAID },
          }),
          bookingRepo.count({
            where: { tenantId, status: BookingStatus.ACTIVE },
          }),
          bookingRepo.count({
            where: { tenantId, status: BookingStatus.COMPLETED },
          }),
          bookingRepo.count({
            where: { tenantId, status: BookingStatus.CANCELLED },
          }),
        ]);
      sections.push(
        `BOOKINGS — total: ${total}, this month: ${thisMonth}. By status: awaiting payment (pending): ${pending}, paid/booked: ${paid}, active/in-progress: ${active}, completed: ${completed}, cancelled: ${cancelled}. ` +
          `("paid" bookings have been paid for but not yet completed; a booking only counts toward revenue once its linked payment succeeds — see REVENUE & PAYMENTS if provided.)`,
      );
    }

    if (has('prescriptions.view')) {
      const rxRepo = AppDataSource.getRepository(Prescription);
      const [total, thisMonth] = await Promise.all([
        rxRepo.count({ where: { tenantId } }),
        rxRepo
          .createQueryBuilder('p')
          .where('p.tenant_id = :tenantId AND p.created_at >= :start', {
            tenantId,
            start: startOfMonth,
          })
          .getCount(),
      ]);
      sections.push(
        `PRESCRIPTIONS — total: ${total}, issued this month: ${thisMonth}.`,
      );
    }

    if (has('medicine_orders.view')) {
      const orderRepo = AppDataSource.getRepository(MedicineOrder);
      const [total, delivered, cancelled, placed] = await Promise.all([
        orderRepo.count({ where: { tenantId } }),
        orderRepo.count({
          where: { tenantId, status: MedicineOrderStatus.DELIVERED },
        }),
        orderRepo.count({
          where: { tenantId, status: MedicineOrderStatus.CANCELLED },
        }),
        orderRepo.count({
          where: { tenantId, status: MedicineOrderStatus.PLACED },
        }),
      ]);
      sections.push(
        `MEDICINE ORDERS — total: ${total}, delivered: ${delivered}, cancelled: ${cancelled}, newly placed: ${placed}.`,
      );
    }

    if (has('payments.view') || has('analytics.view')) {
      const paymentRepo = AppDataSource.getRepository(Payment);
      const [totalRevenueCents, revenueThisMonthCents] = await Promise.all([
        paymentRepo
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.amount_cents), 0)', 'total')
          .where('p.status = :s AND p.tenant_id = :tenantId', {
            s: PaymentStatus.SUCCESS,
            tenantId,
          })
          .getRawOne<{ total: string }>()
          .then((r) => parseInt(r?.total ?? '0', 10)),
        paymentRepo
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.amount_cents), 0)', 'total')
          .where(
            'p.status = :s AND p.created_at >= :start AND p.tenant_id = :tenantId',
            { s: PaymentStatus.SUCCESS, start: startOfMonth, tenantId },
          )
          .getRawOne<{ total: string }>()
          .then((r) => parseInt(r?.total ?? '0', 10)),
      ]);
      sections.push(
        `REVENUE & PAYMENTS — total revenue: ₹${(totalRevenueCents / 100).toFixed(2)}, this month: ₹${(revenueThisMonthCents / 100).toFixed(2)}.`,
      );
    }

    if (has('whatsapp.view')) {
      const sessionRepo = AppDataSource.getRepository(WhatsAppSession);
      const flowRepo = AppDataSource.getRepository(WhatsAppFlow);
      const [totalSessions, awaitingHuman, totalFlows, activeFlow] =
        await Promise.all([
          sessionRepo.count({ where: { tenantId } }),
          sessionRepo.count({ where: { tenantId, awaitingHuman: true } }),
          flowRepo.count({ where: { tenantId } }),
          flowRepo.findOne({ where: { tenantId, isActive: true } }),
        ]);
      sections.push(
        `WHATSAPP — total sessions: ${totalSessions}, awaiting human reply: ${awaitingHuman}, total flows: ${totalFlows}, active flow: ${activeFlow?.name ?? 'none'}.`,
      );
    }

    if (has('voice_agent.view')) {
      const agentRepo = AppDataSource.getRepository(VoiceAgent);
      const numberRepo = AppDataSource.getRepository(VoiceAgentPhoneNumber);
      const [totalAgents, activeAgents, totalNumbers] = await Promise.all([
        agentRepo.count({ where: { tenantId } }),
        agentRepo.count({ where: { tenantId, active: true } }),
        numberRepo.count({ where: { tenantId } }),
      ]);
      sections.push(
        `VOICE AGENT — total agents configured: ${totalAgents}, active: ${activeAgents}, phone numbers in pool: ${totalNumbers}.`,
      );
    }

    if (has('ai_doctors.view')) {
      const aiDoctorRepo = AppDataSource.getRepository(AiDoctor);
      const [total, active] = await Promise.all([
        aiDoctorRepo.count({ where: { tenantId } }),
        aiDoctorRepo.count({ where: { tenantId, isActive: true } }),
      ]);
      sections.push(
        `AI DOCTORS — total personas: ${total}, active: ${active}.`,
      );
    }

    if (has('users.view')) {
      const userRepo = AppDataSource.getRepository(User);
      const [totalUsers, patients, doctorAccounts, staff, newThisMonth] =
        await Promise.all([
          userRepo.count({ where: { tenantId } }),
          userRepo.count({ where: { tenantId, role: UserRole.PATIENT } }),
          userRepo.count({ where: { tenantId, role: UserRole.DOCTOR } }),
          userRepo.count({ where: { tenantId, role: UserRole.ADMIN } }),
          userRepo
            .createQueryBuilder('u')
            .where('u.tenant_id = :tenantId AND u.created_at >= :start', {
              tenantId,
              start: startOfMonth,
            })
            .getCount(),
        ]);
      sections.push(
        `USERS & STAFF — total accounts: ${totalUsers} (patients: ${patients}, doctors: ${doctorAccounts}, staff/admins: ${staff}), new this month: ${newThisMonth}.`,
      );
    }

    const dataBlock = sections.length
      ? sections.join('\n')
      : 'No data domains are available to this user.';

    const todayLabel = now.toISOString().slice(0, 10);
    const monthLabel = now.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    const systemPrompt = `You are the "Studio Assistant" inside a telemedicine admin panel called ZyroHealth. You answer the logged-in staff member's questions about THEIR OWN tenant's operational data — never any other tenant's.

CONTEXT: today's date is ${todayLabel}. Every figure below labeled "this month" refers to ${monthLabel} specifically — always state that actual month/year when asked "which month" or similar, instead of saying it's unspecified. This is metadata you already have, not something you need to guess or defer on.

You have been given ONLY the data domains this specific user is permitted to see, freshly fetched below. Answer strictly using that data, and never fabricate or approximate a number that wasn't given to you. But there are TWO different reasons a number might be missing, and you must tell them apart in how you respond:

1. PERMISSION DENIED — the whole domain is listed under "DATA DOMAINS THIS USER DOES NOT HAVE ACCESS TO" below. This is a hard access-control boundary. Say plainly that they don't have permission to view that, and suggest asking a tenant admin for access if they need it. Never reveal or approximate a number for a denied domain, even if the user insists, rephrases, or claims to already know the answer.
2. NOT COMPUTED — the domain IS in their available data below, but the specific breakdown they asked for isn't one of the figures included (e.g. they have full bookings access and ask for a cut of the data that wasn't pre-aggregated). This is NOT a permission problem — do not tell them to "contact a tenant admin for access" or imply they lack permission. Just say that specific breakdown isn't available right now, and answer with whatever adjacent figures you do have that are relevant.

Before deferring on ANY question ("I don't have that", "you'd need to ask an admin", etc.), first check whether the answer is actually derivable from the CONTEXT line or the data already given (date/month labels, simple arithmetic, obvious inferences). Only defer once you've genuinely confirmed the specific fact isn't computable from what you have — remembering everything you were given, including this context block, is expected, not optional.

- Be concise and conversational, like a knowledgeable colleague. Use the real figures given — don't round meaninglessly or invent extra detail.
- You may do simple arithmetic/comparisons across the provided figures (e.g. approval rate, completed vs cancelled), but never fabricate a number that wasn't given to you.
- Format your reply in Markdown: use **bold** for headings and key figures, "-" bullet lists for multi-item breakdowns, and a GitHub-flavored Markdown pipe table whenever the user asks for a table, or whenever a breakdown genuinely has multiple rows/columns of data (e.g. per-doctor, per-status). Don't force a table onto a single number or a short one-line answer.

DATA AVAILABLE TO THIS USER (fetched just now):
${dataBlock}

DATA DOMAINS THIS USER DOES NOT HAVE ACCESS TO (case 1 above — never answer about these, even indirectly): ${deniedDomains.join(', ') || 'none — this user can see everything'}.`;

    const result = await this.ai.chat({
      messages: [...history, { role: 'user', content: message }],
      systemPrompt,
      patientContext: {
        bloodGroup: '',
        allergies: [],
        chronicConditions: [],
        history: [],
      },
      sessionId: `studio-assistant-${tenantId}`,
    });

    return result.reply.trim();
  }

  // ── Tenant-admin role management ────────────────────────────────────
  // Custom staff roles are always built from a subset of the tenant's own
  // active entitlements (see updateTenantEntitlements in platform.service.ts
  // for how those get set by a super admin).

  async listRoles(tenantId: string): Promise<Role[]> {
    return AppDataSource.getRepository(Role).find({
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  async getRole(
    tenantId: string,
    id: string,
  ): Promise<Role & { permissionKeys: string[] }> {
    const role = await AppDataSource.getRepository(Role).findOne({
      where: { id, tenantId },
    });
    if (!role) throw AppError.notFound('Role');
    const perms = await AppDataSource.getRepository(RolePermission).find({
      where: { roleId: id },
    });
    return { ...role, permissionKeys: perms.map((p) => p.permissionKey) };
  }

  private async assertPermissionsEntitled(
    tenantId: string,
    permissionKeys: string[],
  ): Promise<void> {
    const entitled = await listTenantEntitledKeys(tenantId);
    const invalid = permissionKeys.filter((k) => !entitled.has(k));
    if (invalid.length > 0) {
      throw AppError.badRequest(
        `Your tenant isn't entitled to: ${invalid.join(', ')}`,
      );
    }
  }

  async createRole(
    tenantId: string,
    name: string,
    permissionKeys: string[],
  ): Promise<Role> {
    await this.assertPermissionsEntitled(tenantId, permissionKeys);

    const roleRepo = AppDataSource.getRepository(Role);
    const role = await roleRepo.save(
      roleRepo.create({ tenantId, name, isSystem: false }),
    );

    const rpRepo = AppDataSource.getRepository(RolePermission);
    if (permissionKeys.length > 0) {
      await rpRepo.save(
        permissionKeys.map((key) =>
          rpRepo.create({ roleId: role.id, permissionKey: key }),
        ),
      );
    }
    return role;
  }

  async updateRole(
    tenantId: string,
    id: string,
    data: { name?: string; permissionKeys?: string[] },
  ): Promise<Role> {
    const repo = AppDataSource.getRepository(Role);
    const role = await repo.findOne({ where: { id, tenantId } });
    if (!role) throw AppError.notFound('Role');

    if (data.name !== undefined) role.name = data.name;
    await repo.save(role);

    if (data.permissionKeys !== undefined) {
      await this.assertPermissionsEntitled(tenantId, data.permissionKeys);
      const rpRepo = AppDataSource.getRepository(RolePermission);
      await rpRepo.delete({ roleId: id });
      if (data.permissionKeys.length > 0) {
        await rpRepo.save(
          data.permissionKeys.map((key) =>
            rpRepo.create({ roleId: id, permissionKey: key }),
          ),
        );
      }
    }
    return role;
  }

  async deleteRole(tenantId: string, id: string): Promise<void> {
    const repo = AppDataSource.getRepository(Role);
    const role = await repo.findOne({ where: { id, tenantId } });
    if (!role) throw AppError.notFound('Role');
    if (role.isSystem) throw AppError.forbidden('Cannot delete a system role');

    await AppDataSource.getRepository(RolePermission).delete({ roleId: id });
    await repo.remove(role);
  }

  async assignUserRole(
    tenantId: string,
    userId: string,
    roleId: string,
  ): Promise<User> {
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId, tenantId } });
    if (!user) throw AppError.notFound('User');
    if (user.role !== UserRole.ADMIN) {
      throw AppError.badRequest('Only admin-type staff can be assigned a role');
    }

    const role = await AppDataSource.getRepository(Role).findOne({
      where: { id: roleId, tenantId },
    });
    if (!role) throw AppError.notFound('Role');

    user.roleId = role.id;
    return userRepo.save(user);
  }

  // Lets a tenant admin provision a new staff account within their own
  // tenant (email+password, like adminLogin — not the OTP flow patients/
  // doctors use) and immediately assign it one of the tenant's own roles.
  async inviteStaff(
    tenantId: string,
    data: {
      email: string;
      fullName: string;
      roleId: string;
      departmentId?: string;
      password?: string;
    },
  ): Promise<{ user: User; inviteLink?: string }> {
    const userRepo = AppDataSource.getRepository(User);
    const existing = await userRepo.findOne({ where: { email: data.email } });
    if (existing) throw AppError.conflict('Email already in use');

    const role = await AppDataSource.getRepository(Role).findOne({
      where: { id: data.roleId, tenantId },
    });
    if (!role) throw AppError.notFound('Role');

    if (data.departmentId) {
      const dept = await AppDataSource.getRepository(Department).findOne({
        where: { id: data.departmentId, tenantId },
      });
      if (!dept) throw AppError.notFound('Department');
    }

    // A password set explicitly activates the account immediately with
    // that password. Leaving it blank creates the account with no password
    // at all (login stays blocked) and issues a one-time invite link
    // instead — the invited person sets their own password by opening it.
    const passwordHash = data.password
      ? await bcrypt.hash(data.password, 12)
      : undefined;
    const user = userRepo.create({
      firebaseUid: `admin_${data.email}`,
      email: data.email,
      fullName: data.fullName,
      passwordHash,
      role: UserRole.ADMIN,
      tenantId,
      roleId: role.id,
      departmentId: data.departmentId,
      isActive: true,
    });
    await userRepo.save(user);

    let inviteLink: string | undefined;
    if (!data.password) {
      const rawToken = await this.authService.createInviteToken(user.id);
      inviteLink = this.authService.buildInviteLink(rawToken);
    }

    return { user, inviteLink };
  }

  // ── Departments — organizational labels for a tenant's own staff ───

  async listDepartments(tenantId: string): Promise<Department[]> {
    return AppDataSource.getRepository(Department).find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }

  async createDepartment(
    tenantId: string,
    data: { name: string; description?: string },
  ): Promise<Department> {
    const repo = AppDataSource.getRepository(Department);
    return repo.save(repo.create({ tenantId, ...data }));
  }

  async updateDepartment(
    tenantId: string,
    id: string,
    data: { name?: string; description?: string },
  ): Promise<Department> {
    const repo = AppDataSource.getRepository(Department);
    const dept = await repo.findOne({ where: { id, tenantId } });
    if (!dept) throw AppError.notFound('Department');
    if (data.name !== undefined) dept.name = data.name;
    if (data.description !== undefined) dept.description = data.description;
    return repo.save(dept);
  }

  async deleteDepartment(tenantId: string, id: string): Promise<void> {
    const repo = AppDataSource.getRepository(Department);
    const dept = await repo.findOne({ where: { id, tenantId } });
    if (!dept) throw AppError.notFound('Department');
    // Clear the label from any staff using it rather than blocking deletion.
    await AppDataSource.getRepository(User).update(
      { departmentId: id, tenantId },
      { departmentId: null },
    );
    await repo.remove(dept);
  }

  async listAvailablePermissions(tenantId: string): Promise<Permission[]> {
    const entitled = await listTenantEntitledKeys(tenantId);
    if (entitled.size === 0) return [];
    return AppDataSource.getRepository(Permission).find({
      where: { key: In([...entitled]) },
      order: { module: 'ASC', key: 'ASC' },
    });
  }

  // ── WhatsApp provider settings — per-tenant Twilio/Meta config ──────
  // Secret fields are never returned in plaintext, only a `has*` boolean
  // indicating whether one is currently set.

  async getWhatsAppConfig(tenantId: string): Promise<{
    provider: WhatsAppProviderType | null;
    usingPlatformDefault: boolean;
    twilioAccountSid?: string;
    twilioFromNumber?: string;
    hasTwilioAuthToken: boolean;
    metaPhoneNumberId?: string;
    metaApiVersion?: string;
    hasMetaAccessToken: boolean;
    hasMetaAppSecret: boolean;
    gupshupSourceNumber?: string;
    gupshupAppName?: string;
    hasGupshupApiKey: boolean;
    hasGupshupWebhookSecret: boolean;
  }> {
    const config = await AppDataSource.getRepository(
      TenantWhatsAppConfig,
    ).findOne({ where: { tenantId } });

    if (!config) {
      // No tenant-specific config yet — this tenant is actually being
      // served by the platform's global env-var-configured provider, so
      // show *that* instead of a blank form (it's what's really in effect).
      return {
        provider:
          env.WHATSAPP_PROVIDER === 'meta'
            ? WhatsAppProviderType.META
            : WhatsAppProviderType.TWILIO,
        usingPlatformDefault: true,
        twilioAccountSid: env.TWILIO_ACCOUNT_SID || undefined,
        twilioFromNumber: env.TWILIO_WHATSAPP_FROM_NUMBER || undefined,
        hasTwilioAuthToken: Boolean(env.TWILIO_AUTH_TOKEN),
        metaPhoneNumberId: env.META_WHATSAPP_PHONE_NUMBER_ID || undefined,
        metaApiVersion: env.META_WHATSAPP_API_VERSION || undefined,
        hasMetaAccessToken: Boolean(env.META_WHATSAPP_ACCESS_TOKEN),
        hasMetaAppSecret: Boolean(env.META_WHATSAPP_APP_SECRET),
        gupshupSourceNumber: env.GUPSHUP_SOURCE_NUMBER || undefined,
        gupshupAppName: env.GUPSHUP_APP_NAME || undefined,
        hasGupshupApiKey: Boolean(env.GUPSHUP_API_KEY),
        hasGupshupWebhookSecret: Boolean(env.GUPSHUP_WEBHOOK_SECRET),
      };
    }

    return {
      provider: config.provider,
      usingPlatformDefault: false,
      twilioAccountSid: config.twilioAccountSid,
      twilioFromNumber: config.twilioFromNumber,
      hasTwilioAuthToken: Boolean(config.twilioAuthToken),
      metaPhoneNumberId: config.metaPhoneNumberId,
      metaApiVersion: config.metaApiVersion,
      hasMetaAccessToken: Boolean(config.metaAccessToken),
      hasMetaAppSecret: Boolean(config.metaAppSecret),
      gupshupSourceNumber: config.gupshupSourceNumber,
      gupshupAppName: config.gupshupAppName,
      hasGupshupApiKey: Boolean(config.gupshupApiKey),
      hasGupshupWebhookSecret: Boolean(config.gupshupWebhookSecret),
    };
  }

  async updateWhatsAppConfig(
    tenantId: string,
    data: {
      provider: WhatsAppProviderType;
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
    },
  ): Promise<{ provider: WhatsAppProviderType }> {
    const repo = AppDataSource.getRepository(TenantWhatsAppConfig);
    let config = await repo.findOne({ where: { tenantId } });
    const isNew = !config;
    if (!config) {
      config = repo.create({ tenantId, provider: data.provider });
    } else {
      config.provider = data.provider;
    }

    if (data.twilioAccountSid !== undefined)
      config.twilioAccountSid = data.twilioAccountSid;
    if (data.twilioFromNumber !== undefined)
      config.twilioFromNumber = data.twilioFromNumber;
    // A blank secret means "keep the existing one" — only overwrite when a
    // real new value is supplied, so the admin doesn't have to re-paste it
    // every time they just want to change the provider or phone number.
    // The first time a tenant creates its own config it must be complete —
    // otherwise the resolver would silently fall back to the platform
    // default with no indication the "save" didn't really take effect.
    if (data.twilioAuthToken) {
      config.twilioAuthToken = encryptSecret(data.twilioAuthToken);
    } else if (isNew && data.provider === WhatsAppProviderType.TWILIO) {
      throw AppError.badRequest('Twilio Auth Token is required');
    }
    if (
      isNew &&
      data.provider === WhatsAppProviderType.TWILIO &&
      (!data.twilioAccountSid || !data.twilioFromNumber)
    ) {
      throw AppError.badRequest(
        'Twilio Account SID and From Number are required',
      );
    }

    if (data.metaPhoneNumberId !== undefined)
      config.metaPhoneNumberId = data.metaPhoneNumberId;
    if (data.metaApiVersion !== undefined)
      config.metaApiVersion = data.metaApiVersion;
    if (data.metaAccessToken) {
      config.metaAccessToken = encryptSecret(data.metaAccessToken);
    } else if (isNew && data.provider === WhatsAppProviderType.META) {
      throw AppError.badRequest('Meta Access Token is required');
    }
    if (data.metaAppSecret) {
      config.metaAppSecret = encryptSecret(data.metaAppSecret);
    } else if (isNew && data.provider === WhatsAppProviderType.META) {
      throw AppError.badRequest('Meta App Secret is required');
    }
    if (
      isNew &&
      data.provider === WhatsAppProviderType.META &&
      !data.metaPhoneNumberId
    ) {
      throw AppError.badRequest('Meta Phone Number ID is required');
    }

    if (data.gupshupSourceNumber !== undefined)
      config.gupshupSourceNumber = data.gupshupSourceNumber;
    if (data.gupshupAppName !== undefined)
      config.gupshupAppName = data.gupshupAppName;
    if (data.gupshupApiKey) {
      config.gupshupApiKey = encryptSecret(data.gupshupApiKey);
    } else if (isNew && data.provider === WhatsAppProviderType.GUPSHUP) {
      throw AppError.badRequest('Gupshup API Key is required');
    }
    if (data.gupshupWebhookSecret) {
      config.gupshupWebhookSecret = encryptSecret(data.gupshupWebhookSecret);
    } else if (isNew && data.provider === WhatsAppProviderType.GUPSHUP) {
      throw AppError.badRequest(
        'A webhook secret is required — Gupshup has no built-in signature verification, so this app-chosen value is what protects your callback URL',
      );
    }
    if (
      isNew &&
      data.provider === WhatsAppProviderType.GUPSHUP &&
      (!data.gupshupSourceNumber || !data.gupshupAppName)
    ) {
      throw AppError.badRequest('Gupshup Source Number and App Name are required');
    }

    const saved = await repo.save(config);
    return { provider: saved.provider };
  }

  // ── Medicine Shops — onboarded pharmacy vendors that quote patient-
  // uploaded prescriptions ────────────────────────────────────────────

  async listMedicineShops(tenantId: string): Promise<MedicineShop[]> {
    return AppDataSource.getRepository(MedicineShop).find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }

  async createMedicineShop(
    tenantId: string,
    data: {
      name: string;
      contactPhone: string;
      contactEmail?: string;
      addressLine1?: string;
      city?: string;
      ownershipType?: MedicineShopOwnershipType;
    },
  ): Promise<MedicineShop> {
    const repo = AppDataSource.getRepository(MedicineShop);
    const shop = await repo.save(repo.create({ tenantId, ...data }));

    // A third-party vendor being onboarded genuinely needs its own real
    // login, invited separately once its actual owner is known. An
    // in-house shop is different — it's the tenant's own pharmacy, so
    // requiring a manual "invite yourself" step before the admin can even
    // open its full view is just friction. Provision that login now.
    // Falls back to a "+shop" alias when contactEmail collides with an
    // existing account (commonly the admin's own email, since the same
    // person usually runs both) — mail still reaches the same inbox.
    if (data.ownershipType === MedicineShopOwnershipType.IN_HOUSE && data.contactEmail) {
      const userRepo = AppDataSource.getRepository(User);
      let loginEmail = data.contactEmail;
      if (await userRepo.findOne({ where: { email: loginEmail } })) {
        const [local, domain] = data.contactEmail.split('@');
        loginEmail = `${local}+shop@${domain}`;
      }
      if (!(await userRepo.findOne({ where: { email: loginEmail } }))) {
        await this.inviteMedicineShopUser(tenantId, shop.id, {
          email: loginEmail,
          fullName: data.name,
        });
      }
    }

    return shop;
  }

  async updateMedicineShop(
    tenantId: string,
    id: string,
    data: Partial<{
      name: string;
      contactPhone: string;
      contactEmail: string;
      addressLine1: string;
      city: string;
      isActive: boolean;
      ownershipType: MedicineShopOwnershipType;
    }>,
  ): Promise<MedicineShop> {
    const repo = AppDataSource.getRepository(MedicineShop);
    const shop = await repo.findOne({ where: { id, tenantId } });
    if (!shop) throw AppError.notFound('Medicine shop');
    Object.assign(shop, data);
    return repo.save(shop);
  }

  async deleteMedicineShop(tenantId: string, id: string): Promise<void> {
    const repo = AppDataSource.getRepository(MedicineShop);
    const shop = await repo.findOne({ where: { id, tenantId } });
    if (!shop) throw AppError.notFound('Medicine shop');
    // Unlink any shop-user account rather than leaving a dangling shopId.
    await AppDataSource.getRepository(User).update(
      { shopId: id, tenantId },
      { shopId: null, isActive: false },
    );
    await repo.remove(shop);
  }

  // Provisions the shop's own portal login — same invite-link mechanism
  // already used for staff (createInviteToken/buildInviteLink), just with
  // role=shop and shopId set instead of roleId.
  async inviteMedicineShopUser(
    tenantId: string,
    shopId: string,
    data: { email: string; fullName: string; password?: string },
  ): Promise<{ user: User; inviteLink?: string }> {
    const shop = await AppDataSource.getRepository(MedicineShop).findOne({
      where: { id: shopId, tenantId },
    });
    if (!shop) throw AppError.notFound('Medicine shop');

    const userRepo = AppDataSource.getRepository(User);
    const existing = await userRepo.findOne({ where: { email: data.email } });
    if (existing) throw AppError.conflict('Email already in use');

    const passwordHash = data.password
      ? await bcrypt.hash(data.password, 12)
      : undefined;
    const user = userRepo.create({
      firebaseUid: `shop_${data.email}`,
      email: data.email,
      fullName: data.fullName,
      passwordHash,
      role: UserRole.SHOP,
      tenantId,
      shopId: shop.id,
      isActive: true,
    });
    await userRepo.save(user);

    let inviteLink: string | undefined;
    if (!data.password) {
      const rawToken = await this.authService.createInviteToken(user.id);
      inviteLink = this.authService.buildInviteLink(rawToken);
    }
    return { user, inviteLink };
  }

  // Issues a real session for a shop's own login, letting a tenant admin
  // jump straight into that shop's full portal view (dashboard, full
  // inventory tools) without needing that shop's credentials. The caller
  // is responsible for keeping this out of the admin's own localStorage
  // session (see the frontend's quick-view-in-a-new-tab flow) — this just
  // issues tokens, same as any other login.
  async impersonateShop(
    tenantId: string,
    shopId: string,
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const shop = await AppDataSource.getRepository(MedicineShop).findOne({
      where: { id: shopId, tenantId },
    });
    if (!shop) throw AppError.notFound('Medicine shop');

    const user = await AppDataSource.getRepository(User).findOne({
      where: { shopId, tenantId, role: UserRole.SHOP },
    });
    if (!user) {
      throw AppError.notFound('This shop has no login yet — invite one first');
    }

    const { accessToken, refreshToken } =
      await this.authService.issueTokens(user);
    return { user, accessToken, refreshToken };
  }

  // Read/edit access to a shop's own price catalog — gated by the same
  // medicine_shops.view/.manage permissions as the rest of this section,
  // no separate permission needed. Lets a tenant admin who's on the phone
  // with a shop enter their standing prices on the shop's behalf, same
  // precedent as recordManualShopQuote for one-off quotes.
  private async assertShopInTenant(
    tenantId: string,
    shopId: string,
  ): Promise<MedicineShop> {
    const shop = await AppDataSource.getRepository(MedicineShop).findOne({
      where: { id: shopId, tenantId },
    });
    if (!shop) throw AppError.notFound('Medicine shop');
    return shop;
  }

  async listShopCatalog(
    tenantId: string,
    shopId: string,
  ): Promise<MedicineShopCatalogItem[]> {
    await this.assertShopInTenant(tenantId, shopId);
    return AppDataSource.getRepository(MedicineShopCatalogItem).find({
      where: { shopId },
      order: { name: 'ASC' },
    });
  }

  async createShopCatalogItem(
    tenantId: string,
    shopId: string,
    data: CatalogItemInput & { name: string; priceCents: number },
  ): Promise<MedicineShopCatalogItem> {
    await this.assertShopInTenant(tenantId, shopId);
    const repo = AppDataSource.getRepository(MedicineShopCatalogItem);
    const item = repo.create({
      shopId,
      tenantId,
      name: data.name,
      priceCents: data.priceCents,
    });
    applyCatalogFields(item, data);
    return saveCatalogItemWithLedger(item, 0, StockMovementReason.INITIAL);
  }

  async updateShopCatalogItem(
    tenantId: string,
    shopId: string,
    itemId: string,
    data: CatalogItemInput,
  ): Promise<MedicineShopCatalogItem> {
    await this.assertShopInTenant(tenantId, shopId);
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

  async deleteShopCatalogItem(
    tenantId: string,
    shopId: string,
    itemId: string,
  ): Promise<void> {
    await this.assertShopInTenant(tenantId, shopId);
    const repo = AppDataSource.getRepository(MedicineShopCatalogItem);
    const item = await repo.findOne({ where: { id: itemId, shopId } });
    if (!item) throw AppError.notFound('Catalog item');
    await repo.remove(item);
  }

  getShopCatalogTemplateCsv(): string {
    return buildCatalogTemplateCsv();
  }

  async bulkUploadShopCatalog(
    tenantId: string,
    shopId: string,
    file: { buffer: Buffer; originalname: string },
  ): Promise<BulkUploadResult> {
    await this.assertShopInTenant(tenantId, shopId);
    const rows = await parseCatalogFile(file.buffer, file.originalname);
    if (rows.length === 0) {
      throw AppError.badRequest(
        'No rows found in this file — check it has a header row and at least one medicine.',
      );
    }
    return bulkUpsertCatalogRows(shopId, tenantId, rows);
  }

  async exportShopCatalogCsv(
    tenantId: string,
    shopId: string,
  ): Promise<string> {
    const items = await this.listShopCatalog(tenantId, shopId);
    return buildCatalogExportCsv(items);
  }

  async getShopStockHistory(
    tenantId: string,
    shopId: string,
    catalogItemId?: string,
  ): Promise<MedicineShopStockMovement[]> {
    await this.assertShopInTenant(tenantId, shopId);
    return listStockMovements(shopId, catalogItemId);
  }

  async listShopCatalogItemBatches(
    tenantId: string,
    shopId: string,
    itemId: string,
  ): Promise<MedicineShopCatalogItemBatch[]> {
    await this.assertShopInTenant(tenantId, shopId);
    return listBatches(shopId, itemId);
  }

  async addShopCatalogItemBatch(
    tenantId: string,
    shopId: string,
    itemId: string,
    data: BatchInput,
  ): Promise<MedicineShopCatalogItemBatch> {
    await this.assertShopInTenant(tenantId, shopId);
    return addBatch(shopId, tenantId, itemId, data);
  }

  async deleteShopCatalogItemBatch(
    tenantId: string,
    shopId: string,
    batchId: string,
  ): Promise<void> {
    await this.assertShopInTenant(tenantId, shopId);
    return deleteBatch(shopId, batchId);
  }

  // ── Prescription upload requests — patient WhatsApp uploads working
  // their way through shop dispatch/quoting to a confirmed order ──────

  private async hydratePatientInfo<T extends { patientId: string }>(
    rows: T[],
  ): Promise<(T & { patient: { fullName?: string; phoneNumber?: string } })[]> {
    const patientIds = [...new Set(rows.map((r) => r.patientId))];
    const patients = patientIds.length
      ? await AppDataSource.getRepository(User).findBy({ id: In(patientIds) })
      : [];
    const byId = new Map(patients.map((p) => [p.id, p]));
    return rows.map((row) => ({
      ...row,
      patient: {
        fullName: byId.get(row.patientId)?.fullName,
        phoneNumber: byId.get(row.patientId)?.phoneNumber,
      },
    }));
  }

  async listPrescriptionRequests(
    tenantId: string,
    status?: PrescriptionUploadStatus,
  ): Promise<
    (PrescriptionUploadRequest & {
      patient: { fullName?: string; phoneNumber?: string };
    })[]
  > {
    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    const requests = await AppDataSource.getRepository(
      PrescriptionUploadRequest,
    ).find({ where, order: { createdAt: 'DESC' } });
    return this.hydratePatientInfo(requests);
  }

  private async hydrateQuoteShopNames(
    quotes: MedicineShopQuote[],
  ): Promise<(MedicineShopQuote & { shopName?: string })[]> {
    const shopIds = [...new Set(quotes.map((q) => q.shopId))];
    const shops = shopIds.length
      ? await AppDataSource.getRepository(MedicineShop).findBy({
          id: In(shopIds),
        })
      : [];
    const shopMap = new Map(shops.map((s) => [s.id, s.name]));
    return quotes.map((q) => ({ ...q, shopName: shopMap.get(q.shopId) }));
  }

  async getPrescriptionRequestDetail(
    tenantId: string,
    id: string,
  ): Promise<{
    request: PrescriptionUploadRequest & {
      patient: { fullName?: string; phoneNumber?: string };
      tenantName?: string;
    };
    quotes: (MedicineShopQuote & { shopName?: string })[];
  }> {
    const request = await AppDataSource.getRepository(
      PrescriptionUploadRequest,
    ).findOne({ where: { id, tenantId } });
    if (!request) throw AppError.notFound('Prescription request');

    // imageUrl is stored as the raw (private) S3 object URL — same
    // convention as avatars/documents elsewhere — resolve a short-lived
    // signed URL on read rather than storing one that would eventually expire.
    const s3Pattern = /\.s3\.[^.]+\.amazonaws\.com\//;
    if (s3Pattern.test(request.imageUrl)) {
      try {
        const key = new URL(request.imageUrl).pathname.slice(1);
        request.imageUrl = await this.storage.getSignedUrl(key, 3600);
      } catch {
        /* keep the raw URL if signing fails */
      }
    }

    const [hydratedRequest] = await this.hydratePatientInfo([request]);
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id: tenantId },
    });
    const quotes = await AppDataSource.getRepository(MedicineShopQuote).find({
      where: { requestId: id },
    });
    return {
      request: { ...hydratedRequest, tenantName: tenant?.name },
      quotes: await this.hydrateQuoteShopNames(quotes),
    };
  }

  async dispatchToShops(
    tenantId: string,
    requestId: string,
    shopIds: string[],
  ): Promise<void> {
    const requestRepo = AppDataSource.getRepository(PrescriptionUploadRequest);
    const request = await requestRepo.findOne({
      where: { id: requestId, tenantId },
    });
    if (!request) throw AppError.notFound('Prescription request');
    if (shopIds.length === 0)
      throw AppError.badRequest('Select at least one shop');

    const shops = await AppDataSource.getRepository(MedicineShop).findBy({
      id: In(shopIds),
      tenantId,
    });
    if (shops.length !== shopIds.length) {
      throw AppError.badRequest('One or more shops were not found');
    }

    const quoteRepo = AppDataSource.getRepository(MedicineShopQuote);
    for (const shop of shops) {
      const quote = await quoteRepo.save(
        quoteRepo.create({
          requestId,
          shopId: shop.id,
          status: MedicineShopQuoteStatus.PENDING,
        }),
      );
      // Best-effort — an unlinked shop (never messaged the bot to open a
      // session) simply won't get the WhatsApp ping; they can still see
      // and respond to the request from their portal regardless.
      await this.whatsAppBot.sendShopQuoteRequest(
        tenantId,
        shop,
        request,
        quote,
      );
    }

    request.status = PrescriptionUploadStatus.DISPATCHED;
    request.dispatchedShopIds = [
      ...new Set([...request.dispatchedShopIds, ...shopIds]),
    ];
    await requestRepo.save(request);
  }

  async listQuotesForRequest(
    tenantId: string,
    requestId: string,
  ): Promise<(MedicineShopQuote & { shopName?: string })[]> {
    const request = await AppDataSource.getRepository(
      PrescriptionUploadRequest,
    ).findOne({ where: { id: requestId, tenantId } });
    if (!request) throw AppError.notFound('Prescription request');
    const quotes = await AppDataSource.getRepository(MedicineShopQuote).find({
      where: { requestId },
    });
    return this.hydrateQuoteShopNames(quotes);
  }

  // Staff enters a price on a shop's behalf (e.g. phoned in) — funnels
  // through the same recordShopQuote path as portal/WhatsApp submissions
  // (including the reactive auto-mode check), just tagged 'manual'.
  async recordManualShopQuote(
    tenantId: string,
    requestId: string,
    quoteId: string,
    data: { totalCents?: number; items?: QuotedMedicineItem[]; note?: string },
  ): Promise<MedicineShopQuote> {
    const request = await AppDataSource.getRepository(
      PrescriptionUploadRequest,
    ).findOne({ where: { id: requestId, tenantId } });
    if (!request) throw AppError.notFound('Prescription request');

    const quote = await recordShopQuote(
      quoteId,
      data,
      QuoteSubmissionChannel.MANUAL,
      (recvTenantId, recvRequest, recvQuote) =>
        this.whatsAppBot.sendPatientReceipt(
          recvTenantId,
          recvRequest,
          recvQuote,
        ),
      this.shopAlerts,
    );
    if (!quote) throw AppError.notFound('Quote');
    return quote;
  }

  async selectQuote(
    tenantId: string,
    requestId: string,
    quoteId: string,
  ): Promise<void> {
    const requestRepo = AppDataSource.getRepository(PrescriptionUploadRequest);
    const request = await requestRepo.findOne({
      where: { id: requestId, tenantId },
    });
    if (!request) throw AppError.notFound('Prescription request');
    if (request.status === PrescriptionUploadStatus.AWAITING_PATIENT_CHOICE) {
      throw AppError.badRequest(
        'The patient is already choosing between quotes — wait for their reply instead of picking one for them',
      );
    }

    const quote = await AppDataSource.getRepository(MedicineShopQuote).findOne({
      where: { id: quoteId, requestId },
    });
    if (!quote) throw AppError.notFound('Quote');
    if (quote.status !== MedicineShopQuoteStatus.SUBMITTED) {
      throw AppError.badRequest(
        'Only a submitted quote can be sent to the patient',
      );
    }

    request.status = PrescriptionUploadStatus.SENT_TO_PATIENT;
    request.chosenQuoteId = quote.id;
    await requestRepo.save(request);

    await markSiblingQuotesNotSelected(requestId, quote.id, this.shopAlerts);
    await this.whatsAppBot.sendPatientReceipt(tenantId, request, quote);
  }

  // Alternative to selectQuote — instead of staff picking one quote for
  // the patient, every submitted quote is sent to them as a WhatsApp list
  // and they pick themselves (see whatsapp-bot.service.ts's
  // sendQuoteChoiceList/handleQuoteChoice). Status becomes
  // AWAITING_PATIENT_CHOICE rather than SENT_TO_PATIENT since no single
  // quote has been chosen yet — that only happens once the patient replies.
  async letPatientChooseQuote(tenantId: string, requestId: string): Promise<void> {
    const requestRepo = AppDataSource.getRepository(PrescriptionUploadRequest);
    const request = await requestRepo.findOne({
      where: { id: requestId, tenantId },
    });
    if (!request) throw AppError.notFound('Prescription request');

    const quotes = await AppDataSource.getRepository(MedicineShopQuote).find({
      where: { requestId, status: MedicineShopQuoteStatus.SUBMITTED },
    });
    if (quotes.length === 0) {
      throw AppError.badRequest('No submitted quotes yet to send to the patient');
    }

    request.status = PrescriptionUploadStatus.AWAITING_PATIENT_CHOICE;
    await requestRepo.save(request);

    await this.whatsAppBot.sendQuoteChoiceList(tenantId, request, quotes);
  }

  async getQuoteReceiptPdf(
    tenantId: string,
    requestId: string,
    quoteId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const request = await AppDataSource.getRepository(
      PrescriptionUploadRequest,
    ).findOne({
      where: { id: requestId, tenantId },
    });
    if (!request) throw AppError.notFound('Prescription request');

    const quote = await AppDataSource.getRepository(MedicineShopQuote).findOne({
      where: { id: quoteId, requestId },
    });
    if (!quote) throw AppError.notFound('Quote');
    if (quote.status !== MedicineShopQuoteStatus.SUBMITTED) {
      throw AppError.badRequest(
        'Only a submitted quote has a receipt to download',
      );
    }

    const [tenant, shop] = await Promise.all([
      AppDataSource.getRepository(Tenant).findOne({ where: { id: tenantId } }),
      AppDataSource.getRepository(MedicineShop).findOne({
        where: { id: quote.shopId },
      }),
    ]);

    const buffer = await buildQuoteReceiptPdf({
      tenantName: tenant?.name ?? 'ZyroHealth',
      shopName: shop?.name,
      requestId: request.id,
      quoteDate: quote.submittedAt,
      items: quote.items,
      totalCents: quote.totalCents,
      submittedVia: quote.submittedVia,
      status: quote.status,
    });

    return { buffer, filename: `quote-${request.id.slice(0, 8)}.pdf` };
  }

  // The winning shop is deliberately NOT told to fulfil an order the
  // moment it's created — the patient hasn't paid yet. This is the manual
  // step a tenant admin takes once they see paymentStatus flip to 'paid':
  // relay "payment's in, please deliver" to the shop over WhatsApp.
  async notifyShopOrderReady(tenantId: string, orderId: string): Promise<MedicineOrder> {
    const orderRepo = AppDataSource.getRepository(MedicineOrder);
    const order = await orderRepo.findOne({ where: { id: orderId, tenantId } });
    if (!order) throw AppError.notFound('Order');
    if (order.paymentStatus !== MedicineOrderPaymentStatus.PAID) {
      throw AppError.badRequest('This order has not been paid for yet');
    }
    if (!order.shopId) {
      throw AppError.badRequest('This order has no pharmacy attached to notify');
    }
    if (order.shopNotifiedAt) return order;

    const shop = await AppDataSource.getRepository(MedicineShop).findOne({
      where: { id: order.shopId },
    });
    if (!shop) throw AppError.notFound('Pharmacy');

    const address = [
      order.deliveryAddressLine1,
      order.deliveryAddressLine2,
      order.deliveryCity,
      order.deliveryState,
      order.deliveryPincode,
    ]
      .filter(Boolean)
      .join(', ');

    await this.shopAlerts.sendShopMessage(
      shop,
      `✅ Payment received for order ${order.id.slice(0, 8)} — please prepare and deliver to:\n${address}\nContact: ${order.deliveryPhone}`,
    );

    order.shopNotifiedAt = new Date();
    return orderRepo.save(order);
  }

  // ── Medicine order auto-mode (per-tenant setting) ───────────────────

  async getMedicineOrderAutoMode(tenantId: string): Promise<boolean> {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id: tenantId },
    });
    if (!tenant) throw AppError.notFound('Tenant');
    return tenant.medicineOrderAutoMode;
  }

  async updateMedicineOrderAutoMode(
    tenantId: string,
    enabled: boolean,
  ): Promise<boolean> {
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { id: tenantId } });
    if (!tenant) throw AppError.notFound('Tenant');
    tenant.medicineOrderAutoMode = enabled;
    await repo.save(tenant);
    return tenant.medicineOrderAutoMode;
  }
}
