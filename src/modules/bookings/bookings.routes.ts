import { Router, Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { BookingsController } from './bookings.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validate } from '../../middleware/validate.middleware';
import { CreateBookingDto, CancelBookingDto } from './bookings.dto';
import { env } from '../../config/env';
import { AppError } from '../../utils/app-error';

function requireInternalToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token: string | undefined = env.BACKEND_INTERNAL_TOKEN;
  if (!token) return next();
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ') || auth.slice(7) !== token) {
    return next(AppError.unauthorized('Invalid internal token'));
  }
  return next();
}

const router = Router();
const ctrl = container.resolve(BookingsController);

router.use(verifyToken, attachRole);

router.post(
  '/',
  requireRole('patient'),
  validate(CreateBookingDto),
  (req, res, next) => {
    void ctrl.createBooking(req, res, next);
  },
);

router.get('/', requireRole('patient', 'doctor', 'admin'), (req, res, next) => {
  void ctrl.listBookings(req, res, next);
});

router.get(
  '/:id',
  requireRole('patient', 'doctor', 'admin'),
  (req, res, next) => {
    void ctrl.getBookingById(req, res, next);
  },
);

router.patch('/:id/cancel', validate(CancelBookingDto), (req, res, next) => {
  void ctrl.cancelBooking(req, res, next);
});

router.post(
  '/:id/join-room',
  requireRole('patient', 'doctor'),
  (req, res, next) => {
    void ctrl.joinRoom(req, res, next);
  },
);

router.patch('/:id/complete', requireRole('doctor'), (req, res, next) => {
  void ctrl.completeBooking(req, res, next);
});

// Internal endpoint called by voice agents — authenticated via BACKEND_INTERNAL_TOKEN
router.post('/agent', requireInternalToken, (req, res, next) => {
  void ctrl.agentCreateBooking(req, res, next);
});

export { router as bookingsRouter };
