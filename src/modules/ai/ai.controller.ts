import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { AiService } from './ai.service';
import { success } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

@injectable()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  listAiDoctors = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const doctors = await this.aiService.listAiDoctors();
      res.status(200).json(success(doctors));
    } catch (err) {
      next(err);
    }
  };

  createSession = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { aiDoctorId } = req.body as { aiDoctorId?: string };
      const session = await this.aiService.createSession(
        req.user.id,
        aiDoctorId,
      );
      res.status(201).json(success(session, 'Session created'));
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
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const { message } = req.body as { message: string };
      const imageFile = req.file;
      const session = await this.aiService.sendMessage(
        id,
        req.user.id,
        message,
        imageFile,
      );
      res.status(200).json(success(session));
    } catch (err) {
      next(err);
    }
  };

  renameSession = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const { title } = req.body as { title: string };
      if (!title?.trim()) throw AppError.badRequest('Title is required');
      const session = await this.aiService.renameSession(
        id,
        req.user.id,
        title,
      );
      res.status(200).json(success(session, 'Session renamed'));
    } catch (err) {
      next(err);
    }
  };

  deleteSession = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      await this.aiService.deleteSession(id, req.user.id);
      res.status(200).json(success(null, 'Session deleted'));
    } catch (err) {
      next(err);
    }
  };

  getSession = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const session = await this.aiService.getSession(id, req.user.id);
      res.status(200).json(success(session));
    } catch (err) {
      next(err);
    }
  };

  listSessions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const sessions = await this.aiService.listSessions(req.user.id);
      res.status(200).json(success(sessions));
    } catch (err) {
      next(err);
    }
  };

  closeSession = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const session = await this.aiService.closeSession(id, req.user.id);
      res.status(200).json(success(session, 'Session closed'));
    } catch (err) {
      next(err);
    }
  };
}
