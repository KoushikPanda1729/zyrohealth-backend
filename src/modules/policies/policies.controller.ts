import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { PoliciesService } from './policies.service';
import { success } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

@injectable()
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  listPublished = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const policies = await this.policiesService.listPublished();
      res.status(200).json(success(policies));
    } catch (err) {
      next(err);
    }
  };

  getBySlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { slug } = req.params as { slug: string };
      const policy = await this.policiesService.getBySlug(slug);
      if (!policy) throw AppError.notFound('Policy');
      res.status(200).json(success(policy));
    } catch (err) {
      next(err);
    }
  };
}
