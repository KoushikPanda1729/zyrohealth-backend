import { Router } from 'express';
import { container } from 'tsyringe';
import { PatientsController } from './patients.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  CreatePatientProfileDto,
  UpdatePatientProfileDto,
} from './patients.dto';

const router = Router();
const ctrl = container.resolve(PatientsController);

router.use(verifyToken, attachRole, requireRole('patient', 'admin'));

router.post('/profile', validate(CreatePatientProfileDto), (req, res, next) => {
  void ctrl.createProfile(req, res, next);
});

router.get('/profile', (req, res, next) => {
  void ctrl.getProfile(req, res, next);
});

router.patch(
  '/profile',
  validate(UpdatePatientProfileDto),
  (req, res, next) => {
    void ctrl.updateProfile(req, res, next);
  },
);

router.get('/history', (req, res, next) => {
  void ctrl.getHistory(req, res, next);
});

router.get('/prescriptions', (req, res, next) => {
  void ctrl.getPrescriptions(req, res, next);
});

router.get('/prescriptions/:id', (req, res, next) => {
  void ctrl.getPrescriptionById(req, res, next);
});

export { router as patientsRouter };
