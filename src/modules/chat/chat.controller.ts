import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { ChatService } from './chat.service';
import { success, paginated } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { io } from '../../socket';
import { SendMessageDtoType } from './chat.dto';

@injectable()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  getMessages = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { bookingId } = req.params as { bookingId: string };
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 50);
      const { data, total } = await this.chatService.getMessages(
        bookingId,
        req.user.id,
        page,
        limit,
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  sendMessage = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id || !req.user.role) throw AppError.unauthorized();
      const { bookingId } = req.params as { bookingId: string };
      const msg = await this.chatService.sendMessage(
        bookingId,
        req.user.id,
        req.user.role,
        req.body as SendMessageDtoType,
      );
      io.to(bookingId).emit('new_message', msg);
      res.status(201).json(success(msg));
    } catch (err) {
      next(err);
    }
  };

  uploadFile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { bookingId } = req.params as { bookingId: string };
      const file = req.file;
      if (!file) throw AppError.badRequest('No file provided');
      const url = await this.chatService.uploadFile(
        bookingId,
        req.user.id,
        file,
      );
      res.status(200).json(success({ url }));
    } catch (err) {
      next(err);
    }
  };

  markAsRead = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { bookingId } = req.params as { bookingId: string };
      await this.chatService.markAsRead(bookingId, req.user.id);
      res.status(200).json(success(null, 'Messages marked as read'));
    } catch (err) {
      next(err);
    }
  };
}
