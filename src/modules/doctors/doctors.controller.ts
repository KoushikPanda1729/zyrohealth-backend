import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { DoctorsService } from './doctors.service';
import { DocumentType } from '../../entities/DoctorDocument';
import { success, paginated } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import {
  UpdateDoctorProfileDtoType,
  CreateMedicineDtoType,
  UpdateMedicineDtoType,
  CreateTestDtoType,
  UpdateTestDtoType,
  CreateAvailabilityDtoType,
  UpdateAvailabilityDtoType,
} from './doctors.dto';
import { getDefaultTenantId } from '../tenancy/permissions.util';

// These "browse doctors" endpoints are public (no login required), so
// there's no req.user.tenantId to read. A tenant-specific booking
// link/app instance passes its own ?tenantId=; omitted requests (today's
// app) fall back to the default tenant. ?allTenants=true opts out of
// tenant scoping entirely — the mobile app's directory browses every
// tenant's doctors at once, same idea as the medicine marketplace showing
// quotes from whichever shop actually fulfills them.
async function resolveTenantId(req: Request): Promise<string | undefined> {
  if (req.query['allTenants'] === 'true') return undefined;
  const queryTenantId = req.query['tenantId'] as string | undefined;
  const tenantId = queryTenantId ?? (await getDefaultTenantId());
  if (!tenantId) throw AppError.notFound('Tenant');
  return tenantId;
}

@injectable()
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  listDoctors = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = await resolveTenantId(req);
      const filters = {
        specialty: req.query['specialty'] as string | undefined,
        language: req.query['language'] as string | undefined,
        minRating: req.query['minRating']
          ? Number(req.query['minRating'])
          : undefined,
        maxFee: req.query['maxFee'] ? Number(req.query['maxFee']) : undefined,
        page: Number(req.query['page'] ?? 1),
        limit: Number(req.query['limit'] ?? 20),
      };
      const { data, total } = await this.doctorsService.listDoctors(
        tenantId,
        filters,
      );
      res.status(200).json(paginated(data, total, filters.page, filters.limit));
    } catch (err) {
      next(err);
    }
  };

  getDoctorById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = await resolveTenantId(req);
      const { id } = req.params as { id: string };
      const result = await this.doctorsService.getDoctorById(tenantId, id);
      res.status(200).json(success(result));
    } catch (err) {
      next(err);
    }
  };

  getAvailableSlots = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = await resolveTenantId(req);
      const { id } = req.params as { id: string };
      const dateStr = req.query['date'] as string | undefined;
      if (!dateStr)
        throw AppError.badRequest('date query param required (YYYY-MM-DD)');
      const date = new Date(dateStr);
      if (isNaN(date.getTime()))
        throw AppError.badRequest('Invalid date format');
      const slots = await this.doctorsService.getAvailableSlots(
        tenantId,
        id,
        date,
      );
      res.status(200).json(success(slots));
    } catch (err) {
      next(err);
    }
  };

  getOwnProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const profile = await this.doctorsService.getOwnProfile(req.user.id);
      res.status(200).json(success(profile));
    } catch (err) {
      next(err);
    }
  };

  updateOwnProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const profile = await this.doctorsService.updateOwnProfile(
        req.user.id,
        req.body as UpdateDoctorProfileDtoType,
      );
      res.status(200).json(success(profile, 'Profile updated'));
    } catch (err) {
      next(err);
    }
  };

  getDashboard = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const dashboard = await this.doctorsService.getDashboard(req.user.id);
      res.status(200).json(success(dashboard));
    } catch (err) {
      next(err);
    }
  };

  // Medicines
  createMedicine = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const med = await this.doctorsService.createMedicine(
        req.user.id,
        req.body as CreateMedicineDtoType,
      );
      res.status(201).json(success(med));
    } catch (err) {
      next(err);
    }
  };

  getMedicines = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const meds = await this.doctorsService.getMedicines(req.user.id);
      res.status(200).json(success(meds));
    } catch (err) {
      next(err);
    }
  };

  updateMedicine = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const med = await this.doctorsService.updateMedicine(
        id,
        req.user.id,
        req.body as UpdateMedicineDtoType,
      );
      res.status(200).json(success(med));
    } catch (err) {
      next(err);
    }
  };

  deleteMedicine = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      await this.doctorsService.deleteMedicine(id, req.user.id);
      res.status(200).json(success(null, 'Medicine deleted'));
    } catch (err) {
      next(err);
    }
  };

  // Tests
  createTest = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const test = await this.doctorsService.createTest(
        req.user.id,
        req.body as CreateTestDtoType,
      );
      res.status(201).json(success(test));
    } catch (err) {
      next(err);
    }
  };

  getTests = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const tests = await this.doctorsService.getTests(req.user.id);
      res.status(200).json(success(tests));
    } catch (err) {
      next(err);
    }
  };

  updateTest = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const test = await this.doctorsService.updateTest(
        id,
        req.user.id,
        req.body as UpdateTestDtoType,
      );
      res.status(200).json(success(test));
    } catch (err) {
      next(err);
    }
  };

  deleteTest = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      await this.doctorsService.deleteTest(id, req.user.id);
      res.status(200).json(success(null, 'Test deleted'));
    } catch (err) {
      next(err);
    }
  };

  // Availability
  createAvailability = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const avail = await this.doctorsService.createAvailability(
        req.user.id,
        req.body as CreateAvailabilityDtoType,
      );
      res.status(201).json(success(avail));
    } catch (err) {
      next(err);
    }
  };

  getAvailability = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const avail = await this.doctorsService.getAvailability(req.user.id);
      res.status(200).json(success(avail));
    } catch (err) {
      next(err);
    }
  };

  updateAvailability = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      const avail = await this.doctorsService.updateAvailability(
        id,
        req.user.id,
        req.body as UpdateAvailabilityDtoType,
      );
      res.status(200).json(success(avail));
    } catch (err) {
      next(err);
    }
  };

  getPatientHistory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { patientId } = req.params as { patientId: string };
      const history = await this.doctorsService.getPatientHistory(
        req.user.id,
        patientId,
      );
      res.status(200).json(success(history));
    } catch (err) {
      next(err);
    }
  };

  uploadDocument = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      if (!req.file) throw AppError.badRequest('No file uploaded');
      const { documentType, notes } = req.body as {
        documentType: string;
        notes?: string;
      };
      if (!Object.values(DocumentType).includes(documentType as DocumentType)) {
        throw AppError.badRequest(
          `Invalid document type. Valid types: ${Object.values(DocumentType).join(', ')}`,
        );
      }
      const doc = await this.doctorsService.uploadDocument(
        req.user.id,
        req.file,
        documentType as DocumentType,
        notes,
      );
      res.status(201).json(success(doc, 'Document uploaded'));
    } catch (err) {
      next(err);
    }
  };

  getDocuments = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const docs = await this.doctorsService.getDocuments(req.user.id);
      res.status(200).json(success(docs));
    } catch (err) {
      next(err);
    }
  };

  deleteDocument = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      await this.doctorsService.deleteDocument(req.user.id, id);
      res.status(200).json(success(null, 'Document deleted'));
    } catch (err) {
      next(err);
    }
  };
}
