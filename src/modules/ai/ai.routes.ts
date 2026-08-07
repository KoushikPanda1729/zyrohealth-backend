import { Router } from 'express';
import { container } from 'tsyringe';
import { AiController } from './ai.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validate } from '../../middleware/validate.middleware';
import { uploadMiddleware } from '../../middleware/upload.middleware';
import { SendAiMessageDto } from './ai.dto';

const router = Router();
const ctrl = container.resolve(AiController);

// Public — browse available AI doctors (requires login but any role)
router.get('/doctors', verifyToken, attachRole, (req, res, next) => {
  void ctrl.listAiDoctors(req, res, next);
});

router.use(verifyToken, attachRole, requireRole('patient'));

router.post('/session', (req, res, next) => {
  void ctrl.createSession(req, res, next);
});

router.post(
  '/session/:id/message',
  uploadMiddleware.single('image'),
  validate(SendAiMessageDto),
  (req, res, next) => {
    void ctrl.sendMessage(req, res, next);
  },
);

router.get('/session/:id', (req, res, next) => {
  void ctrl.getSession(req, res, next);
});

router.get('/sessions', (req, res, next) => {
  void ctrl.listSessions(req, res, next);
});

router.patch('/session/:id/close', (req, res, next) => {
  void ctrl.closeSession(req, res, next);
});

router.patch('/session/:id/rename', (req, res, next) => {
  void ctrl.renameSession(req, res, next);
});

router.delete('/session/:id', (req, res, next) => {
  void ctrl.deleteSession(req, res, next);
});

export { router as aiRouter };
