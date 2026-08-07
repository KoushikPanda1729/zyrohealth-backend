import { Router } from 'express';
import { container } from 'tsyringe';
import { PaymentsController } from './payments.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { validate } from '../../middleware/validate.middleware';
import { InitiatePaymentDto } from './payments.dto';

const router = Router();
const ctrl = container.resolve(PaymentsController);

// Webhook — PUBLIC, raw body already applied in app.ts
router.post('/webhook', (req, res, next) => {
  void ctrl.webhook(req, res, next);
});

// Authenticated routes
router.post(
  '/initiate',
  verifyToken,
  attachRole,
  validate(InitiatePaymentDto),
  (req, res, next) => {
    void ctrl.initiatePayment(req, res, next);
  },
);

router.get('/:bookingId', verifyToken, attachRole, (req, res, next) => {
  void ctrl.getPaymentStatus(req, res, next);
});

router.post('/:bookingId/refund', verifyToken, attachRole, (req, res, next) => {
  void ctrl.initiateRefund(req, res, next);
});

export { router as paymentsRouter };
