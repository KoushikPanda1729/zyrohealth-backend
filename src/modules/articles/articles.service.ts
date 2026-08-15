import { injectable } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { Article } from '../../entities/Article';
import { ArticleBookmark } from '../../entities/ArticleBookmark';
import { AppError } from '../../utils/app-error';

@injectable()
export class ArticlesService {
  // Public directory browse — cross-tenant by default, same precedent as
  // doctors/hospitals/pharmacy: a patient sees every tenant's published
  // articles regardless of which tenant they're registered under.
  async listArticles(filters: {
    search?: string;
    category?: string;
    page: number;
    limit: number;
  }): Promise<{ data: Article[]; total: number }> {
    const qb = AppDataSource.getRepository(Article)
      .createQueryBuilder('a')
      .andWhere('a.is_published = true');

    if (filters.category) {
      qb.andWhere('LOWER(a.category) = :category', {
        category: filters.category.toLowerCase(),
      });
    }
    if (filters.search) {
      qb.andWhere('LOWER(a.title) LIKE :search', {
        search: `%${filters.search.toLowerCase()}%`,
      });
    }

    const [data, total] = await qb
      .orderBy('a.created_at', 'DESC')
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .getManyAndCount();

    return { data, total };
  }

  async getArticleById(id: string): Promise<Article> {
    const article = await AppDataSource.getRepository(Article).findOne({
      where: { id, isPublished: true },
    });
    if (!article) throw AppError.notFound('Article');
    return article;
  }

  async addBookmark(patientId: string, articleId: string): Promise<void> {
    const article = await AppDataSource.getRepository(Article).findOne({
      where: { id: articleId, isPublished: true },
    });
    if (!article) throw AppError.notFound('Article');

    const repo = AppDataSource.getRepository(ArticleBookmark);
    const existing = await repo.findOne({ where: { patientId, articleId } });
    if (existing) return;
    await repo.save(repo.create({ patientId, articleId }));
  }

  async removeBookmark(patientId: string, articleId: string): Promise<void> {
    await AppDataSource.getRepository(ArticleBookmark).delete({ patientId, articleId });
  }

  async listMyBookmarks(patientId: string): Promise<Article[]> {
    const bookmarks = await AppDataSource.getRepository(ArticleBookmark).find({
      where: { patientId },
      order: { createdAt: 'DESC' },
    });
    if (bookmarks.length === 0) return [];
    const articleIds = bookmarks.map((b) => b.articleId);
    const articles = await AppDataSource.getRepository(Article).find({
      where: articleIds.map((id) => ({ id })),
    });
    const byId = new Map(articles.map((a) => [a.id, a]));
    // Preserve bookmark order (most recently saved first) rather than
    // whatever order the IN-clause happens to return.
    return bookmarks.map((b) => byId.get(b.articleId)).filter((a): a is Article => !!a);
  }
}
