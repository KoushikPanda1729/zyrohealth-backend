import { injectable, inject } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import {
  MedicineOrderPayment,
  MedicineOrderPaymentGateway,
  MedicineOrderPaymentStatus,
} from '../../entities/MedicineOrderPayment';
import {
  MedicineOrder,
  MedicineOrderPaymentStatus as OrderPaymentStatus,
} from '../../entities/MedicineOrder';
import {
  MedicineShopPayout,
  MedicineShopPayoutStatus,
} from '../../entities/MedicineShopPayout';
import {
  IPaymentProvider,
  WebhookEvent,
} from '../../providers/payment/payment.provider.interface';
import { PAYMENT_PROVIDER } from '../../config/container';
import {
  buildMedicineOrderRedirectUrls,
  buildMedicineOrderGroupRedirectUrls,
  PaymentRedirectPlatform,
} from '../../utils/payment-redirect.util';

// Mirrors payments.service.ts's shape exactly, but for MedicineOrder instead
// of Booking — can't reuse PaymentsService/Payment since that entity has a
// unique booking_id column. Shares the SAME Stripe account/webhook secret
// (one platform-wide gateway, no per-tenant Connect) — see
// PaymentsController.webhook, which verifies the signature once and hands
// the parsed event to both this service and PaymentsService, each ignoring
// events that aren't theirs.
@injectable()
export class MedicineOrderPaymentsService {
  constructor(
    @inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: IPaymentProvider,
  ) {}

