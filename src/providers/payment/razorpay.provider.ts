import { injectable } from 'tsyringe';
import {
  IPaymentProvider,
  PaymentIntentParams,
  PaymentIntentResult,
  CheckoutSessionParams,
  CheckoutSessionResult,
  WebhookEvent,
  RefundResult,
} from './payment.provider.interface';

// TODO: Implement Razorpay payment provider
@injectable()
export class RazorpayPaymentProvider implements IPaymentProvider {
  createPaymentIntent(
    _params: PaymentIntentParams,
  ): Promise<PaymentIntentResult> {
    throw new Error('RazorpayPaymentProvider not implemented');
  }

  createCheckoutSession(
    _params: CheckoutSessionParams,
    _idempotencyKey?: string,
  ): Promise<CheckoutSessionResult> {
    throw new Error('RazorpayPaymentProvider not implemented');
  }

  verifyWebhook(_payload: Buffer, _signature: string): WebhookEvent {
    throw new Error('RazorpayPaymentProvider not implemented');
  }

  createRefund(
    _paymentRef: string,
    _amountCents: number,
  ): Promise<RefundResult> {
    throw new Error('RazorpayPaymentProvider not implemented');
  }
}
