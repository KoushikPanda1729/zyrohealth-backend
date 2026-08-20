import { injectable } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { Policy } from '../../entities/Policy';

@injectable()
export class PoliciesService {
  // Public — same precedent as banners/articles: only published documents
  // are ever visible outside the admin panel.
  async listPublished(): Promise<Policy[]> {
    return AppDataSource.getRepository(Policy).find({
      where: { isPublished: true },
      order: { createdAt: 'ASC' },
    });
  }

  async getBySlug(slug: string): Promise<Policy | null> {
    return AppDataSource.getRepository(Policy).findOne({
      where: { slug, isPublished: true },
    });
  }
}
