import { Router } from 'express';
import { container } from 'tsyringe';
import { DoctorsController } from './doctors.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validate } from '../../middleware/validate.middleware';
import { uploadMiddleware } from '../../middleware/upload.middleware';
import {
  UpdateDoctorProfileDto,
  CreateMedicineDto,
  UpdateMedicineDto,
  CreateTestDto,
  UpdateTestDto,
  CreateAvailabilityDto,
  UpdateAvailabilityDto,
} from './doctors.dto';

const router = Router();
const ctrl = container.resolve(DoctorsController);

// Public routes
router.get('/', (req, res, next) => {
  void ctrl.listDoctors(req, res, next);
});
router.get('/:id', (req, res, next) => {
  void ctrl.getDoctorById(req, res, next);
});
router.get('/:id/slots', (req, res, next) => {
  void ctrl.getAvailableSlots(req, res, next);
});
// Alias used by voice agents
router.get('/:id/available-slots', (req, res, next) => {
  void ctrl.getAvailableSlots(req, res, next);
});

export { router as doctorsRouter };

// Doctor-private routes (separate router, mounted at /api/doctor in app.ts)
const doctorPrivateRouter = Router();
doctorPrivateRouter.use(verifyToken, attachRole, requireRole('doctor'));

doctorPrivateRouter.get('/profile', (req, res, next) => {
  void ctrl.getOwnProfile(req, res, next);
});
doctorPrivateRouter.patch(
  '/profile',
  validate(UpdateDoctorProfileDto),
  (req, res, next) => {
    void ctrl.updateOwnProfile(req, res, next);
  },
);
doctorPrivateRouter.get('/dashboard', (req, res, next) => {
  void ctrl.getDashboard(req, res, next);
});

doctorPrivateRouter.get('/medicines', (req, res, next) => {
  void ctrl.getMedicines(req, res, next);
});
doctorPrivateRouter.post(
  '/medicines',
  validate(CreateMedicineDto),
  (req, res, next) => {
    void ctrl.createMedicine(req, res, next);
  },
);
doctorPrivateRouter.patch(
  '/medicines/:id',
  validate(UpdateMedicineDto),
  (req, res, next) => {
    void ctrl.updateMedicine(req, res, next);
  },
);
doctorPrivateRouter.delete('/medicines/:id', (req, res, next) => {
  void ctrl.deleteMedicine(req, res, next);
});

doctorPrivateRouter.get('/tests', (req, res, next) => {
  void ctrl.getTests(req, res, next);
});
doctorPrivateRouter.post(
  '/tests',
  validate(CreateTestDto),
  (req, res, next) => {
    void ctrl.createTest(req, res, next);
  },
);
doctorPrivateRouter.patch(
  '/tests/:id',
  validate(UpdateTestDto),
  (req, res, next) => {
    void ctrl.updateTest(req, res, next);
  },
);
doctorPrivateRouter.delete('/tests/:id', (req, res, next) => {
  void ctrl.deleteTest(req, res, next);
});

doctorPrivateRouter.get('/availability', (req, res, next) => {
  void ctrl.getAvailability(req, res, next);
});
doctorPrivateRouter.post(
  '/availability',
  validate(CreateAvailabilityDto),
  (req, res, next) => {
    void ctrl.createAvailability(req, res, next);
  },
);
doctorPrivateRouter.patch(
  '/availability/:id',
  validate(UpdateAvailabilityDto),
  (req, res, next) => {
    void ctrl.updateAvailability(req, res, next);
  },
);

doctorPrivateRouter.get('/patients/:patientId/history', (req, res, next) => {
  void ctrl.getPatientHistory(req, res, next);
});

doctorPrivateRouter.get('/documents', (req, res, next) => {
  void ctrl.getDocuments(req, res, next);
});
doctorPrivateRouter.post(
  '/documents',
  uploadMiddleware.single('file'),
  (req, res, next) => {
    void ctrl.uploadDocument(req, res, next);
  },
);
doctorPrivateRouter.delete('/documents/:id', (req, res, next) => {
  void ctrl.deleteDocument(req, res, next);
});

export { doctorPrivateRouter };
