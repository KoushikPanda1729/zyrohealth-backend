import { injectable } from 'tsyringe';
import Stripe from 'stripe';
import {
  IPaymentProvider,
  PaymentIntentParams,
  PaymentIntentResult,
  CheckoutSessionParams,
  CheckoutSessionResult,
  WebhookEvent,
  RefundResult,
} from './payment.provider.interface';
import { env } from '../../config/env';
import { AppError } from '../../utils/app-error';

type StripeInstance = InstanceType<typeof Stripe>;

@injectable()
export class StripePaymentProvider implements IPaymentProvider {
  private readonly stripe: StripeInstance;

  constructor() {
    this.stripe = new Stripe(env.STRIPE_SECRET_KEY);
  }

  async createPaymentIntent(
    params: PaymentIntentParams,
  ): Promise<PaymentIntentResult> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency,
      metadata: params.metadata ?? {},
      automatic_payment_methods: { enabled: true },
    });

    if (!intent.client_secret) {
      throw AppError.unprocessable('Failed to create payment intent');
    }

    return {
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
    };
  }

  async getCheckoutSession(sessionId: string): Promise<{ url: string }> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    if (!session.url) throw new Error('Session has no URL');
    return { url: session.url };
  }

  async createCheckoutSession(
    params: CheckoutSessionParams,
    idempotencyKey?: string,
  ): Promise<CheckoutSessionResult> {
    const requestOptions = idempotencyKey ? { idempotencyKey } : undefined;
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: params.currency,
              unit_amount: params.amountCents,
              product_data: {
                name: params.description ?? 'Medical Consultation',
              },
            },
            quantity: 1,
          },
        ],
        metadata: params.metadata ?? {},
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      },
      requestOptions,
    );

    if (!session.url)
      throw AppError.unprocessable('Failed to create checkout session');

    return {
      url: session.url,
      sessionId: session.id,
      paymentIntentId:
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : undefined,
    };
  }

  verifyWebhook(payload: Buffer, signature: string): WebhookEvent {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      );
      return {
        type: event.type,
        data: event.data.object as unknown as Record<string, unknown>,
        rawEvent: event,
      };
    } catch {
      throw AppError.unprocessable('Invalid webhook signature');
    }
  }

  async createRefund(
    paymentIntentId: string,
    amountCents: number,
  ): Promise<RefundResult> {
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountCents,
    });

    return {
      refundId: refund.id,
      amountCents: refund.amount,
      status: refund.status ?? 'pending',
    };
  }
}
