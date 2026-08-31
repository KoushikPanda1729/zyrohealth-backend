import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { PatientCatalogService, PlaceCatalogOrderInput } from './patient-catalog.service';
import { success } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

@injectable()
export class PatientCatalogController {
  constructor(private readonly catalog: PatientCatalogService) {}

  browse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.tenantId) throw AppError.badRequest('No tenant associated with this account');
      const { query, page, limit } = req.query as { query?: string; page?: string; limit?: string };
      const result = await this.catalog.browse(req.user.tenantId, {
        query,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  };

  placeOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      if (!req.user.tenantId) throw AppError.badRequest('No tenant associated with this account');

      const body = req.body as PlaceCatalogOrderInput;
      if (!body.items?.length) throw AppError.badRequest('items is required');
      if (!body.deliveryAddressLine1 || !body.deliveryCity || !body.deliveryState || !body.deliveryPincode) {
        throw AppError.badRequest('Full delivery address is required');
      }
      if (!body.deliveryPhone) throw AppError.badRequest('deliveryPhone is required');

      const result = await this.catalog.placeOrder(req.user.id, req.user.tenantId, body);
      res.status(201).json(success(result, 'Order placed'));
    } catch (err) {
      next(err);
    }
  };
}
