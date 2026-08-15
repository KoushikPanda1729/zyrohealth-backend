import { Router } from 'express';
import { container } from 'tsyringe';
import { ArticlesController } from './articles.controller';
import { verifyToken } from '../../middleware/verifyToken.middleware';
import { attachRole } from '../../middleware/attachRole.middleware';
import { requireRole } from '../../middleware/requireRole.middleware';

const router = Router();
const ctrl = container.resolve(ArticlesController);

// Public — browsing the article library needs no login, same precedent as
// the doctors directory, pharmacy catalogue, and hospital directory.
router.get('/', (req, res, next) => {
  void ctrl.listArticles(req, res, next);
});

// Static path registered before the "/:id" param route below, otherwise
// Express would match "/bookmarks" as an :id.
router.get('/bookmarks', verifyToken, attachRole, requireRole('patient'), (req, res, next) => {
  void ctrl.listMyBookmarks(req, res, next);
});

router.get('/:id', (req, res, next) => {
  void ctrl.getArticleById(req, res, next);
});

router.post(
  '/:id/bookmark',
  verifyToken,
  attachRole,
  requireRole('patient'),
  (req, res, next) => {
    void ctrl.addBookmark(req, res, next);
  },
);
router.delete(
  '/:id/bookmark',
  verifyToken,
  attachRole,
  requireRole('patient'),
  (req, res, next) => {
    void ctrl.removeBookmark(req, res, next);
  },
);

export { router as articlesRouter };
