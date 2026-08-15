import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { ArticlesService } from './articles.service';
import { success, paginated } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';

@injectable()
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  listArticles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = {
        search: req.query['search'] as string | undefined,
        category: req.query['category'] as string | undefined,
        page: Number(req.query['page'] ?? 1),
        limit: Number(req.query['limit'] ?? 20),
      };
      const { data, total } = await this.articlesService.listArticles(filters);
      res.status(200).json(paginated(data, total, filters.page, filters.limit));
    } catch (err) {
      next(err);
    }
  };

  getArticleById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const article = await this.articlesService.getArticleById(id);
      res.status(200).json(success(article));
    } catch (err) {
      next(err);
    }
  };

  listMyBookmarks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const articles = await this.articlesService.listMyBookmarks(req.user.id);
      res.status(200).json(success(articles));
    } catch (err) {
      next(err);
    }
  };

  addBookmark = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      await this.articlesService.addBookmark(req.user.id, id);
      res.status(200).json(success(null, 'Article saved'));
    } catch (err) {
      next(err);
    }
  };

  removeBookmark = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) throw AppError.unauthorized();
      const { id } = req.params as { id: string };
      await this.articlesService.removeBookmark(req.user.id, id);
      res.status(200).json(success(null, 'Article removed from saved'));
    } catch (err) {
      next(err);
    }
  };
}
