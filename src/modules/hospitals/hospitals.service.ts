import { injectable } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { Hospital } from '../../entities/Hospital';
import { AppError } from '../../utils/app-error';

@injectable()
export class HospitalsService {
  // Public directory browse — cross-tenant by default, same precedent as
  // doctors/pharmacy: a patient sees every onboarded hospital regardless
  // of which tenant they're registered under.
  async listHospitals(filters: {
    search?: string;
    city?: string;
    page: number;
    limit: number;
  }): Promise<{ data: Hospital[]; total: number }> {
    const qb = AppDataSource.getRepository(Hospital)
      .createQueryBuilder('h')
      .andWhere('h.is_active = true');

    if (filters.city) {
      qb.andWhere('LOWER(h.city) = :city', { city: filters.city.toLowerCase() });
    }
    if (filters.search) {
      qb.andWhere('LOWER(h.name) LIKE :search', {
        search: `%${filters.search.toLowerCase()}%`,
      });
    }

    const [data, total] = await qb
      .orderBy('h.name', 'ASC')
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .getManyAndCount();

    return { data, total };
  }

  async getHospitalById(id: string): Promise<Hospital> {
    const hospital = await AppDataSource.getRepository(Hospital).findOne({
      where: { id, isActive: true },
    });
    if (!hospital) throw AppError.notFound('Hospital');
    return hospital;
  }
}
