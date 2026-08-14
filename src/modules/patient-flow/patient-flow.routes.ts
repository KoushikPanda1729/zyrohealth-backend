import { Router } from 'express';
import { container } from 'tsyringe';
import { PatientFlowController } from './patient-flow.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { uploadMiddleware } from '../../middleware/upload.middleware';

const router = Router();
const ctrl = container.resolve(PatientFlowController);

router.use(verifyToken, attachRole);

router.post('/reply', (req, res, next) => {
  void ctrl.reply(req, res, next);
});

router.get('/history', (req, res, next) => {
  void ctrl.history(req, res, next);
});

router.get('/requests/:requestId/quotes/:quoteId/receipt', (req, res, next) => {
  void ctrl.quoteReceipt(req, res, next);
});

router.post('/upload', uploadMiddleware.single('file'), (req, res, next) => {
  void ctrl.upload(req, res, next);
});

export { router as patientFlowRouter };
