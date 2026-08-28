import { injectable, inject } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import {
  WhatsAppSession,
  WhatsAppConversationState,
  WhatsAppMessageEvent,
} from '../../entities/WhatsAppSession';
import { User } from '../../entities/User';
import { MedicineOrder, MedicineOrderPaymentMethod } from '../../entities/MedicineOrder';
import { MedicineShop } from '../../entities/MedicineShop';
import {
  PrescriptionUploadRequest,
  PrescriptionUploadStatus,
} from '../../entities/PrescriptionUploadRequest';
import {
  MedicineShopQuote,
  QuoteSubmissionChannel,
} from '../../entities/MedicineShopQuote';
import { Booking } from '../../entities/Booking';
import { DoctorProfile, ApprovalStatus } from '../../entities/DoctorProfile';
import { WhatsAppFlow } from '../../entities/WhatsAppFlow';
import { InteractiveOption } from '../../providers/whatsapp/whatsapp.provider.interface';
import { IAiProvider, Message } from '../../providers/ai/ai.provider.interface';
import { AI_PROVIDER } from '../../config/container';
import { WhatsAppFlowEngineService } from './whatsapp-flow-engine.service';
import { WhatsAppProviderResolver } from './whatsapp-provider-resolver.service';
import { DoctorsService } from '../doctors/doctors.service';
import { BookingsService } from '../bookings/bookings.service';
import { formatWhatsAppError } from '../../providers/whatsapp/format-whatsapp-error';
import { matchOptionIndex } from './match-option.util';
import {
  recordShopQuote,
  declineShopQuote,
  markSiblingQuotesNotSelected,
} from '../medicine-shops/quote-processing.util';
import { MedicineShopAlertsService } from '../medicine-shops/medicine-shop-alerts.service';
import { createOrderFromQuote as createOrderFromQuoteUtil } from '../medicine-shops/medicine-order.util';
import { MedicineOrderPaymentsService } from '../medicine-order-payments/medicine-order-payments.service';
import { env } from '../../config/env';

const MAIN_MENU_BODY = `Hi! 👋 Welcome to ZyroHealth. How can I help?`;
const MAIN_MENU_OPTIONS: InteractiveOption[] = [
  {
    id: '1',
    title: 'Order/Booking Status',
    description: 'Check your latest order or booking',
  },
  {
    id: '2',
    title: 'Talk to Support',
    description: 'Connect with our support team',
  },
  {
    id: '3',
    title: 'Ask a Question',
    description: 'Chat with our AI assistant',
  },
  { id: '4', title: 'Book a Doctor', description: 'Book a new consultation' },
  // WhatsApp list-message row titles are hard-capped at 24 characters and
  // truncated silently (no ellipsis) past that — the description already
  // carries the "upload a photo" detail, so the title stays short.
  {
    id: '5',
    title: 'Order Medicine',
    description: 'Send a photo of your prescription for a price quote',
  },
];

// Typing any of these always resets to the main menu, even mid-flow — the
// standard "start over" convention users expect from a chat bot.
const GREETING_WORDS = new Set([
  'hi',
  'hello',
  'hey',
  'menu',
  'start',
  'restart',
  'hii',
  'helo',
]);

const HANDOFF_TEXT = `Got it — I've flagged this for our support team, they'll reply here shortly. 🙏`;
const AI_PROMPT_TEXT = `Sure — go ahead and ask your question.`;
const INVALID_CHOICE_TEXT = `Please pick one of the options above (or type "cancel" to stop).`;
const MAX_SLOT_OPTIONS = 6;
const MAX_SLOT_SEARCH_DAYS = 14;

// Appended to every "no ZyroHealth account linked to this number" message
// so it's an actual tappable link rather than a dead end. The Play Store
// line only appears once a real published app is configured
// (PATIENT_PLAYSTORE_URL is blank by default).
function registrationLinksText(): string {
  const lines = [`👉 Sign up here: ${env.PATIENT_WEB_URL}`];
  if (env.PATIENT_PLAYSTORE_URL) {
    lines.push(`📱 Or get the app: ${env.PATIENT_PLAYSTORE_URL}`);
  }
  lines.push(`Use this same phone number, then come back and try again.`);
  return lines.join('\n');
}

interface BookingDoctorOption {
  profileId: string;
  userId: string;
  name: string;
  detail: string;
}

interface BookingSlotOption {
  iso: string;
  label: string;
}

interface BookingDraft {
  specialties?: string[];
  specialty?: string;
  doctorOptions?: BookingDoctorOption[];
  doctorProfileId?: string;
  doctorUserId?: string;
  slotOptions?: BookingSlotOption[];
  scheduledAtIso?: string;
  slotLabel?: string;
  consultationType?: 'video' | 'offline';
}

const BOOKING_STATES = new Set([
  WhatsAppConversationState.BOOKING_SPECIALTY,
  WhatsAppConversationState.BOOKING_DOCTOR,
  WhatsAppConversationState.BOOKING_SLOT,
  WhatsAppConversationState.BOOKING_TYPE,
  WhatsAppConversationState.BOOKING_PAYMENT_METHOD,
]);

@injectable()
export class WhatsAppBotService {
  constructor(
    @inject(AI_PROVIDER) private readonly ai: IAiProvider,
    private readonly providerResolver: WhatsAppProviderResolver,
    private readonly flowEngine: WhatsAppFlowEngineService,
    private readonly doctors: DoctorsService,
    private readonly bookings: BookingsService,
    private readonly shopAlerts: MedicineShopAlertsService,
    private readonly medicineOrderPayments: MedicineOrderPaymentsService,
  ) {}

