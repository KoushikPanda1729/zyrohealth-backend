import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { WomenHealthService } from './women-health.service';
import { success } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { UpsertCycleLogDtoType } from './women-health.dto';

@injectable()
export class WomenHealthController {
  constructor(private readonly womenHealthService: WomenHealthService) {}

  listCategories = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = await this.womenHealthService.listCategories();
      res.status(200).json(success(categories));
    } catch (err) {
      next(err);
    }
  };

  getCategoryById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const category = await this.womenHealthService.getCategoryById(id);
      res.status(200).json(success(category));
    } catch (err) {
      next(err);
    }
  };

  getCycleLog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const log = await this.womenHealthService.getCycleLog(req.user.id);
      res.status(200).json(success(log));
    } catch (err) {
      next(err);
    }
  };

  upsertCycleLog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const log = await this.womenHealthService.upsertCycleLog(
        req.user.id,
        req.body as UpsertCycleLogDtoType,
      );
      res.status(200).json(success(log, 'Cycle log saved'));
    } catch (err) {
      next(err);
    }
  };
}
