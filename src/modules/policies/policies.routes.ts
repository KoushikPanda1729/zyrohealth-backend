import { Router } from 'express';
import { container } from 'tsyringe';
import { PoliciesController } from './policies.controller';

const router = Router();
const ctrl = container.resolve(PoliciesController);

// Public — no login needed, same precedent as banners/articles/hospitals.
// Order matters: '/:slug' would otherwise swallow a literal '/' request.
router.get('/', (req, res, next) => {
  void ctrl.listPublished(req, res, next);
});
router.get('/:slug', (req, res, next) => {
  void ctrl.getBySlug(req, res, next);
});

export { router as policiesRouter };
