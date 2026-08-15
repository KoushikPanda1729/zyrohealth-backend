import { Router } from 'express';
import { container } from 'tsyringe';
import { HospitalsController } from './hospitals.controller';

const router = Router();
const ctrl = container.resolve(HospitalsController);

// Public — browsing the hospital directory needs no login, same
// precedent as the doctors directory and pharmacy catalogue.
router.get('/', (req, res, next) => {
  void ctrl.listHospitals(req, res, next);
});
router.get('/:id', (req, res, next) => {
  void ctrl.getHospitalById(req, res, next);
});

export { router as hospitalsRouter };
