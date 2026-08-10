import { injectable, inject } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { Payment, PaymentGateway, PaymentStatus } from '../../entities/Payment';
import { Booking, BookingStatus } from '../../entities/Booking';
import { User } from '../../entities/User';
import {
  IPaymentProvider,
  WebhookEvent,
} from '../../providers/payment/payment.provider.interface';
import { PAYMENT_PROVIDER } from '../../config/container';
import { AppError } from '../../utils/app-error';
import { InitiatePaymentDtoType } from './payments.dto';
import { WhatsAppNotificationService } from '../notifications/whatsapp-notification.service';

@injectable()
export class PaymentsService {
  constructor(
    @inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: IPaymentProvider,
    private readonly whatsapp: WhatsAppNotificationService,
  ) {}

  async initiatePayment(
    patientId: string,
    dto: InitiatePaymentDtoType,
  ): Promise<{ url: string; paymentId: string }> {
    return AppDataSource.transaction(async (manager) => {
      const bookingRepo = manager.getRepository(Booking);
      const paymentRepo = manager.getRepository(Payment);

      const booking = await bookingRepo.findOne({
        where: { id: dto.bookingId, patientId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!booking) throw AppError.notFound('Booking');
      if (booking.status !== BookingStatus.PENDING) {
        throw AppError.unprocessable('Booking is not in a payable state');
      }

      // Idempotency: reuse existing payment record regardless of status
      const existingPayment = await paymentRepo.findOne({
        where: { bookingId: booking.id },
      });

      // If a pending session still works, return its URL directly
      if (
        existingPayment?.paymentMethodId &&
        existingPayment.status === PaymentStatus.PENDING
      ) {
        try {
          const session = await (
            this.paymentProvider as unknown as {
              getCheckoutSession(id: string): Promise<{ url: string }>;
            }
          ).getCheckoutSession(existingPayment.paymentMethodId);
          if (session.url) {
            return { url: session.url, paymentId: existingPayment.id };
          }
        } catch {
          // Session expired — create a fresh one below
        }
      }

      const baseUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3002';
      // Use a timestamp suffix so Stripe doesn't replay an expired session
      const idempotencyKey = `booking-${booking.id}-patient-${patientId}-${Date.now()}`;

      const result = await this.paymentProvider.createCheckoutSession(
        {
          amountCents: booking.consultationFeeCents,
          currency: dto.currency ?? 'inr',
          description: 'Medical Consultation — Full Health',
          metadata: { bookingId: booking.id, patientId },
          successUrl: `${baseUrl}/bookings?success=1&bookingId=${booking.id}`,
          cancelUrl: `${baseUrl}/doctors/${booking.doctorId}?cancelled=1`,
        },
        idempotencyKey,
      );

      // Update the existing record rather than inserting a new one (unique constraint on booking_id)
      if (existingPayment) {
        existingPayment.status = PaymentStatus.PENDING;
        existingPayment.gateway = PaymentGateway.STRIPE;
        existingPayment.amountCents = booking.consultationFeeCents;
        existingPayment.currency = dto.currency ?? 'inr';
        existingPayment.paymentMethodId = result.sessionId;
        existingPayment.paymentIntentId = result.paymentIntentId;
        const saved = await paymentRepo.save(existingPayment);
        return { url: result.url, paymentId: saved.id };
      }

      const payment = paymentRepo.create({
        bookingId: booking.id,
        gateway: PaymentGateway.STRIPE,
        status: PaymentStatus.PENDING,
        amountCents: booking.consultationFeeCents,
        currency: dto.currency ?? 'inr',
        paymentMethodId: result.sessionId,
        paymentIntentId: result.paymentIntentId,
      });
      await paymentRepo.save(payment);

      return { url: result.url, paymentId: payment.id };
    });
  }

  // Kept for any other caller — verifies then delegates to
  // processWebhookEvent. PaymentsController.webhook verifies once itself
  // and calls processWebhookEvent directly so the same parsed event can
  // also be handed to MedicineOrderPaymentsService without re-verifying
  // the signature twice.
  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    const event = this.paymentProvider.verifyWebhook(payload, signature);
    await this.processWebhookEvent(event);
  }

  async processWebhookEvent(event: WebhookEvent): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const bookingRepo = manager.getRepository(Booking);

      const markPaid = async (
        sessionId: string,
        paymentIntentId?: string,
      ): Promise<void> => {
        // Look up by session ID stored in paymentMethodId
        let payment = await paymentRepo.findOne({
          where: { paymentMethodId: sessionId },
        });
        // Fallback: old records stored session ID in paymentIntentId
        if (!payment) {
          payment = await paymentRepo.findOne({
            where: { paymentIntentId: sessionId },
          });
        }
        if (!payment || payment.status === PaymentStatus.SUCCESS) return;

        payment.status = PaymentStatus.SUCCESS;
        payment.paidAt = new Date();
        // Store actual pi_... for future refunds
        if (paymentIntentId) payment.paymentIntentId = paymentIntentId;
        await paymentRepo.save(payment);

        const booking = await bookingRepo.findOne({
          where: { id: payment.bookingId },
        });
        if (booking && booking.status !== BookingStatus.PAID) {
          booking.status = BookingStatus.PAID;
          await bookingRepo.save(booking);

          const patient = await manager.getRepository(User).findOne({
            where: { id: booking.patientId },
          });
          void this.whatsapp.notifyBookingConfirmed(
            booking,
            patient?.phoneNumber,
          );
        }
      };

      const markFailed = async (id: string): Promise<void> => {
        let payment = await paymentRepo.findOne({
          where: { paymentMethodId: id },
        });
        if (!payment)
          payment = await paymentRepo.findOne({
            where: { paymentIntentId: id },
          });
        if (!payment || payment.status !== PaymentStatus.PENDING) return;
        payment.status = PaymentStatus.FAILED;
        await paymentRepo.save(payment);
      };

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data as {
            id?: string;
            payment_status?: string;
            payment_intent?: string;
          };
          if (session.id && session.payment_status === 'paid') {
            await markPaid(
              session.id,
              typeof session.payment_intent === 'string'
                ? session.payment_intent
                : undefined,
            );
          }
          break;
        }
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data as {
            id?: string;
            payment_intent?: string;
          };
          if (session.id)
            await markPaid(
              session.id,
              typeof session.payment_intent === 'string'
                ? session.payment_intent
                : undefined,
            );
          break;
        }
        case 'checkout.session.async_payment_failed': {
          const session = event.data as { id?: string };
          if (session.id) await markFailed(session.id);
          break;
        }
        case 'payment_intent.succeeded': {
          const pi = event.data as { id?: string };
          if (pi.id) await markPaid(pi.id, pi.id);
          break;
        }
        case 'payment_intent.payment_failed': {
          const pi = event.data as { id?: string };
          if (pi.id) await markFailed(pi.id);
          break;
        }
      }
    });
  }

  async getPaymentStatus(bookingId: string, userId: string): Promise<Payment> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: bookingId },
    });
    if (!booking) throw AppError.notFound('Booking');
    if (booking.patientId !== userId && booking.doctorId !== userId) {
      throw AppError.forbidden();
    }

    const payment = await AppDataSource.getRepository(Payment).findOne({
      where: { bookingId },
    });
    if (!payment) throw AppError.notFound('Payment');
    return payment;
  }

  async initiateRefund(bookingId: string, userId: string): Promise<Payment> {
    return AppDataSource.transaction(async (manager) => {
      const bookingRepo = manager.getRepository(Booking);
      const paymentRepo = manager.getRepository(Payment);

      const booking = await bookingRepo.findOne({
        where: { id: bookingId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!booking) throw AppError.notFound('Booking');
      if (booking.patientId !== userId) throw AppError.forbidden();

      const payment = await paymentRepo.findOne({
        where: { bookingId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) throw AppError.notFound('Payment');
      if (payment.status !== PaymentStatus.SUCCESS) {
        throw AppError.unprocessable('Payment is not in a refundable state');
      }
      // Use paymentIntentId (pi_...) for refund; paymentMethodId is the session ID
      const refundRef = payment.paymentIntentId;
      if (!refundRef) {
        throw AppError.unprocessable('No payment reference found for refund');
      }

      const refund = await this.paymentProvider.createRefund(
        refundRef,
        payment.amountCents,
      );

      payment.status = PaymentStatus.REFUNDED;
      payment.refundId = refund.refundId;
      payment.refundAmountCents = refund.amountCents;
      payment.refundedAt = new Date();
      return paymentRepo.save(payment);
    });
  }
}
