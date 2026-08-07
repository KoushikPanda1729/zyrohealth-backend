import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { PaymentsService } from './payments.service';
import { success } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { InitiatePaymentDtoType } from './payments.dto';

@injectable()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
      await this.paymentsService.handleWebhook(req.body as Buffer, signature);
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
