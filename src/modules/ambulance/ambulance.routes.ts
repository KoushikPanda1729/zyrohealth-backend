import { Router } from 'express';
import { container } from 'tsyringe';
import { AmbulanceController } from './ambulance.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validate } from '../../middleware/validate.middleware';
import { CreateAmbulanceRequestDto, CancelAmbulanceRequestDto } from './ambulance.dto';

const router = Router();
const ctrl = container.resolve(AmbulanceController);

router.use(verifyToken, attachRole);

router.post(
  '/',
  requireRole('patient'),
  validate(CreateAmbulanceRequestDto),
  (req, res, next) => {
    void ctrl.createRequest(req, res, next);
  },
);

router.get('/', requireRole('patient'), (req, res, next) => {
  void ctrl.listMyRequests(req, res, next);
});

router.get('/:id', requireRole('patient'), (req, res, next) => {
  void ctrl.getRequestById(req, res, next);
});

router.post(
  '/:id/cancel',
  requireRole('patient'),
  validate(CancelAmbulanceRequestDto),
  (req, res, next) => {
    void ctrl.cancelRequest(req, res, next);
  },
);

export { router as ambulanceRouter };