  async processInboundMessage(
    tenantId: string,
    phone: string,
    text: string,
    media?: { url: string; mimeType: string },
  ): Promise<void> {
    const sessionRepo = AppDataSource.getRepository(WhatsAppSession);
    let session = await sessionRepo.findOne({
      where: { phoneNumber: phone, tenantId },
    });
    const isNewSession = !session;

    if (!session) {
      const user = await AppDataSource.getRepository(User).findOne({
        where: { phoneNumber: phone, tenantId },
      });
      session = sessionRepo.create({
        tenantId,
        phoneNumber: phone,
        userId: user?.id,
        conversationState: WhatsAppConversationState.MAIN_MENU,
        awaitingHuman: false,
        messages: [],
        flowVariables: {},
      });
    }

    this.appendMessage(session, 'user', text, media);

    // A medicine shop's own number — entirely separate from the
    // patient-facing bot below (main menu, AI, booking mean nothing to a
    // shop). Handled first and unconditionally so a shop never falls
    // through into the ordinary flows.
    const shop = await AppDataSource.getRepository(MedicineShop).findOne({
      where: { tenantId, contactPhone: phone },
    });
    if (shop) {
      await this.handleShopMessage(session, shop, text.trim());
      session.lastMessageAt = new Date();
      await sessionRepo.save(session);
      return;
    }

    // Admin is handling this conversation manually — bot stays silent until resumed.
    if (session.awaitingHuman) {
      session.lastMessageAt = new Date();
      await sessionRepo.save(session);
      return;
    }

    // An active flow (built via the visual flow builder) fully replaces the
    // hardcoded menu below while it's on. No active flow -> zero behavior
    // change to the menu/AI bot that was already built and tested.
    const activeFlow = await AppDataSource.getRepository(WhatsAppFlow).findOne({
      where: { isActive: true, tenantId },
    });

    if (activeFlow) {
      if (session.activeFlowId !== activeFlow.id) {
        session.activeFlowId = activeFlow.id;
        session.flowNodeId = null;
        session.flowVariables = {};
      }
      const result = await this.flowEngine.processInbound(
        session,
        text,
        activeFlow,
        media,
      );
      if (result === 'ended') {
        // Flow reached its `end` node this turn — hand back to the main menu
        // immediately instead of leaving the user with silence.
        session.conversationState = WhatsAppConversationState.MAIN_MENU;
        await this.replyMainMenu(session);
      }
      session.lastMessageAt = new Date();
      await sessionRepo.save(session);
      return;
    } else if (session.activeFlowId) {
      // The flow this session was mid-way through got deactivated/deleted —
      // fall back to the hardcoded bot cleanly instead of getting stuck.
      session.activeFlowId = null;
      session.flowNodeId = null;
    }

    const trimmed = text.trim();
    const isGreeting = GREETING_WORDS.has(trimmed.toLowerCase());
    const showMenu =
      isNewSession ||
      isGreeting ||
      session.conversationState === WhatsAppConversationState.CLOSED;

    if (showMenu) {
      // A greeting always resets to the main menu, even mid-flow — clears
      // any in-progress booking draft so there's no stale leftover state.
      if (isGreeting) this.clearBookingDraft(session);
      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      await this.replyMainMenu(session);
    } else if (
      BOOKING_STATES.has(session.conversationState) &&
      trimmed.toLowerCase() === 'cancel'
    ) {
      this.clearBookingDraft(session);
      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      await this.reply(session, `Booking cancelled.`);
      await this.replyMainMenu(session);
    } else if (
      session.conversationState === WhatsAppConversationState.MAIN_MENU &&
      matchOptionIndex(
        trimmed,
        MAIN_MENU_OPTIONS.map((o) => o.title),
      ) !== undefined
    ) {
      const choice = matchOptionIndex(
        trimmed,
        MAIN_MENU_OPTIONS.map((o) => o.title),
      );
      if (choice === 0) {
        await this.reply(session, await this.getStatusSummary(session.userId));
      } else if (choice === 1) {
        session.awaitingHuman = true;
        await this.reply(session, HANDOFF_TEXT);
      } else if (choice === 2) {
        session.conversationState = WhatsAppConversationState.AWAITING_AI;
        await this.reply(session, AI_PROMPT_TEXT);
      } else if (choice === 3) {
        await this.startBookingFlow(session);
      } else {
        await this.startPrescriptionUploadFlow(session);
      }
    } else if (
      session.conversationState === WhatsAppConversationState.BOOKING_SPECIALTY
    ) {
      await this.handleBookingSpecialty(session, trimmed);
    } else if (
      session.conversationState === WhatsAppConversationState.BOOKING_DOCTOR
    ) {
      await this.handleBookingDoctor(session, trimmed);
    } else if (
      session.conversationState === WhatsAppConversationState.BOOKING_SLOT
    ) {
      await this.handleBookingSlot(session, trimmed);
    } else if (
      session.conversationState === WhatsAppConversationState.BOOKING_TYPE
    ) {
      await this.handleBookingType(session, trimmed);
    } else if (
      session.conversationState ===
      WhatsAppConversationState.BOOKING_PAYMENT_METHOD
    ) {
      await this.handleBookingPaymentMethod(session, trimmed);
    } else if (
      session.conversationState ===
      WhatsAppConversationState.AWAITING_PRESCRIPTION_UPLOAD
    ) {
      await this.handlePrescriptionUpload(session, trimmed, media);
    } else if (
      session.conversationState ===
      WhatsAppConversationState.AWAITING_ORDER_CONFIRMATION
    ) {
      await this.handleOrderConfirmation(session, trimmed);
    } else if (
      session.conversationState ===
      WhatsAppConversationState.AWAITING_QUOTE_CHOICE
    ) {
      await this.handleQuoteChoice(session, trimmed);
    } else {
      session.conversationState = WhatsAppConversationState.AWAITING_AI;
      const aiReply = await this.callAi(session);
      await this.reply(session, aiReply);
    }

    session.lastMessageAt = new Date();
    await sessionRepo.save(session);
  }

