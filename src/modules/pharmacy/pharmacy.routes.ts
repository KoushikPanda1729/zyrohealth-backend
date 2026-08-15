import { Router } from 'express';
import { container } from 'tsyringe';
import { PharmacyController } from './pharmacy.controller';

const router = Router();
const ctrl = container.resolve(PharmacyController);

// Public — browsing medicines needs no login, same precedent as the
// doctors directory (doctors.routes.ts).
router.get('/medicines', (req, res, next) => {
  void ctrl.listMedicines(req, res, next);
});

export { router as pharmacyRouter };