  async createCheckoutForOrder(
    order: MedicineOrder,
    platform: PaymentRedirectPlatform = 'web',
  ): Promise<{ url: string; paymentId: string }> {
    return AppDataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(MedicineOrderPayment);

      // Idempotency: a shop-module retry or a duplicate webhook replay
      // should reuse the existing pending session rather than create a
      // second Stripe Checkout Session for the same order.
      const existing = await paymentRepo.findOne({
        where: { orderId: order.id },
      });
      // Only reuse a cached session if it was built for the same platform
      // — Stripe sessions are immutable, so one created for 'web' still
      // redirects there even if this call now asks for 'app'.
      if (
        existing?.paymentMethodId &&
        existing.status === MedicineOrderPaymentStatus.PENDING &&
        existing.redirectPlatform === platform
      ) {
        try {
          const session = await (
            this.paymentProvider as unknown as {
              getCheckoutSession(id: string): Promise<{ url: string }>;
            }
          ).getCheckoutSession(existing.paymentMethodId);
          if (session.url) return { url: session.url, paymentId: existing.id };
        } catch {
          // Session expired — create a fresh one below
        }
      }

      const idempotencyKey = `medicine-order-${order.id}-${Date.now()}`;
      const { successUrl, cancelUrl } = buildMedicineOrderRedirectUrls(
        platform,
        order,
      );

      const result = await this.paymentProvider.createCheckoutSession(
        {
          amountCents: order.totalCents,
          currency: 'inr',
          description: 'Medicine Order — Full Health',
          metadata: { medicineOrderId: order.id, patientId: order.patientId },
          successUrl,
          cancelUrl,
        },
        idempotencyKey,
      );

      if (existing) {
        existing.status = MedicineOrderPaymentStatus.PENDING;
        existing.gateway = MedicineOrderPaymentGateway.STRIPE;
        existing.amountCents = order.totalCents;
        existing.paymentMethodId = result.sessionId;
        existing.paymentIntentId = result.paymentIntentId;
        existing.redirectPlatform = platform;
        const saved = await paymentRepo.save(existing);
        return { url: result.url, paymentId: saved.id };
      }

      const payment = paymentRepo.create({
        tenantId: order.tenantId,
        orderId: order.id,
        gateway: MedicineOrderPaymentGateway.STRIPE,
        status: MedicineOrderPaymentStatus.PENDING,
        amountCents: order.totalCents,
        currency: 'inr',
        paymentMethodId: result.sessionId,
        paymentIntentId: result.paymentIntentId,
        redirectPlatform: platform,
      });
      await paymentRepo.save(payment);

      return { url: result.url, paymentId: payment.id };
    });
  }

  // A cart spanning several pharmacies (each its own tenant) splits into
  // one MedicineOrder per shop at creation time, but the patient still
  // pays once — this creates a SINGLE Stripe Checkout Session for the
  // combined total and attaches one MedicineOrderPayment row per order
  // (order_id has a unique index, so it can't be one shared row), all
  // pointing at the same Stripe session/intent. The webhook handler below
  // marks every row sharing that session paid together.
  async createCheckoutForOrderGroup(
    orders: MedicineOrder[],
    platform: PaymentRedirectPlatform = 'web',
  ): Promise<{ url: string; paymentId: string }> {
    if (orders.length === 0) {
      throw new Error('createCheckoutForOrderGroup requires at least one order');
    }
    if (orders.length === 1) {
      return this.createCheckoutForOrder(orders[0], platform);
    }

    return AppDataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(MedicineOrderPayment);
      const totalCents = orders.reduce((sum, order) => sum + order.totalCents, 0);
      const orderIds = orders.map((order) => order.id);
      const idempotencyKey = `medicine-order-group-${orderIds.join('-')}-${Date.now()}`;
      const { successUrl, cancelUrl } = buildMedicineOrderGroupRedirectUrls(
        platform,
        orderIds,
      );

      const result = await this.paymentProvider.createCheckoutSession(
        {
          amountCents: totalCents,
          currency: 'inr',
          description: 'Medicine Order — Full Health',
          metadata: {
            medicineOrderIds: orderIds.join(','),
            patientId: orders[0].patientId,
          },
          successUrl,
          cancelUrl,
        },
        idempotencyKey,
      );

      let paymentId = '';
      for (const order of orders) {
        const existing = await paymentRepo.findOne({ where: { orderId: order.id } });
        if (existing) {
          existing.status = MedicineOrderPaymentStatus.PENDING;
          existing.gateway = MedicineOrderPaymentGateway.STRIPE;
          existing.amountCents = order.totalCents;
          existing.paymentMethodId = result.sessionId;
          existing.paymentIntentId = result.paymentIntentId;
          existing.redirectPlatform = platform;
          const saved = await paymentRepo.save(existing);
          paymentId = saved.id;
          continue;
        }
        const payment = paymentRepo.create({
          tenantId: order.tenantId,
          orderId: order.id,
          gateway: MedicineOrderPaymentGateway.STRIPE,
          status: MedicineOrderPaymentStatus.PENDING,
          amountCents: order.totalCents,
          currency: 'inr',
          paymentMethodId: result.sessionId,
          paymentIntentId: result.paymentIntentId,
          redirectPlatform: platform,
        });
        const saved = await paymentRepo.save(payment);
        paymentId = saved.id;
      }

      return { url: result.url, paymentId };
    });
  }

  // Called by PaymentsController.webhook alongside PaymentsService's own
  // handler — no-ops on any event that isn't for a medicine order.
  async processWebhookEvent(event: WebhookEvent): Promise<void> {
    const metadata = (event.data['metadata'] ?? {}) as Record<string, unknown>;
    const medicineOrderId = metadata['medicineOrderId'];
    const medicineOrderIds = metadata['medicineOrderIds'];
    if (typeof medicineOrderId !== 'string' && typeof medicineOrderIds !== 'string') return;

    await AppDataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(MedicineOrderPayment);
      const orderRepo = manager.getRepository(MedicineOrder);
      const payoutRepo = manager.getRepository(MedicineShopPayout);

      // A cart spanning multiple pharmacies pays for several orders with
      // ONE Stripe session (see createCheckoutForOrderGroup) — several
      // MedicineOrderPayment rows share the same paymentMethodId/
      // paymentIntentId (order_id is what's unique, not the session), so
      // this must mark every matching row, not just the first. The
      // single-order case still works identically: `find` just returns
      // one row instead of many.
      const markPaid = async (
        sessionId: string,
        paymentIntentId?: string,
      ): Promise<void> => {
        let payments = await paymentRepo.find({ where: { paymentMethodId: sessionId } });
        if (payments.length === 0) {
          payments = await paymentRepo.find({ where: { paymentIntentId: sessionId } });
        }

        for (const payment of payments) {
          if (payment.status === MedicineOrderPaymentStatus.SUCCESS) continue;

          payment.status = MedicineOrderPaymentStatus.SUCCESS;
          payment.paidAt = new Date();
          if (paymentIntentId) payment.paymentIntentId = paymentIntentId;
          await paymentRepo.save(payment);

          const order = await orderRepo.findOne({ where: { id: payment.orderId } });
          if (!order || order.paymentStatus === OrderPaymentStatus.PAID) continue;

          order.paymentStatus = OrderPaymentStatus.PAID;
          await orderRepo.save(order);

          // Owed to the shop the moment payment clears — no commission/margin
          // logic exists in this codebase, so the shop is owed the full
          // order total. A shop-less order (placed some other way) has no
          // shopId and gets no payout row.
          if (order.shopId) {
            const existingPayout = await payoutRepo.findOne({ where: { orderId: order.id } });
            if (!existingPayout) {
              await payoutRepo.save(
                payoutRepo.create({
                  shopId: order.shopId,
                  orderId: order.id,
                  tenantId: order.tenantId,
                  amountCents: order.totalCents,
                  status: MedicineShopPayoutStatus.OWED,
                }),
              );
            }
          }
        }
      };

      const markFailed = async (id: string): Promise<void> => {
        let payments = await paymentRepo.find({ where: { paymentMethodId: id } });
        if (payments.length === 0) {
          payments = await paymentRepo.find({ where: { paymentIntentId: id } });
        }

        for (const payment of payments) {
          if (payment.status !== MedicineOrderPaymentStatus.PENDING) continue;
          payment.status = MedicineOrderPaymentStatus.FAILED;
          await paymentRepo.save(payment);

          const order = await orderRepo.findOne({ where: { id: payment.orderId } });
          if (order && order.paymentStatus === OrderPaymentStatus.PENDING) {
            order.paymentStatus = OrderPaymentStatus.FAILED;
            await orderRepo.save(order);
          }
        }
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
              typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
            );
          }
          break;
        }
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data as { id?: string; payment_intent?: string };
          if (session.id) {
            await markPaid(
              session.id,
              typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
            );
          }
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
}
