export interface PaymentIntentParams {
  amountCents: number;
  currency: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

export interface CheckoutSessionParams {
  amountCents: number;
  currency: string;
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  description?: string;
}

export interface CheckoutSessionResult {
  url: string;
  sessionId: string;
  paymentIntentId?: string;
}

export interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
  rawEvent: unknown;
}

export interface RefundResult {
  refundId: string;
  amountCents: number;
  status: string;
}

export interface IPaymentProvider {
  createPaymentIntent(
    params: PaymentIntentParams,
  ): Promise<PaymentIntentResult>;
  createCheckoutSession(
    params: CheckoutSessionParams,
    idempotencyKey?: string,
  ): Promise<CheckoutSessionResult>;
  verifyWebhook(payload: Buffer, signature: string): WebhookEvent;
  createRefund(paymentRef: string, amountCents: number): Promise<RefundResult>;
}
