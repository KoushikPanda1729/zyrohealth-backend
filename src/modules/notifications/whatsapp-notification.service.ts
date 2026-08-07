import { injectable } from 'tsyringe';
import { WhatsAppProviderResolver } from '../whatsapp/whatsapp-provider-resolver.service';
import {
  MedicineOrder,
  MedicineOrderStatus,
} from '../../entities/MedicineOrder';
import { Booking } from '../../entities/Booking';
import { formatWhatsAppError } from '../../providers/whatsapp/format-whatsapp-error';

const STATUS_LABELS: Record<MedicineOrderStatus, string> = {
  [MedicineOrderStatus.PLACED]: 'placed',
  [MedicineOrderStatus.CONFIRMED]: 'confirmed',
  [MedicineOrderStatus.PACKED]: 'packed and ready for pickup',
  [MedicineOrderStatus.PICKED_UP]: 'picked up by the courier',
  [MedicineOrderStatus.OUT_FOR_DELIVERY]: 'out for delivery',
  [MedicineOrderStatus.DELIVERED]: 'delivered',
  [MedicineOrderStatus.CANCELLED]: 'cancelled',
};

@injectable()
export class WhatsAppNotificationService {
  constructor(private readonly providerResolver: WhatsAppProviderResolver) {}

  private async safeSend(
    tenantId: string,
    fn: (
      provider: Awaited<ReturnType<WhatsAppProviderResolver['resolve']>>,
    ) => Promise<void>,
  ): Promise<void> {
    try {
      const provider = await this.providerResolver.resolve(tenantId);
      await fn(provider);
    } catch (err) {
      console.error(`[WhatsApp] send failed: ${formatWhatsAppError(err)}`);
    }
  }

  notifyOrderPlaced(order: MedicineOrder, phone?: string): Promise<void> {
    if (!phone) return Promise.resolve();
    return this.safeSend(order.tenantId!, (provider) =>
      provider.sendText(
        phone,
        `Your medicine order (${order.items.length} item${order.items.length === 1 ? '' : 's'}) has been placed. We'll notify you as it progresses.`,
      ),
    );
  }

  notifyOrderStatusChanged(
    order: MedicineOrder,
    phone: string | undefined,
    status: MedicineOrderStatus,
  ): Promise<void> {
    if (!phone) return Promise.resolve();
    return this.safeSend(order.tenantId!, (provider) =>
      provider.sendText(
        phone,
        `Update on your medicine order: it has been ${STATUS_LABELS[status]}.`,
      ),
    );
  }

  notifyBookingCreated(booking: Booking, phone?: string): Promise<void> {
    if (!phone) return Promise.resolve();
    return this.safeSend(booking.tenantId!, (provider) =>
      provider.sendText(
        phone,
        `Your consultation booking has been created for ${booking.scheduledAt.toLocaleString()}. Complete payment to confirm.`,
      ),
    );
  }

  notifyPaymentLink(
    booking: Booking,
    phone: string | undefined,
    checkoutUrl: string,
  ): Promise<void> {
    if (!phone) return Promise.resolve();
    return this.safeSend(booking.tenantId!, (provider) =>
      provider.sendText(
        phone,
        `💳 Pay ₹${(booking.consultationFeeCents / 100).toFixed(2)} to confirm your booking on ${booking.scheduledAt.toLocaleString()}:\n${checkoutUrl}\n\nThis link is valid for a limited time.`,
      ),
    );
  }

  notifyBookingConfirmed(booking: Booking, phone?: string): Promise<void> {
    if (!phone) return Promise.resolve();
    return this.safeSend(booking.tenantId!, (provider) =>
      provider.sendText(
        phone,
        `Your consultation booking on ${booking.scheduledAt.toLocaleString()} is confirmed. See you then!`,
      ),
    );
  }

  notifyBookingCancelled(booking: Booking, phone?: string): Promise<void> {
    if (!phone) return Promise.resolve();
    return this.safeSend(booking.tenantId!, (provider) =>
      provider.sendText(
        phone,
        `Your consultation booking on ${booking.scheduledAt.toLocaleString()} has been cancelled.`,
      ),
    );
  }

  notifyBookingCompleted(booking: Booking, phone?: string): Promise<void> {
    if (!phone) return Promise.resolve();
    return this.safeSend(booking.tenantId!, (provider) =>
      provider.sendText(
        phone,
        `Your consultation is complete. Check your prescriptions for any next steps.`,
      ),
    );
  }

  notifyDoctorApproved(tenantId: string, phone?: string): Promise<void> {
    if (!phone) return Promise.resolve();
    return this.safeSend(tenantId, (provider) =>
      provider.sendText(
        phone,
        `Good news! Your HealthPlus doctor profile has been approved. You're now live and can start accepting consultations.`,
      ),
    );
  }

  notifyDoctorRejected(
    tenantId: string,
    reason: string,
    phone?: string,
  ): Promise<void> {
    if (!phone) return Promise.resolve();
    return this.safeSend(tenantId, (provider) =>
      provider.sendText(
        phone,
        `Your HealthPlus doctor profile application was not approved. Reason: ${reason}. You can update your profile and resubmit.`,
      ),
    );
  }

  // Direct passthrough for admins replying to a WhatsApp session manually
  // (not a canned lifecycle notification like the methods above) — unlike
  // the others, this does NOT swallow errors, so the admin UI can show a
  // real failure instead of silently reporting success.
  async sendRaw(tenantId: string, phone: string, text: string): Promise<void> {
    const provider = await this.providerResolver.resolve(tenantId);
    await provider.sendText(phone, text);
  }

  notifyPrescriptionSent(tenantId: string, phone?: string): Promise<void> {
    if (!phone) return Promise.resolve();
    return this.safeSend(tenantId, (provider) =>
      provider.sendText(
        phone,
        `Your doctor has sent you a new prescription. Open the HealthPlus app to view the details and download the PDF.`,
      ),
    );
  }
}
