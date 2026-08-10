import { Request, Response, NextFunction } from 'express';
import { injectable, inject } from 'tsyringe';
import { PaymentsService } from './payments.service';
import { MedicineOrderPaymentsService } from '../medicine-order-payments/medicine-order-payments.service';
import { IPaymentProvider } from '../../providers/payment/payment.provider.interface';
import { PAYMENT_PROVIDER } from '../../config/container';
import { success } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { InitiatePaymentDtoType } from './payments.dto';

@injectable()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly medicineOrderPaymentsService: MedicineOrderPaymentsService,
    @inject(PAYMENT_PROVIDER) private readonly paymentProvider: IPaymentProvider,
  ) {}

  initiatePayment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const result = await this.paymentsService.initiatePayment(
        req.user.id,
        req.body as InitiatePaymentDtoType,
      );
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  };

  webhook = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const signature = req.headers['stripe-signature'];
      if (typeof signature !== 'string') {
        throw AppError.unprocessable('Missing stripe-signature header');
      }
      // Verified once here, then handed to every consumer — each one
      // no-ops on events it doesn't recognize as its own (see
      // MedicineOrderPaymentsService.processWebhookEvent's metadata check).
      const event = this.paymentProvider.verifyWebhook(req.body as Buffer, signature);
      await this.paymentsService.processWebhookEvent(event);
      await this.medicineOrderPaymentsService.processWebhookEvent(event);
      res.status(200).json({ received: true });
    } catch (err) {
      next(err);
    }
  };

  getPaymentStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { bookingId } = req.params as { bookingId: string };
      const payment = await this.paymentsService.getPaymentStatus(
        bookingId,
        req.user.id,
      );
      res.status(200).json(success(payment));
    } catch (err) {
      next(err);
    }
  };

  initiateRefund = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { bookingId } = req.params as { bookingId: string };
      const payment = await this.paymentsService.initiateRefund(
        bookingId,
        req.user.id,
      );
      res.status(200).json(success(payment, 'Refund initiated'));
    } catch (err) {
      next(err);
    }
  };
}
