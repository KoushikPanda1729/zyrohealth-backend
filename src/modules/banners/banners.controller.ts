import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { BannersService } from './banners.service';
import { success } from '../../utils/api-response';

@injectable()
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  listBanners = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const banners = await this.bannersService.listBanners();
      res.status(200).json(success(banners));
    } catch (err) {
      next(err);
    }
  };
}
