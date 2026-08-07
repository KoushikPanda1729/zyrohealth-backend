import { injectable } from 'tsyringe';
import { In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AccessToken } from 'livekit-server-sdk';
import { AppDataSource } from '../../config/database';
import {
  Booking,
  BookingStatus,
  ConsultationType,
} from '../../entities/Booking';
import { DoctorProfile } from '../../entities/DoctorProfile';
import { User, UserRole } from '../../entities/User';
import { AiSession } from '../../entities/AiSession';
import {
  PatientHistory,
  HistoryEntryType,
} from '../../entities/PatientHistory';
import { AppError } from '../../utils/app-error';
import { CreateBookingDtoType } from './bookings.dto';
import { env } from '../../config/env';
import { WhatsAppNotificationService } from '../notifications/whatsapp-notification.service';
import { PaymentsService } from '../payments/payments.service';

@injectable()
export class BookingsService {
  constructor(
    private readonly whatsapp: WhatsAppNotificationService,
    private readonly payments: PaymentsService,
  ) {}

  // Creates the Stripe checkout session for a just-created booking and sends
  // it to the patient over WhatsApp, so they can pay straight from the chat
  // without needing to open the app. Failures here must never break booking
  // creation itself — the patient can still pay in-app as a fallback.
  private async sendPaymentLink(
    booking: Booking,
    patientId: string,
    phone?: string,
  ): Promise<void> {
    if (!phone || booking.consultationFeeCents <= 0) return;
    try {
      const { url } = await this.payments.initiatePayment(patientId, {
        bookingId: booking.id,
        currency: 'inr',
      });
      void this.whatsapp.notifyPaymentLink(booking, phone, url);
    } catch (err) {
      console.error(
        '[Bookings] Failed to create/send WhatsApp payment link:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  async createBooking(
    patientId: string,
    dto: CreateBookingDtoType,
    // Internal-only — not part of the public API DTO/validation, so a
    // caller can't skip payment by passing this over the REST endpoint.
    // Only the WhatsApp bot sets this, after the patient explicitly chooses
    // to pay offline (e.g. at the clinic).
    options: { skipPaymentLink?: boolean } = {},
  ): Promise<Booking> {
    const patient = await AppDataSource.getRepository(User).findOne({
      where: { id: patientId },
    });
    if (!patient?.tenantId) throw AppError.notFound('Patient');
    const tenantId = patient.tenantId;

    // Accept either profile ID or user ID for doctorId — always scoped to
    // the patient's own tenant, so a patient can never book a doctor that
    // belongs to a different tenant even if they know/guess the ID.
    let doctorProfile = await AppDataSource.getRepository(
      DoctorProfile,
    ).findOne({
      where: { id: dto.doctorId, tenantId },
    });
    if (!doctorProfile) {
      doctorProfile = await AppDataSource.getRepository(DoctorProfile).findOne({
        where: { userId: dto.doctorId, tenantId },
      });
    }
    if (!doctorProfile) throw AppError.notFound('Doctor');

    const doctorUserId = doctorProfile.userId;
    const scheduledAt = new Date(dto.scheduledAt);

    // Prevent duplicate active bookings with the same doctor
    const activeBooking = await AppDataSource.getRepository(Booking).findOne({
      where: {
        patientId,
        doctorId: doctorUserId,
        status: In([
          BookingStatus.PENDING,
          BookingStatus.PAID,
          BookingStatus.ACTIVE,
        ]),
      },
    });
    if (activeBooking) {
      throw AppError.conflict(
        'You already have an active booking with this doctor. Complete or cancel it before booking again.',
      );
    }

    const conflictBooking = await AppDataSource.getRepository(Booking).findOne({
      where: {
        doctorId: doctorUserId,
        scheduledAt,
        status: BookingStatus.PAID,
      },
    });
    if (conflictBooking) throw AppError.conflict('This slot is already booked');

    // doctorProfile.consultationFee is stored in rupees (numeric(10,2)); convert to paise for Stripe/consultationFeeCents.
    const feeCents = Math.round(
      Number(doctorProfile.consultationFee ?? 0) * 100,
    );

    let aiSummary: string | undefined;
    if (dto.aiSessionId) {
      const aiSession = await AppDataSource.getRepository(AiSession).findOne({
        where: { id: dto.aiSessionId, userId: patientId },
      });
      if (aiSession) {
        aiSummary = aiSession.aiSummary ?? undefined;
      }
    }

    const booking = AppDataSource.getRepository(Booking).create({
      tenantId,
      patientId,
      doctorId: doctorUserId,
      scheduledAt,
      videoRoomId: uuidv4(),
      consultationFeeCents: feeCents,
      status: BookingStatus.PENDING,
      consultationType: (dto.consultationType ?? 'video') as ConsultationType,
      aiSessionId: dto.aiSessionId,
      aiSummary,
      durationMinutes: 30,
    });

    const saved = await AppDataSource.getRepository(Booking).save(booking);

    void this.whatsapp.notifyBookingCreated(saved, patient.phoneNumber);
    if (!options.skipPaymentLink) {
      void this.sendPaymentLink(saved, patientId, patient.phoneNumber);
    }

    return saved;
  }

  async listBookings(
    userId: string,
    role: string,
    page: number,
    limit: number,
  ): Promise<{ data: Booking[]; total: number }> {
    const repo = AppDataSource.getRepository(Booking);
    const whereClause =
      role === 'doctor' ? { doctorId: userId } : { patientId: userId };

    const [data, total] = await repo.findAndCount({
      where: whereClause,
      order: { scheduledAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['patient', 'doctor', 'payment'],
    });

    return { data, total };
  }

  async getBookingById(id: string, userId: string): Promise<Booking> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id },
      relations: ['patient', 'doctor', 'payment', 'prescription', 'review'],
    });
    if (!booking) throw AppError.notFound('Booking');
    if (booking.patientId !== userId && booking.doctorId !== userId) {
      throw AppError.forbidden();
    }
    return booking;
  }

  async cancelBooking(
    id: string,
    userId: string,
    role: string,
    reason?: string,
  ): Promise<Booking & { refundInitiated: boolean }> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id },
    });
    if (!booking) throw AppError.notFound('Booking');

    const isPatient = booking.patientId === userId;
    const isDoctor = booking.doctorId === userId;

    if (!isPatient && !isDoctor) throw AppError.forbidden();

    if (isPatient && role === 'patient') {
      const now = new Date();
      const scheduledAt = new Date(booking.scheduledAt);
      const diffHours =
        (scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (diffHours < 2) {
        throw AppError.unprocessable(
          'Cannot cancel within 2 hours of appointment',
        );
      }
    }

    if (
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.CANCELLED
    ) {
      throw AppError.unprocessable(`Booking is already ${booking.status}`);
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancelReason = reason;
    booking.cancelledBy = userId;

    const saved = await AppDataSource.getRepository(Booking).save(booking);

    const patient = await AppDataSource.getRepository(User).findOne({
      where: { id: saved.patientId },
    });
    void this.whatsapp.notifyBookingCancelled(saved, patient?.phoneNumber);

    return { ...saved, refundInitiated: false };
  }

  async joinRoom(
    id: string,
    userId: string,
    _role: string,
  ): Promise<{ token: string; url: string; roomName: string }> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id },
    });
    if (!booking) throw AppError.notFound('Booking');

    if (booking.patientId !== userId && booking.doctorId !== userId) {
      throw AppError.forbidden();
    }

    if (![BookingStatus.PAID, BookingStatus.ACTIVE].includes(booking.status)) {
      throw AppError.unprocessable('Booking must be paid before joining');
    }

    const role = booking.patientId === userId ? 'patient' : 'doctor';
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: `${role}-${userId}`,
      name: role,
      ttl: 3600,
    });
    at.addGrant({
      roomJoin: true,
      room: booking.videoRoomId,
      canPublish: true,
      canSubscribe: true,
    });

    return {
      token: await at.toJwt(),
      url: env.LIVEKIT_URL,
      roomName: booking.videoRoomId,
    };
  }

  async completeBooking(id: string, doctorId: string): Promise<Booking> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id },
    });
    if (!booking) throw AppError.notFound('Booking');
    if (booking.doctorId !== doctorId) throw AppError.forbidden();
    if (
      booking.status !== BookingStatus.ACTIVE &&
      booking.status !== BookingStatus.PAID
    ) {
      throw AppError.unprocessable(
        'Booking cannot be completed in its current state',
      );
    }

    booking.status = BookingStatus.COMPLETED;
    booking.completedAt = new Date();
    const saved = await AppDataSource.getRepository(Booking).save(booking);

    // Append to patient history
    const history = AppDataSource.getRepository(PatientHistory).create({
      userId: booking.patientId,
      entryType: HistoryEntryType.CONSULT,
      summary: `Consultation completed with doctor. Booking ID: ${id}`,
      referenceId: id,
      detectedSymptoms: [],
    });
    await AppDataSource.getRepository(PatientHistory).save(history);

    const patient = await AppDataSource.getRepository(User).findOne({
      where: { id: saved.patientId },
    });
    void this.whatsapp.notifyBookingCompleted(saved, patient?.phoneNumber);

    return saved;
  }

  async agentCreateBooking(payload: {
    patientName: string;
    patientPhone: string;
    doctorId: string;
    scheduledAt: string;
  }): Promise<Booking> {
    // Resolve doctor first (accepts user ID or profile ID) — the voice
    // agent is always tied to one specific doctor, so its tenant is the
    // source of truth for the guest patient account created below.
    let doctorProfile = await AppDataSource.getRepository(
      DoctorProfile,
    ).findOne({
      where: { id: payload.doctorId },
    });
    if (!doctorProfile) {
      doctorProfile = await AppDataSource.getRepository(DoctorProfile).findOne({
        where: { userId: payload.doctorId },
      });
    }
    if (!doctorProfile) throw AppError.notFound('Doctor');
    const tenantId = doctorProfile.tenantId;

    const userRepo = AppDataSource.getRepository(User);

    // Find patient by phone number within this tenant, or create a minimal
    // guest account scoped to it.
    let patient = await userRepo.findOne({
      where: { phoneNumber: payload.patientPhone, tenantId },
    });
    if (!patient) {
      patient = userRepo.create({
        firebaseUid: `agent-${tenantId}-${payload.patientPhone.replace(/\D/g, '')}`,
        phoneNumber: payload.patientPhone,
        fullName: payload.patientName,
        role: UserRole.PATIENT,
        isActive: true,
        canCreateAgent: false,
        tenantId,
      });
      await userRepo.save(patient);
    } else if (payload.patientName && !patient.fullName) {
      await userRepo.update(patient.id, { fullName: payload.patientName });
    }

    const scheduledAt = new Date(payload.scheduledAt);
    if (isNaN(scheduledAt.getTime()))
      throw AppError.badRequest('Invalid scheduledAt');

    const conflictBooking = await AppDataSource.getRepository(Booking).findOne({
      where: {
        doctorId: doctorProfile.userId,
        scheduledAt,
        status: BookingStatus.PAID,
      },
    });
    if (conflictBooking) throw AppError.conflict('This slot is already booked');

    const booking = AppDataSource.getRepository(Booking).create({
      tenantId,
      patientId: patient.id,
      doctorId: doctorProfile.userId,
      scheduledAt,
      videoRoomId: uuidv4(),
      consultationFeeCents: 0,
      status: BookingStatus.PENDING,
      consultationType: ConsultationType.OFFLINE,
      durationMinutes: 30,
    });

    const saved = await AppDataSource.getRepository(Booking).save(booking);
    void this.whatsapp.notifyBookingCreated(saved, patient.phoneNumber);

    return saved;
  }
}