  // A standalone shop's OWN independent WhatsApp module (see
  // shop-whatsapp-module.util.ts) — entirely separate conversation space
  // from processInboundMessage above. There is no hardcoded menu/AI/
  // booking bot here on purpose: the shop's active flow (built via the
  // same visual flow builder tenants use) is the ONLY thing that can
  // drive this conversation. With no active flow, the number simply
  // doesn't auto-respond yet — that's the shop's own signal to go build
  // one, not a bug.
  async processInboundShopModuleMessage(
    shopId: string,
    tenantId: string,
    phone: string,
    text: string,
    media?: { url: string; mimeType: string },
  ): Promise<void> {
    const sessionRepo = AppDataSource.getRepository(WhatsAppSession);
    let session = await sessionRepo.findOne({ where: { phoneNumber: phone, shopId } });

    if (!session) {
      session = sessionRepo.create({
        tenantId,
        shopId,
        phoneNumber: phone,
        conversationState: WhatsAppConversationState.MAIN_MENU,
        awaitingHuman: false,
        messages: [],
        flowVariables: {},
      });
    }

    this.appendMessage(session, 'user', text, media);

    if (session.awaitingHuman) {
      session.lastMessageAt = new Date();
      await sessionRepo.save(session);
      return;
    }

    const activeFlow = await AppDataSource.getRepository(WhatsAppFlow).findOne({
      where: { isActive: true, shopId },
    });

    if (activeFlow) {
      if (session.activeFlowId !== activeFlow.id) {
        session.activeFlowId = activeFlow.id;
        session.flowNodeId = null;
        session.flowVariables = {};
      }
      const result = await this.flowEngine.processInbound(session, text, activeFlow, media);
      if (result === 'ended') {
        session.activeFlowId = null;
        session.flowNodeId = null;
      }
    } else if (session.activeFlowId) {
      // The flow this session was mid-way through got deactivated/deleted.
      session.activeFlowId = null;
      session.flowNodeId = null;
    }

    session.lastMessageAt = new Date();
    await sessionRepo.save(session);
  }

  // ── Booking conversation ──────────────────────────────────────────

  private getBookingDraft(session: WhatsAppSession): BookingDraft {
    return (session.flowVariables['booking'] as BookingDraft | undefined) ?? {};
  }

  private setBookingDraft(session: WhatsAppSession, draft: BookingDraft): void {
    session.flowVariables = { ...session.flowVariables, booking: draft };
  }

  private clearBookingDraft(session: WhatsAppSession): void {
    const { booking: _removed, ...rest } = session.flowVariables;
    session.flowVariables = rest;
  }

  private async startBookingFlow(session: WhatsAppSession): Promise<void> {
    const profiles = await AppDataSource.getRepository(DoctorProfile)
      .createQueryBuilder('dp')
      .where('dp.tenant_id = :tenantId', { tenantId: session.tenantId })
      .andWhere('dp.approval_status = :status', {
        status: ApprovalStatus.APPROVED,
      })
      .andWhere('dp.is_available = true')
      .getMany();

    const specialties = [
      ...new Set(
        profiles.map((p) => p.specialty).filter((s): s is string => Boolean(s)),
      ),
    ].sort();

    if (specialties.length === 0) {
      await this.reply(
        session,
        `Sorry, no doctors are available for booking right now. Please try again later.`,
      );
      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      return;
    }

    this.setBookingDraft(session, { specialties });
    session.conversationState = WhatsAppConversationState.BOOKING_SPECIALTY;
    await this.replyInteractive(
      session,
      `Let's book a consultation 🩺\n\nWhich specialty do you need?`,
      specialties.map((s, i) => ({ id: String(i + 1), title: s })),
      'Select',
    );
  }

  private async handleBookingSpecialty(
    session: WhatsAppSession,
    trimmed: string,
  ): Promise<void> {
    const draft = this.getBookingDraft(session);
    const idx = draft.specialties
      ? matchOptionIndex(trimmed, draft.specialties)
      : undefined;
    const specialty = idx !== undefined ? draft.specialties?.[idx] : undefined;
    if (!specialty) {
      await this.reply(session, INVALID_CHOICE_TEXT);
      return;
    }

    const profiles = await AppDataSource.getRepository(DoctorProfile)
      .createQueryBuilder('dp')
      .leftJoinAndSelect('dp.user', 'user')
      .where('dp.tenant_id = :tenantId', { tenantId: session.tenantId })
      .andWhere('dp.approval_status = :status', {
        status: ApprovalStatus.APPROVED,
      })
      .andWhere('dp.is_available = true')
      .andWhere('dp.specialty = :specialty', { specialty })
      .getMany();

    if (profiles.length === 0) {
      await this.reply(
        session,
        `No doctors found for that specialty right now. Please pick a different number.`,
      );
      return;
    }

    const doctorOptions: BookingDoctorOption[] = profiles.map((p) => ({
      profileId: p.id,
      userId: p.userId,
      name: p.user?.fullName ?? 'Doctor',
      detail: `₹${Math.round(Number(p.consultationFee ?? 0))} · ${p.yearsOfExperience ?? 0}yrs experience`,
    }));

    this.setBookingDraft(session, { ...draft, specialty, doctorOptions });
    session.conversationState = WhatsAppConversationState.BOOKING_DOCTOR;
    await this.replyInteractive(
      session,
      `Doctors available for ${specialty}:`,
      doctorOptions.map((d, i) => ({
        id: String(i + 1),
        title: d.name,
        description: d.detail,
      })),
      'Select',
    );
  }

  private async handleBookingDoctor(
    session: WhatsAppSession,
    trimmed: string,
  ): Promise<void> {
    const draft = this.getBookingDraft(session);
    const idx = draft.doctorOptions
      ? matchOptionIndex(
          trimmed,
          draft.doctorOptions.map((d) => d.name),
        )
      : undefined;
    const doctor = idx !== undefined ? draft.doctorOptions?.[idx] : undefined;
    if (!doctor) {
      await this.reply(session, INVALID_CHOICE_TEXT);
      return;
    }

    const slotOptions = await this.findUpcomingSlots(
      session.tenantId!,
      doctor.profileId,
    );
    if (slotOptions.length === 0) {
      await this.reply(
        session,
        `No upcoming slots found for this doctor in the next ${MAX_SLOT_SEARCH_DAYS} days. Please pick a different doctor.`,
      );
      return;
    }

    this.setBookingDraft(session, {
      ...draft,
      doctorProfileId: doctor.profileId,
      doctorUserId: doctor.userId,
      slotOptions,
    });
    session.conversationState = WhatsAppConversationState.BOOKING_SLOT;
    await this.replyInteractive(
      session,
      `Available slots with ${doctor.name}:`,
      slotOptions.map((s, i) => ({ id: String(i + 1), title: s.label })),
      'Select',
    );
  }

