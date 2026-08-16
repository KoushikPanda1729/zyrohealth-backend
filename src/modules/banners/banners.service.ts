import { injectable } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { Banner } from '../../entities/Banner';

@injectable()
export class BannersService {
  // Public carousel — cross-tenant by default, same precedent as
  // articles/hospitals/doctors: a patient sees every tenant's published
  // banners regardless of which tenant they're registered under.
  async listBanners(): Promise<Banner[]> {
    return AppDataSource.getRepository(Banner)
      .createQueryBuilder('b')
      .where('b.is_published = true')
      .orderBy('b.sort_order', 'ASC')
      .addOrderBy('b.created_at', 'DESC')
      .getMany();
  }
}
