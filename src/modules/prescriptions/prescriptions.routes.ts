import { Router } from 'express';
import { container } from 'tsyringe';
import { PrescriptionsController } from './prescriptions.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validate } from '../../middleware/validate.middleware';
import { CreatePrescriptionDto } from './prescriptions.dto';

const router = Router();
const ctrl = container.resolve(PrescriptionsController);

router.use(verifyToken, attachRole);

router.get('/', requireRole('doctor'), (req, res, next) => {
  void ctrl.listPrescriptions(req, res, next);
});

router.post(
  '/',
  requireRole('doctor'),
  validate(CreatePrescriptionDto),
  (req, res, next) => {
    void ctrl.createPrescription(req, res, next);
  },
);

router.get('/:id/pdf', (req, res, next) => {
  void ctrl.getPdfSignedUrl(req, res, next);
});

router.get('/:id', (req, res, next) => {
  void ctrl.getPrescriptionById(req, res, next);
});

router.post('/:id/generate-pdf', requireRole('doctor'), (req, res, next) => {
  void ctrl.generatePdf(req, res, next);
});

router.post('/:id/send', requireRole('doctor'), (req, res, next) => {
  void ctrl.sendPrescription(req, res, next);
});

export { router as prescriptionsRouter };
