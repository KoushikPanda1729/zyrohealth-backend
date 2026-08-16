import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { PlatformService } from '../platform/platform.service';
import { success } from '../../utils/api-response';

// Thin public wrapper around PlatformService.getAppConfig() — the mobile
// app has no platform-level auth, so this can't live under
// modules/platform (that whole router requires verifyToken + a
// super_admin/platform_support role).
@injectable()
export class AppConfigController {
  constructor(private readonly platformService: PlatformService) {}

  getAppConfig = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await this.platformService.getAppConfig();
      res.status(200).json(success(config));
    } catch (err) {
      next(err);
    }
  };
}
