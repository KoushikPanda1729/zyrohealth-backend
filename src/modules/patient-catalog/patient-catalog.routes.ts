import { Router } from 'express';
import { container } from 'tsyringe';
import { PatientCatalogController } from './patient-catalog.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';

const router = Router();
const ctrl = container.resolve(PatientCatalogController);

router.use(verifyToken, attachRole);

router.get('/', (req, res, next) => {
  void ctrl.browse(req, res, next);
});

router.post('/order', (req, res, next) => {
  void ctrl.placeOrder(req, res, next);
});

export { router as patientCatalogRouter };
