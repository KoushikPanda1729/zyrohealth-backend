import { injectable } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { WomenHealthCategory } from '../../entities/WomenHealthCategory';
import { MenstrualCycleLog } from '../../entities/MenstrualCycleLog';
import { AppError } from '../../utils/app-error';
import { UpsertCycleLogDtoType } from './women-health.dto';

@injectable()
export class WomenHealthService {
  // Public directory browse — cross-tenant by default, same precedent as
  // articles/hospitals/doctors: a patient sees every tenant's published
  // categories regardless of which tenant they're registered under.
  async listCategories(): Promise<WomenHealthCategory[]> {
    return AppDataSource.getRepository(WomenHealthCategory).find({
      where: { isPublished: true },
      order: { createdAt: 'ASC' },
    });
  }

  async getCategoryById(id: string): Promise<WomenHealthCategory> {
    const category = await AppDataSource.getRepository(WomenHealthCategory).findOne({
      where: { id, isPublished: true },
    });
    if (!category) throw AppError.notFound("Women's health category");
    return category;
  }

  async getCycleLog(patientId: string): Promise<MenstrualCycleLog | null> {
    return AppDataSource.getRepository(MenstrualCycleLog).findOne({ where: { patientId } });
  }

  async upsertCycleLog(
    patientId: string,
    data: UpsertCycleLogDtoType,
  ): Promise<MenstrualCycleLog> {
    const repo = AppDataSource.getRepository(MenstrualCycleLog);
    const existing = await repo.findOne({ where: { patientId } });
    if (existing) {
      Object.assign(existing, data);
      return repo.save(existing);
    }
    return repo.save(repo.create({ patientId, ...data }));
  }
}
