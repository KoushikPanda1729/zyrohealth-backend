import { injectable } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { PatientProfile } from '../../entities/PatientProfile';
import { PatientHistory } from '../../entities/PatientHistory';
import { Prescription } from '../../entities/Prescription';
import { AppError } from '../../utils/app-error';
import {
  CreatePatientProfileDtoType,
  UpdatePatientProfileDtoType,
} from './patients.dto';

@injectable()
export class PatientsService {
  async createProfile(
    userId: string,
    dto: CreatePatientProfileDtoType,
  ): Promise<PatientProfile> {
    const repo = AppDataSource.getRepository(PatientProfile);
    const existing = await repo.findOne({ where: { userId } });
    if (existing) throw AppError.conflict('Patient profile already exists');

    const profile = repo.create({
      userId,
      ...dto,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
    });
    return repo.save(profile);
  }

  async getProfile(userId: string): Promise<PatientProfile> {
    const profile = await AppDataSource.getRepository(PatientProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Patient profile');
    return profile;
  }

  async updateProfile(
    userId: string,
    dto: UpdatePatientProfileDtoType,
  ): Promise<PatientProfile> {
    const repo = AppDataSource.getRepository(PatientProfile);
    const profile = await repo.findOne({ where: { userId } });
    if (!profile) throw AppError.notFound('Patient profile');

    const updated = repo.merge(profile, {
      ...dto,
      dateOfBirth: dto.dateOfBirth
        ? new Date(dto.dateOfBirth)
        : profile.dateOfBirth,
    });
    return repo.save(updated);
  }

  async getHistory(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ data: PatientHistory[]; total: number }> {
    const [data, total] = await AppDataSource.getRepository(
      PatientHistory,
    ).findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async getPrescriptions(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ data: Prescription[]; total: number }> {
    const [data, total] = await AppDataSource.getRepository(
      Prescription,
    ).findAndCount({
      where: { patientId: userId },
      relations: ['booking', 'booking.doctor', 'booking.doctor.doctorProfile'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async getPrescriptionById(id: string, userId: string): Promise<Prescription> {
    const prescription = await AppDataSource.getRepository(
      Prescription,
    ).findOne({
      where: { id, patientId: userId },
      relations: ['booking', 'booking.doctor', 'booking.doctor.doctorProfile'],
    });
    if (!prescription) throw AppError.notFound('Prescription');
    return prescription;
  }
}
