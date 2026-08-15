import { Router } from 'express';
import { container } from 'tsyringe';
import { WomenHealthController } from './women-health.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validate } from '../../middleware/validate.middleware';
import { UpsertCycleLogDto } from './women-health.dto';

const router = Router();
const ctrl = container.resolve(WomenHealthController);

// Public — browsing categories needs no login, same precedent as
// articles/hospitals/doctors.
router.get('/categories', (req, res, next) => {
  void ctrl.listCategories(req, res, next);
});
router.get('/categories/:id', (req, res, next) => {
  void ctrl.getCategoryById(req, res, next);
});

// Patient's own cycle-tracking data.
router.get('/cycle', verifyToken, attachRole, requireRole('patient'), (req, res, next) => {
  void ctrl.getCycleLog(req, res, next);
});
router.put(
  '/cycle',
  verifyToken,
  attachRole,
  requireRole('patient'),
  validate(UpsertCycleLogDto),
  (req, res, next) => {
    void ctrl.upsertCycleLog(req, res, next);
  },
);

export { router as womenHealthRouter };