  private async findUpcomingSlots(
    tenantId: string,
    doctorProfileId: string,
  ): Promise<BookingSlotOption[]> {
    const slotOptions: BookingSlotOption[] = [];
    const now = Date.now();

    for (
      let dayOffset = 0;
      dayOffset < MAX_SLOT_SEARCH_DAYS && slotOptions.length < MAX_SLOT_OPTIONS;
      dayOffset++
    ) {
      const date = new Date();
      date.setDate(date.getDate() + dayOffset);

      const slots = await this.doctors.getAvailableSlots(
        tenantId,
        doctorProfileId,
        date,
      );
      for (const slot of slots) {
        if (!slot.available) continue;
        const [h, m] = slot.startTime.split(':').map(Number);
        const slotDate = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          h ?? 0,
          m ?? 0,
        );
        if (slotDate.getTime() <= now) continue;

        slotOptions.push({
          iso: slotDate.toISOString(),
          label: `${slotDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}, ${slot.startTime}`,
        });
        if (slotOptions.length >= MAX_SLOT_OPTIONS) break;
      }
    }

    return slotOptions;
  }

  private async handleBookingSlot(
    session: WhatsAppSession,
    trimmed: string,
  ): Promise<void> {
    const draft = this.getBookingDraft(session);
    const idx = draft.slotOptions
      ? matchOptionIndex(
          trimmed,
          draft.slotOptions.map((s) => s.label),
        )
      : undefined;
    const slot = idx !== undefined ? draft.slotOptions?.[idx] : undefined;
    if (!slot) {
      await this.reply(session, INVALID_CHOICE_TEXT);
      return;
    }

    this.setBookingDraft(session, {
      ...draft,
      scheduledAtIso: slot.iso,
      slotLabel: slot.label,
    });
    session.conversationState = WhatsAppConversationState.BOOKING_TYPE;
    await this.replyInteractive(
      session,
      `Got it — ${slot.label}.\n\nHow would you like to consult?`,
      [
        { id: '1', title: 'Video Call' },
        { id: '2', title: 'In-Person Visit' },
      ],
    );
  }

  private async handleBookingType(
    session: WhatsAppSession,
    trimmed: string,
  ): Promise<void> {
    const draft = this.getBookingDraft(session);
    const typeIdx = matchOptionIndex(trimmed, [
      'Video Call',
      'In-Person Visit',
    ]);
    const consultationType =
      typeIdx === 0 ? 'video' : typeIdx === 1 ? 'offline' : undefined;

    if (!consultationType || !draft.doctorProfileId || !draft.scheduledAtIso) {
      await this.reply(session, INVALID_CHOICE_TEXT);
      return;
    }

    this.setBookingDraft(session, { ...draft, consultationType });
    session.conversationState =
      WhatsAppConversationState.BOOKING_PAYMENT_METHOD;
    await this.replyInteractive(session, `How would you like to pay?`, [
      {
        id: '1',
        title: 'Pay Online',
        description: 'Get a secure payment link now',
      },
      {
        id: '2',
        title: 'Pay Offline',
        description: 'Pay at the clinic during your visit',
      },
    ]);
  }

  private async handleBookingPaymentMethod(
    session: WhatsAppSession,
    trimmed: string,
  ): Promise<void> {
    const draft = this.getBookingDraft(session);
    const payIdx = matchOptionIndex(trimmed, ['Pay Online', 'Pay Offline']);
    const payOnline = payIdx === 0 ? true : payIdx === 1 ? false : undefined;

    if (
      payOnline === undefined ||
      !draft.doctorProfileId ||
      !draft.scheduledAtIso ||
      !draft.consultationType
    ) {
      await this.reply(session, INVALID_CHOICE_TEXT);
      return;
    }

    if (!session.userId) {
      await this.reply(
        session,
        `I couldn't find a ZyroHealth account linked to this number, so I can't complete the booking.\n\n${registrationLinksText()}`,
      );
      this.clearBookingDraft(session);
      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      return;
    }

    try {
      const booking = await this.bookings.createBooking(
        session.userId,
        {
          doctorId: draft.doctorProfileId,
          scheduledAt: draft.scheduledAtIso,
          consultationType: draft.consultationType,
        },
        { skipPaymentLink: !payOnline },
      );
      const doctorName = draft.doctorOptions?.find(
        (d) => d.profileId === draft.doctorProfileId,
      )?.name;
      const withDoctor = doctorName ? ` with ${doctorName}` : '';
      const tokenLine = booking.tokenNumber
        ? `\nYour token number today: *#${booking.tokenNumber}*`
        : '';
      await this.reply(
        session,
        (payOnline
          ? `✅ Booking confirmed for ${draft.slotLabel}${withDoctor}! Check the message above for your payment link to secure it.`
          : `✅ Booking confirmed for ${draft.slotLabel}${withDoctor}! You can pay at the clinic during your visit.`) +
          tokenLine,
      );
    } catch (err) {
      await this.reply(
        session,
        `Sorry, I couldn't complete that booking (${err instanceof Error ? err.message : 'please try again'}). Reply "4" from the main menu to start over.`,
      );
    }

    this.clearBookingDraft(session);
    session.conversationState = WhatsAppConversationState.MAIN_MENU;
  }

  // ── Prescription upload → medicine shop quoting ───────────────────

  private async startPrescriptionUploadFlow(
    session: WhatsAppSession,
  ): Promise<void> {
    session.conversationState =
      WhatsAppConversationState.AWAITING_PRESCRIPTION_UPLOAD;
    await this.reply(
      session,
      `📋 Please send a clear photo of your prescription and we'll get you a price quote shortly.\n\n(Type "cancel" to go back to the menu.)`,
    );
  }

  private async handlePrescriptionUpload(
    session: WhatsAppSession,
    trimmed: string,
    media?: { url: string; mimeType: string },
  ): Promise<void> {
    if (trimmed.toLowerCase() === 'cancel') {
      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      await this.reply(session, `Cancelled.`);
      await this.replyMainMenu(session);
      return;
    }

    if (!media) {
      await this.reply(
        session,
        `I need an actual photo of your prescription — please attach it as an image (not just text).`,
      );
      return;
    }

    if (!session.userId) {
      await this.reply(
        session,
        `I couldn't find a ZyroHealth account linked to this number, so I can't process this.\n\n${registrationLinksText()}`,
      );
      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      return;
    }

    const requestRepo = AppDataSource.getRepository(PrescriptionUploadRequest);
    const request = requestRepo.create({
      tenantId: session.tenantId!,
      patientId: session.userId,
      whatsappSessionId: session.id,
      imageUrl: media.url,
      status: PrescriptionUploadStatus.PENDING_DISPATCH,
    });
    await requestRepo.save(request);

    session.conversationState = WhatsAppConversationState.MAIN_MENU;
    await this.reply(
      session,
      `Got it! 📸 We've received your prescription and our team will get you a price quote shortly. We'll message you here once it's ready.`,
    );
  }

  // Called by admin.service.ts once a quote (portal or WhatsApp-submitted)
  // has been chosen to send to the patient — sets their session up to
  // receive a plain "yes"/"cancel" reply next.
  async sendPatientReceipt(
    tenantId: string,
    request: PrescriptionUploadRequest,
    quote: MedicineShopQuote,
  ): Promise<void> {
    const patient = await AppDataSource.getRepository(User).findOne({
      where: { id: request.patientId },
    });
    if (!patient?.phoneNumber) return;

    const sessionRepo = AppDataSource.getRepository(WhatsAppSession);
    let session = await sessionRepo.findOne({
      where: { phoneNumber: patient.phoneNumber, tenantId },
    });
    if (!session) {
      session = sessionRepo.create({
        tenantId,
        phoneNumber: patient.phoneNumber,
        userId: patient.id,
        conversationState: WhatsAppConversationState.MAIN_MENU,
        awaitingHuman: false,
        messages: [],
        flowVariables: {},
      });
    }

    session.conversationState =
      WhatsAppConversationState.AWAITING_ORDER_CONFIRMATION;
    session.flowVariables = {
      ...session.flowVariables,
      pendingOrderRequestId: request.id,
      awaitingDeliveryAddress: undefined,
    };

    const itemLines = quote.items?.length
      ? quote.items
          .map(
            (i) =>
              `- ${i.name}${i.quantity ? ` x${i.quantity}` : ''}${i.priceCents != null ? ` — ₹${(i.priceCents / 100).toFixed(2)}` : ''}`,
          )
          .join('\n')
      : '';
    const total =
      quote.totalCents != null ? (quote.totalCents / 100).toFixed(2) : '0.00';
    const text =
      `🧾 Your prescription quote is ready!\n\n` +
      (itemLines ? `${itemLines}\n\n` : '') +
      `Total: ₹${total}\n\n` +
      `Reply "yes" to confirm this order, or "cancel" to drop it.`;

    this.appendMessage(session, 'assistant', text);
    try {
      const provider = await this.providerResolver.resolve(tenantId);
      await provider.sendText(patient.phoneNumber, text);
    } catch (err) {
      console.error(
        `[WhatsAppBot] Failed to send patient receipt: ${formatWhatsAppError(err)}`,
      );
    }
    session.lastMessageAt = new Date();
    await sessionRepo.save(session);
  }

  // Alternative to sendPatientReceipt — instead of staff/auto-mode picking
  // one quote, every submitted quote is offered to the patient as a
  // numbered WhatsApp list (shop name + price) and they pick themselves.
  // Stores the ordered quote-id list in flowVariables so the numeric
  // reply (handled by handleQuoteChoice) can be resolved back to a real
  // quote without a second DB round-trip on every keystroke.
  async sendQuoteChoiceList(
    tenantId: string,
    request: PrescriptionUploadRequest,
    quotes: MedicineShopQuote[],
  ): Promise<void> {
    const patient = await AppDataSource.getRepository(User).findOne({
      where: { id: request.patientId },
    });
    if (!patient?.phoneNumber) return;

    const shopRepo = AppDataSource.getRepository(MedicineShop);
    const options: InteractiveOption[] = [];
    for (const [index, quote] of quotes.entries()) {
      const shop = await shopRepo.findOne({ where: { id: quote.shopId } });
      const price = quote.totalCents != null ? `₹${(quote.totalCents / 100).toFixed(2)}` : 'Price on request';
      // id is a stringified 1-based index, NOT the quote's real id — same
      // convention as MAIN_MENU_OPTIONS, since a tapped list item echoes
      // back its `id` as the message body, and matchOptionIndex only
      // resolves a plain 1..N number or exact title text, not a UUID.
      // The real quote id lives in flowVariables.quoteChoiceIds instead.
      options.push({
        id: String(index + 1),
        title: shop?.name ?? 'Pharmacy',
        description: price,
      });
    }
    if (options.length === 0) return;

    const sessionRepo = AppDataSource.getRepository(WhatsAppSession);
    let session = await sessionRepo.findOne({
      where: { phoneNumber: patient.phoneNumber, tenantId },
    });
    if (!session) {
      session = sessionRepo.create({
        tenantId,
        phoneNumber: patient.phoneNumber,
        userId: patient.id,
        conversationState: WhatsAppConversationState.MAIN_MENU,
        awaitingHuman: false,
        messages: [],
        flowVariables: {},
      });
    }

    session.conversationState = WhatsAppConversationState.AWAITING_QUOTE_CHOICE;
    session.flowVariables = {
      ...session.flowVariables,
      pendingQuoteChoiceRequestId: request.id,
      // Real quote ids, positionally matching `options` — resolved by
      // handleQuoteChoice from matchOptionIndex's 0-based result.
      quoteChoiceIds: quotes.map((q) => q.id),
      quoteChoiceTitles: options.map((o) => o.title),
    };

    // replyInteractive only appends to session.messages in memory and
    // sends the WhatsApp message — it does NOT persist the session (the
    // callers inside processInboundMessage's dispatch chain share one
    // trailing save; this is a staff-triggered action with no such
    // wrapper, so the save has to happen here, AFTER the append).
    await this.replyInteractive(
      session,
      `💊 You've got ${options.length} quote${options.length > 1 ? 's' : ''} for your prescription — reply with a number to choose:`,
      options,
      'View Quotes',
    );
    session.lastMessageAt = new Date();
    await sessionRepo.save(session);
  }

  // Thin wrapper — the real logic lives in medicine-order.util.ts's
  // createOrderFromQuote (plain function) so the flow engine's app-channel
  // executeOrderPayment node can create the exact same real MedicineOrder,
  // without WhatsAppFlowEngineService needing to depend on WhatsAppBotService
  // (which would be circular — this service already depends on the engine).
  private async createOrderFromQuote(
    session: WhatsAppSession,
    request: PrescriptionUploadRequest,
    quote: MedicineShopQuote,
    deliveryAddress: string,
  ): Promise<MedicineOrder> {
    return createOrderFromQuoteUtil({
      request,
      quote,
      deliveryAddress,
      deliveryPhone: session.phoneNumber,
      sourceNote: 'Created from a WhatsApp prescription-upload quote',
      shopAlerts: this.shopAlerts,
      // This legacy hardcoded-state-machine path has never offered a
      // choice — it always went straight to Stripe checkout.
      paymentMethod: MedicineOrderPaymentMethod.ONLINE,
    });
  }

  private async handleOrderConfirmation(
    session: WhatsAppSession,
    trimmed: string,
  ): Promise<void> {
    const requestId = session.flowVariables['pendingOrderRequestId'] as
      | string
      | undefined;
    const awaitingAddress =
      session.flowVariables['awaitingDeliveryAddress'] === true;

    const requestRepo = AppDataSource.getRepository(PrescriptionUploadRequest);
    const request = requestId
      ? await requestRepo.findOne({ where: { id: requestId } })
      : null;

    if (!request) {
      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      session.flowVariables = {
        ...session.flowVariables,
        pendingOrderRequestId: undefined,
        awaitingDeliveryAddress: undefined,
      };
      await this.reply(
        session,
        `Sorry, I lost track of that order request. Please contact support.`,
      );
      return;
    }

    if (awaitingAddress) {
      if (!trimmed) {
        await this.reply(
          session,
          `Please reply with your full delivery address.`,
        );
        return;
      }
      const quote = request.chosenQuoteId
        ? await AppDataSource.getRepository(MedicineShopQuote).findOne({
            where: { id: request.chosenQuoteId },
          })
        : null;
      if (!quote) {
        await this.reply(
          session,
          `Something went wrong finding your quote — please contact support.`,
        );
        session.conversationState = WhatsAppConversationState.MAIN_MENU;
        return;
      }

      const order = await this.createOrderFromQuote(
        session,
        request,
        quote,
        trimmed,
      );
      request.status = PrescriptionUploadStatus.CONFIRMED;
      request.resultingOrderId = order.id;
      await requestRepo.save(request);

      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      session.flowVariables = {
        ...session.flowVariables,
        pendingOrderRequestId: undefined,
        awaitingDeliveryAddress: undefined,
      };

      // The order exists but isn't real until it's paid for — a link is
      // sent instead of "order confirmed", and the shop is only told to
      // fulfil it once the payment webhook comes back (see
      // MedicineOrderPaymentsService + AdminService.notifyShopOrderReady).
      try {
        const { url } = await this.medicineOrderPayments.createCheckoutForOrder(order);
        await this.reply(
          session,
          `Almost there! Please pay ₹${(order.totalCents / 100).toFixed(2)} to place this order:\n${url}\n\nWe'll notify the pharmacy the moment payment goes through.`,
        );
      } catch (err) {
        console.error(`[WhatsAppBot] Failed to create checkout session for order ${order.id}: ${formatWhatsAppError(err)}`);
        await this.reply(
          session,
          `Your order was saved, but something went wrong creating the payment link. Please contact support to complete payment.`,
        );
      }
      return;
    }

    const lower = trimmed.toLowerCase();
    if (lower === 'cancel') {
      request.status = PrescriptionUploadStatus.CANCELLED;
      await requestRepo.save(request);
      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      session.flowVariables = {
        ...session.flowVariables,
        pendingOrderRequestId: undefined,
      };
      await this.reply(session, `Order cancelled.`);

      // Only the shop whose quote was already chosen thinks they might be
      // getting this order — nobody else was ever told anything about it.
      if (request.chosenQuoteId) {
        const chosenQuote = await AppDataSource.getRepository(MedicineShopQuote).findOne({
          where: { id: request.chosenQuoteId },
        });
        const shop = chosenQuote
          ? await AppDataSource.getRepository(MedicineShop).findOne({
              where: { id: chosenQuote.shopId },
            })
          : null;
        if (shop) {
          await this.shopAlerts.sendShopMessage(
            shop,
            `The patient cancelled this order before paying — no need to prepare anything.`,
          );
        }
      }
      return;
    }

    const isYes = ['yes', 'y', 'confirm', 'ok', 'okay'].includes(lower);
    if (!isYes) {
      await this.reply(
        session,
        `Reply "yes" to confirm this order, or "cancel" to drop it.`,
      );
      return;
    }

    session.flowVariables = {
      ...session.flowVariables,
      awaitingDeliveryAddress: true,
    };
    await this.reply(
      session,
      `Great! Please reply with your full delivery address (house/street, city, state, pincode) so we can ship it.`,
    );
  }

  // Resolves the patient's numbered reply (sent via sendQuoteChoiceList)
  // back to a real quote, then funnels straight into
  // handleOrderConfirmation's existing "ask for delivery address"
  // continuation — the patient already actively confirmed by picking a
  // shop, so there's no need for a separate "reply yes" round trip.
  private async handleQuoteChoice(
    session: WhatsAppSession,
    trimmed: string,
  ): Promise<void> {
    const requestId = session.flowVariables['pendingQuoteChoiceRequestId'] as
      | string
      | undefined;
    const quoteIds =
      (session.flowVariables['quoteChoiceIds'] as string[] | undefined) ?? [];
    const quoteTitles =
      (session.flowVariables['quoteChoiceTitles'] as string[] | undefined) ?? [];

    const requestRepo = AppDataSource.getRepository(PrescriptionUploadRequest);
    const request = requestId
      ? await requestRepo.findOne({ where: { id: requestId } })
      : null;

    if (!request || quoteIds.length === 0) {
      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      session.flowVariables = {
        ...session.flowVariables,
        pendingQuoteChoiceRequestId: undefined,
        quoteChoiceIds: undefined,
        quoteChoiceTitles: undefined,
      };
      await this.reply(
        session,
        `Sorry, I lost track of those quotes. Please contact support.`,
      );
      return;
    }

    const index = matchOptionIndex(trimmed, quoteTitles);
    if (index === undefined) {
      await this.reply(
        session,
        `Please reply with a number between 1 and ${quoteIds.length} to pick a pharmacy.`,
      );
      return;
    }

    const quoteId = quoteIds[index];
    const quote = await AppDataSource.getRepository(MedicineShopQuote).findOne({
      where: { id: quoteId },
    });
    if (!quote) {
      await this.reply(
        session,
        `Something went wrong finding that quote — please contact support.`,
      );
      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      return;
    }

    request.status = PrescriptionUploadStatus.SENT_TO_PATIENT;
    request.chosenQuoteId = quote.id;
    await requestRepo.save(request);

    await markSiblingQuotesNotSelected(request.id, quote.id, this.shopAlerts);

    session.conversationState = WhatsAppConversationState.AWAITING_ORDER_CONFIRMATION;
    session.flowVariables = {
      ...session.flowVariables,
      pendingQuoteChoiceRequestId: undefined,
      quoteChoiceIds: undefined,
      quoteChoiceTitles: undefined,
      pendingOrderRequestId: request.id,
      awaitingDeliveryAddress: true,
    };

    const total =
      quote.totalCents != null ? `₹${(quote.totalCents / 100).toFixed(2)}` : 'the quoted price';
    await this.reply(
      session,
      `Got it — ${quoteTitles[index]} for ${total}.\n\nPlease reply with your full delivery address (house/street, city, state, pincode) so we can ship it.`,
    );
  }

  // ── Medicine shop side (a shop's own WhatsApp number) ──────────────

  // Called by admin.service.ts when staff dispatch a request to a linked
  // shop — sends the shop a free-form message (their session is open
  // because they already completed the join handshake below) and puts
  // their session into AWAITING_SHOP_QUOTE so their next reply is parsed
  // as a price. Returns false if the shop hasn't linked yet (no open
  // session to message into without a pre-approved WhatsApp template).
  async sendShopQuoteRequest(
    tenantId: string,
    shop: MedicineShop,
    request: PrescriptionUploadRequest,
    quote: MedicineShopQuote,
  ): Promise<boolean> {
    if (!shop.whatsappLinked) return false;

    const sessionRepo = AppDataSource.getRepository(WhatsAppSession);
    const session = await sessionRepo.findOne({
      where: { phoneNumber: shop.contactPhone, tenantId },
    });
    if (!session) return false;

    session.conversationState = WhatsAppConversationState.AWAITING_SHOP_QUOTE;
    session.flowVariables = {
      ...session.flowVariables,
      pendingQuoteId: quote.id,
    };

    const text =
      `💊 New quote request!\n\n` +
      `Prescription photo: ${request.imageUrl}\n\n` +
      `Reply with your total price in rupees (e.g. "450"), or "decline" if you can't fulfill this.`;
    this.appendMessage(session, 'assistant', text);
    try {
      const provider = await this.providerResolver.resolve(tenantId);
      await provider.sendText(shop.contactPhone, text);
    } catch (err) {
      console.error(
        `[WhatsAppBot] Failed to send shop quote request: ${formatWhatsAppError(err)}`,
      );
    }
    session.lastMessageAt = new Date();
    await sessionRepo.save(session);
    return true;
  }

  private async handleShopMessage(
    session: WhatsAppSession,
    shop: MedicineShop,
    trimmed: string,
  ): Promise<void> {
    if (
      session.conversationState ===
      WhatsAppConversationState.AWAITING_SHOP_QUOTE
    ) {
      await this.handleShopQuoteReply(session, shop, trimmed);
      return;
    }

    // One-time join handshake: the shop's first message opens the 24h
    // WhatsApp session and links it — same mechanism a patient/doctor
    // already uses just by messaging in for the first time. Without this,
    // no quote-request notification could ever reach them (WhatsApp
    // requires a pre-approved template to message a number cold).
    if (!shop.whatsappLinked) {
      shop.whatsappLinked = true;
      shop.whatsappLinkedAt = new Date();
      await AppDataSource.getRepository(MedicineShop).save(shop);

      const shopUser = await AppDataSource.getRepository(User).findOne({
        where: { shopId: shop.id },
      });
      if (shopUser && !session.userId) session.userId = shopUser.id;

      await this.reply(
        session,
        `👋 Hi ${shop.name}! You're now linked to receive prescription quote requests from ZyroHealth over WhatsApp. We'll message you here whenever a new request comes in.`,
      );
      return;
    }

    await this.reply(
      session,
      `Hi ${shop.name} — no quote request is currently waiting on you. We'll message you here as soon as one comes in.`,
    );
  }

  private async handleShopQuoteReply(
    session: WhatsAppSession,
    shop: MedicineShop,
    trimmed: string,
  ): Promise<void> {
    const quoteId = session.flowVariables['pendingQuoteId'] as
      | string
      | undefined;
    const quote = quoteId
      ? await AppDataSource.getRepository(MedicineShopQuote).findOne({
          where: { id: quoteId, shopId: shop.id },
        })
      : null;

    if (!quote) {
      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      await this.reply(
        session,
        `I couldn't find the quote request this refers to — please check the portal.`,
      );
      return;
    }

    const lower = trimmed.toLowerCase();
    if (lower === 'decline' || lower === 'no') {
      await declineShopQuote(quote.id, QuoteSubmissionChannel.WHATSAPP);
      session.conversationState = WhatsAppConversationState.MAIN_MENU;
      session.flowVariables = {
        ...session.flowVariables,
        pendingQuoteId: undefined,
      };
      await this.reply(session, `Got it, marked as declined.`);
      return;
    }

    const amount = parseFloat(trimmed.replace(/[^\d.]/g, ''));
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      await this.reply(
        session,
        `Please reply with just the total price in rupees (e.g. "450"), or "decline" if you can't fulfill this.`,
      );
      return;
    }

    await recordShopQuote(
      quote.id,
      { totalCents: Math.round(amount * 100) },
      QuoteSubmissionChannel.WHATSAPP,
      (recvTenantId, recvRequest, recvQuote) =>
        this.sendPatientReceipt(recvTenantId, recvRequest, recvQuote),
      this.shopAlerts,
    );

    session.conversationState = WhatsAppConversationState.MAIN_MENU;
    session.flowVariables = {
      ...session.flowVariables,
      pendingQuoteId: undefined,
    };
    await this.reply(
      session,
      `✅ Thanks! Your quote of ₹${amount.toFixed(2)} has been recorded.`,
    );
  }

  // ── Status / support / AI ─────────────────────────────────────────

  private async getStatusSummary(userId?: string): Promise<string> {
    if (!userId) {
      return `I couldn't find a ZyroHealth account linked to this number.\n\n${registrationLinksText()}`;
    }

    const [order] = await AppDataSource.getRepository(MedicineOrder).find({
      where: { patientId: userId },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    const [booking] = await AppDataSource.getRepository(Booking).find({
      where: { patientId: userId },
      order: { createdAt: 'DESC' },
      take: 1,
    });

    if (!order && !booking) {
      return `You don't have any medicine orders or bookings yet.`;
    }

    const lines: string[] = [];
    if (order) {
      const label = order.status.replace(/_/g, ' ');
      lines.push(
        `📦 Latest medicine order: *${label}* (${order.items.length} item${order.items.length === 1 ? '' : 's'}, placed ${order.createdAt.toLocaleDateString('en-IN')})`,
      );
    }
    if (booking) {
      lines.push(
        `🩺 Latest booking: *${booking.status}* — scheduled ${booking.scheduledAt.toLocaleString('en-IN')}`,
      );
    }
    return lines.join('\n');
  }

  private async callAi(session: WhatsAppSession): Promise<string> {
    const history: Message[] = session.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const result = await this.ai.chat({
      messages: history,
      systemPrompt:
        `You are the ZyroHealth WhatsApp assistant. Answer briefly and helpfully about the ` +
        `telemedicine platform (doctor bookings, medicine orders, prescriptions) or general ` +
        `health questions. Keep replies short — this is WhatsApp, not a document. If you truly ` +
        `cannot help, say so plainly and suggest they reply "2" to reach a human.`,
      patientContext: {
        bloodGroup: '',
        allergies: [],
        chronicConditions: [],
        history: [],
      },
      sessionId: session.id,
    });
    return result.reply;
  }

  private async replyMainMenu(session: WhatsAppSession): Promise<void> {
    await this.replyInteractive(
      session,
      MAIN_MENU_BODY,
      MAIN_MENU_OPTIONS,
      'Menu',
    );
  }

  private async reply(session: WhatsAppSession, text: string): Promise<void> {
    this.appendMessage(session, 'assistant', text);
    try {
      const provider = await this.providerResolver.resolve(session.tenantId!);
      await provider.sendText(session.phoneNumber, text);
    } catch (err) {
      // A failed send must never break the conversation's own state machine —
      // the reply is already logged above, and processInboundMessage's caller
      // still needs to save the session with its updated state regardless.
      console.error(
        `[WhatsAppBot] sendText failed: ${formatWhatsAppError(err)}`,
      );
    }
  }

  // Sends a real tappable button/list message, and logs a plain-text
  // equivalent in session.messages so the admin session viewer (and the AI's
  // own conversation history) still has something readable.
  private async replyInteractive(
    session: WhatsAppSession,
    body: string,
    options: InteractiveOption[],
    listButtonLabel?: string,
  ): Promise<void> {
    const textLog =
      `${body}\n\n` +
      options
        .map(
          (o) =>
            `${o.id}) ${o.title}${o.description ? ` — ${o.description}` : ''}`,
        )
        .join('\n');
    this.appendMessage(session, 'assistant', textLog);
    try {
      const provider = await this.providerResolver.resolve(session.tenantId!);
      await provider.sendInteractive(
        session.phoneNumber,
        body,
        options,
        listButtonLabel,
      );
    } catch (err) {
      console.error(
        `[WhatsAppBot] sendInteractive failed: ${formatWhatsAppError(err)}`,
      );
    }
  }

  private appendMessage(
    session: WhatsAppSession,
    role: WhatsAppMessageEvent['role'],
    content: string,
    media?: { url: string; mimeType: string },
  ): void {
    session.messages = [
      ...session.messages,
      {
        role,
        content,
        timestamp: new Date().toISOString(),
        mediaUrl: media?.url,
        mimeType: media?.mimeType,
      },
    ];
  }
}
