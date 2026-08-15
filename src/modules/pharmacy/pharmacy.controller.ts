import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { PharmacyService } from './pharmacy.service';
import { paginated } from '../../utils/api-response';

@injectable()
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  listMedicines = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const filters = {
        search: req.query['search'] as string | undefined,
        shopId: req.query['shopId'] as string | undefined,
        page: Number(req.query['page'] ?? 1),
        limit: Number(req.query['limit'] ?? 20),
      };
      const { data, total } = await this.pharmacyService.listMedicines(filters);
      res.status(200).json(paginated(data, total, filters.page, filters.limit));
    } catch (err) {
      next(err);
    }
  };
}
