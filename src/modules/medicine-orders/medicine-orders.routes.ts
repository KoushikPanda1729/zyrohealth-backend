import { Router } from 'express';
import { container } from 'tsyringe';
import { MedicineOrdersController } from './medicine-orders.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  CreateOrderDto,
  CancelOrderDto,
  InitiateMedicineOrderPaymentDto,
  InitiateGroupPaymentDto,
} from './medicine-orders.dto';

const router = Router();
const ctrl = container.resolve(MedicineOrdersController);

router.use(verifyToken, attachRole);

router.post(
  '/',
  requireRole('patient'),
  validate(CreateOrderDto),
  (req, res, next) => {
    void ctrl.createOrder(req, res, next);
  },
);

router.get('/', requireRole('patient', 'doctor'), (req, res, next) => {
  void ctrl.listMyOrders(req, res, next);
});

router.get('/:id', requireRole('patient', 'doctor'), (req, res, next) => {
  void ctrl.getOrderById(req, res, next);
});

router.post(
  '/:id/cancel',
  requireRole('patient'),
  validate(CancelOrderDto),
  (req, res, next) => {
    void ctrl.cancelOrder(req, res, next);
  },
);

router.post(
  '/:id/initiate-payment',
  requireRole('patient'),
  validate(InitiateMedicineOrderPaymentDto),
  (req, res, next) => {
    void ctrl.initiatePayment(req, res, next);
  },
);

// A cart spanning several pharmacies creates one order per shop, then pays
// for all of them together — no :id here since it covers multiple orders.
router.post(
  '/initiate-group-payment',
  requireRole('patient'),
  validate(InitiateGroupPaymentDto),
  (req, res, next) => {
    void ctrl.initiateGroupPayment(req, res, next);
  },
);

export { router as medicineOrdersRouter };
