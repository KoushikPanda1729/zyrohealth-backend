import { Router } from 'express';
import { container } from 'tsyringe';
import { BannersController } from './banners.controller';

const router = Router();
const ctrl = container.resolve(BannersController);

// Public — the Home screen carousel needs no login, same precedent as the
// articles library, doctors directory, and hospital directory.
router.get('/', (req, res, next) => {
  void ctrl.listBanners(req, res, next);
});

export { router as bannersRouter };
