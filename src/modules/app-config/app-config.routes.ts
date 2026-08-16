import { Router } from 'express';
import { container } from 'tsyringe';
import { AppConfigController } from './app-config.controller';

const router = Router();
const ctrl = container.resolve(AppConfigController);

// Public — the mobile app reads this on every launch to know which Home
// screen tabs/quick-actions the platform owner currently has enabled, no
// auth required (there's nothing sensitive in a UI visibility toggle).
router.get('/', (req, res, next) => {
  void ctrl.getAppConfig(req, res, next);
});

export { router as appConfigRouter };
