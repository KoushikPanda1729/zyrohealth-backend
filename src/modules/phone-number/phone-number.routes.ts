import { Router } from 'express';
import { container } from 'tsyringe';
import { PhoneNumberController } from './phone-number.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';

const router = Router();
const ctrl = container.resolve(PhoneNumberController);

router.use(verifyToken, attachRole, requireRole('doctor'));

router.get('/', (req, res, next) => void ctrl.list(req, res, next));
router.get('/agents', (req, res, next) => void ctrl.listAgents(req, res, next));
router.post(
  '/inbound',
  (req, res, next) => void ctrl.importInbound(req, res, next),
);
router.post(
  '/outbound',
  (req, res, next) => void ctrl.importOutbound(req, res, next),
);
router.put(
  '/:id/agent',
  (req, res, next) => void ctrl.assignAgent(req, res, next),
);
router.delete(
  '/:id/agent',
  (req, res, next) => void ctrl.unassignAgent(req, res, next),
);
router.post(
  '/:id/call',
  (req, res, next) => void ctrl.initiateCall(req, res, next),
);
router.delete('/:id', (req, res, next) => void ctrl.delete(req, res, next));

export { router as phoneNumberRouter };
