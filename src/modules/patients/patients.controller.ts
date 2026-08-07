import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { PatientsService } from './patients.service';
import { success, paginated } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import {
  CreatePatientProfileDtoType,
  UpdatePatientProfileDtoType,
} from './patients.dto';

@injectable()
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  createProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const profile = await this.patientsService.createProfile(
        req.user.id,
        req.body as CreatePatientProfileDtoType,
      );
      res.status(201).json(success(profile, 'Profile created'));
    } catch (err) {
      next(err);
    }
  };

  getProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const profile = await this.patientsService.getProfile(req.user.id);
      res.status(200).json(success(profile));
    } catch (err) {
      next(err);
    }
  };

  updateProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const profile = await this.patientsService.updateProfile(
        req.user.id,
        req.body as UpdatePatientProfileDtoType,
      );
      res.status(200).json(success(profile, 'Profile updated'));
    } catch (err) {
      next(err);
    }
  };

  getHistory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const { data, total } = await this.patientsService.getHistory(
        req.user.id,
        page,
        limit,
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  getPrescriptions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const { data, total } = await this.patientsService.getPrescriptions(
        req.user.id,
        page,
        limit,
      );
      res.status(200).json(paginated(data, total, page, limit));
    } catch (err) {
      next(err);
    }
  };

  getPrescriptionById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const prescription = await this.patientsService.getPrescriptionById(
        id,
        req.user.id,
      );
      res.status(200).json(success(prescription));
    } catch (err) {
      next(err);
    }
  };
}
