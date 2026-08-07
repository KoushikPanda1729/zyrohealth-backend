import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { PrescriptionsService } from './prescriptions.service';
import { success } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { CreatePrescriptionDtoType } from './prescriptions.dto';

@injectable()
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  listPrescriptions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const page = Number(req.query['page'] ?? 1);
      const limit = Number(req.query['limit'] ?? 20);
      const { data, total } = await this.prescriptionsService.listByDoctor(
        req.user.id,
        page,
        limit,
      );
      res.status(200).json(success({ data, total, page, limit }));
    } catch (err) {
      next(err);
    }
  };

  createPrescription = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const prescription = await this.prescriptionsService.createPrescription(
        req.user.id,
        req.body as CreatePrescriptionDtoType,
      );
      res.status(201).json(success(prescription, 'Prescription created'));
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
      const prescription = await this.prescriptionsService.getPrescriptionById(
        id,
        req.user.id,
        req.user.role,
        req.user.tenantId,
      );
      res.status(200).json(success(prescription));
    } catch (err) {
      next(err);
    }
  };

  getPdfSignedUrl = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const url = await this.prescriptionsService.getPdfSignedUrl(
        id,
        req.user.id,
        req.user.role,
        req.user.tenantId,
      );
      res.status(200).json(success({ url }));
    } catch (err) {
      next(err);
    }
  };

  generatePdf = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const prescription = await this.prescriptionsService.regeneratePdf(
        id,
        req.user.id,
      );
      res.status(200).json(success(prescription, 'PDF regenerated'));
    } catch (err) {
      next(err);
    }
  };

  sendPrescription = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      await this.prescriptionsService.sendPrescription(id, req.user.id);
      res.status(200).json(success(null, 'Prescription sent'));
    } catch (err) {
      next(err);
    }
  };
}
