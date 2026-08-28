import { Router } from 'express';
import { container } from 'tsyringe';
import { AuthController } from './auth.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { validate } from '../../middleware/validate.middleware';
import { uploadMiddleware } from '../../middleware/upload.middleware';
import { authLimiter } from '../../middleware/rateLimit.middleware';
import { SendOtpDto, VerifyOtpDto } from './auth.dto';

const router = Router();
const ctrl = container.resolve(AuthController);

router.post('/send-otp', authLimiter, validate(SendOtpDto), (req, res, next) => {
  void ctrl.sendOtp(req, res, next);
});

router.post('/verify-otp', authLimiter, validate(VerifyOtpDto), (req, res, next) => {
  void ctrl.verifyOtp(req, res, next);
});

// Patient/doctor email+password auth — alternative to the OTP flow above.
router.post('/register', authLimiter, (req, res, next) => {
  void ctrl.register(req, res, next);
});
router.post('/login', authLimiter, (req, res, next) => {
  void ctrl.login(req, res, next);
});

router.get('/me', verifyToken, (req, res, next) => {
  void ctrl.me(req, res, next);
});

router.patch('/me', verifyToken, (req, res, next) => {
  void ctrl.updateMe(req, res, next);
});

router.post(
  '/me/avatar',
  verifyToken,
  uploadMiddleware.single('file'),
  (req, res, next) => {
    void ctrl.uploadAvatar(req, res, next);
  },
);

router.post('/me/generate-bio', verifyToken, (req, res, next) => {
  void ctrl.generateBio(req, res, next);
});

router.post('/me/change-password', verifyToken, (req, res, next) => {
  void ctrl.changePassword(req, res, next);
});

router.post('/logout', (req, res, next) => {
  void ctrl.logout(req, res, next);
});

router.post('/refresh', (req, res, next) => {
  void ctrl.refresh(req, res, next);
});

// Admin email+password auth
router.post('/admin/register', authLimiter, (req, res, next) => {
  void ctrl.adminRegister(req, res, next);
});
router.post('/admin/login', authLimiter, (req, res, next) => {
  void ctrl.adminLogin(req, res, next);
});

// Invite links (public, no auth — the token itself is the credential)
router.get('/verify-invite', (req, res, next) => {
  void ctrl.verifyInvite(req, res, next);
});
router.post('/accept-invite', (req, res, next) => {
  void ctrl.acceptInvite(req, res, next);
});

export { router as authRouter };
