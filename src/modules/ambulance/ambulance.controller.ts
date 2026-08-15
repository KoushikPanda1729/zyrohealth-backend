import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { AmbulanceService } from './ambulance.service';
import { success, paginated } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { CreateAmbulanceRequestDtoType, CancelAmbulanceRequestDtoType } from './ambulance.dto';

@injectable()
export class AmbulanceController {
  constructor(private readonly ambulanceService: AmbulanceService) {}

  createRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const request = await this.ambulanceService.createRequest(
        req.user.id,
        req.body as CreateAmbulanceRequestDtoType,
      );
      res.status(201).json(success(request, 'Ambulance requested'));
    } catch (err) {
      next(err);
    }
  };

  listMyRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const { data, total } = await this.ambulanceService.listMyRequests(
        req.user.id,
        page,
        limit,
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  getRequestById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const request = await this.ambulanceService.getRequestById(id, req.user.id);
      res.status(200).json(success(request));
    } catch (err) {
      next(err);
    }
  };

  cancelRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const { reason } = req.body as CancelAmbulanceRequestDtoType;
      const request = await this.ambulanceService.cancelRequest(id, req.user.id, reason);
      res.status(200).json(success(request, 'Ambulance request cancelled'));
    } catch (err) {
      next(err);
    }
  };
}
