import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { MedicineOrdersService } from './medicine-orders.service';
import { success, paginated } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import {
  CreateOrderDtoType,
  InitiateMedicineOrderPaymentDtoType,
  InitiateGroupPaymentDtoType,
} from './medicine-orders.dto';

@injectable()
export class MedicineOrdersController {
  constructor(private readonly medicineOrdersService: MedicineOrdersService) {}

  createOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const order = await this.medicineOrdersService.createOrder(
        req.user.id,
        req.body as CreateOrderDtoType,
      );
      res.status(201).json(success(order, 'Order placed'));
    } catch (err) {
      next(err);
    }
  };

  listMyOrders = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id || !req.user.role) throw AppError.unauthorized();
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const { data, total } = await this.medicineOrdersService.listMyOrders(
        req.user.id,
        req.user.role,
        page,
        limit,
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  getOrderById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id || !req.user.role) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const order = await this.medicineOrdersService.getOrderById(
        id,
        req.user.id,
        req.user.role,
      );
      res.status(200).json(success(order));
    } catch (err) {
      next(err);
    }
  };

  cancelOrder = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const { reason } = req.body as { reason?: string };
      const order = await this.medicineOrdersService.cancelOrder(
        id,
        req.user.id,
        reason,
      );
      res.status(200).json(success(order, 'Order cancelled'));
    } catch (err) {
      next(err);
    }
  };

  initiatePayment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const { platform } = req.body as InitiateMedicineOrderPaymentDtoType;
      const result = await this.medicineOrdersService.initiatePayment(
        id,
        req.user.id,
        platform,
      );
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  };

  initiateGroupPayment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { orderIds, platform } = req.body as InitiateGroupPaymentDtoType;
      const result = await this.medicineOrdersService.initiateGroupPayment(
        orderIds,
        req.user.id,
        platform,
      );
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  };
}
