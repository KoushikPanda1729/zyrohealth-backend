import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { HospitalsService } from './hospitals.service';
import { success, paginated } from '../../utils/api-response';

@injectable()
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  listHospitals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = {
        search: req.query['search'] as string | undefined,
        city: req.query['city'] as string | undefined,
        page: Number(req.query['page'] ?? 1),
        limit: Number(req.query['limit'] ?? 20),
      };
      const { data, total } = await this.hospitalsService.listHospitals(filters);
      res.status(200).json(paginated(data, total, filters.page, filters.limit));
    } catch (err) {
      next(err);
    }
  };

  getHospitalById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const hospital = await this.hospitalsService.getHospitalById(id);
      res.status(200).json(success(hospital));
    } catch (err) {
      next(err);
    }
  };
}
