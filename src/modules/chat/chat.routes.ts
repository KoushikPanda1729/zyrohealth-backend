import { Router } from 'express';
import { container } from 'tsyringe';
import { ChatController } from './chat.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { validate } from '../../middleware/validate.middleware';
import { SendMessageDto } from './chat.dto';
import { uploadMiddleware } from '../../middleware/upload.middleware';

const router = Router();
const ctrl = container.resolve(ChatController);

router.use(verifyToken, attachRole);

router.get('/:bookingId/messages', (req, res, next) => {
  void ctrl.getMessages(req, res, next);
});

router.post(
  '/:bookingId/messages',
  validate(SendMessageDto),
  (req, res, next) => {
    void ctrl.sendMessage(req, res, next);
  },
);

router.post(
  '/:bookingId/upload',
  uploadMiddleware.single('file'),
  (req, res, next) => {
    void ctrl.uploadFile(req, res, next);
  },
);

router.patch('/:bookingId/read', (req, res, next) => {
  void ctrl.markAsRead(req, res, next);
});

export { router as chatRouter };
