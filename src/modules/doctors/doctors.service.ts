import { injectable, inject } from 'tsyringe';
import { In } from 'typeorm';
import { AppDataSource } from '../../config/database';
import { DoctorProfile, ApprovalStatus } from '../../entities/DoctorProfile';
import {
  DoctorAvailability,
  DayOfWeek,
} from '../../entities/DoctorAvailability';
import { MedicineCatalogue } from '../../entities/MedicineCatalogue';
import { TestCatalogue } from '../../entities/TestCatalogue';
import { DoctorDocument, DocumentType } from '../../entities/DoctorDocument';
import { Booking, BookingStatus } from '../../entities/Booking';
import { PatientHistory } from '../../entities/PatientHistory';
import { Review } from '../../entities/Review';
import { AppError } from '../../utils/app-error';
import { generateAvailableSlots } from '../../utils/slot-generator';
import { TimeSlot } from '../../utils/slot-generator';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { STORAGE_PROVIDER } from '../../config/container';
import { Tenant } from '../../entities/Tenant';
import {
  UpdateDoctorProfileDtoType,
  CreateMedicineDtoType,
  CreateTestDtoType,
  CreateAvailabilityDtoType,
} from './doctors.dto';

@injectable()
export class DoctorsService {
  constructor(
    @inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  // tenantId undefined means "every tenant" — the mobile app's cross-tenant
  // directory (see doctors.controller.ts's ?allTenants=true) versus a
  // tenant-specific booking link/app instance that still only wants its
  // own doctors.
  async listDoctors(
    tenantId: string | undefined,
    filters: {
      specialty?: string;
      language?: string;
      minRating?: number;
      maxFee?: number;
      page: number;
      limit: number;
    },
  ): Promise<{
    data: (DoctorProfile & { tenantName?: string; tenantAddress?: string })[];
    total: number;
  }> {
    const repo = AppDataSource.getRepository(DoctorProfile);
    const qb = repo
      .createQueryBuilder('dp')
      .leftJoinAndSelect('dp.user', 'user')
      .andWhere('dp.approval_status = :status', {
        status: ApprovalStatus.APPROVED,
      })
      .andWhere('dp.is_available = true');

    if (tenantId) {
      qb.andWhere('dp.tenant_id = :tenantId', { tenantId });
    }

    if (filters.specialty) {
      qb.andWhere('LOWER(dp.specialty) LIKE :specialty', {
        specialty: `%${filters.specialty.toLowerCase()}%`,
      });
    }

    if (filters.language) {
      qb.andWhere(':language = ANY(dp.languages)', {
        language: filters.language.toLowerCase(),
      });
    }

    if (filters.minRating !== undefined) {
      qb.andWhere('dp.rating >= :minRating', { minRating: filters.minRating });
    }

    if (filters.maxFee !== undefined) {
      qb.andWhere('dp.consultation_fee <= :maxFee', { maxFee: filters.maxFee });
    }

    const [data, total] = await qb
      .orderBy('dp.rating', 'DESC')
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .getManyAndCount();

    return { data: await this.hydrateTenantInfo(data), total };
  }

  // No @ManyToOne relation from DoctorProfile to Tenant exists (just the
  // tenantId FK) — a plain batch lookup, same "hydrate" pattern
  // admin.service.ts already uses for patient/shop names. Address is
  // included alongside the name so a patient booking an in-person ("site")
  // appointment can see the clinic's location — a video consultation has
  // nothing to show here, so it's left undefined for tenants without one.
  private async hydrateTenantInfo<T extends { tenantId?: string }>(
    doctors: T[],
  ): Promise<(T & { tenantName?: string; tenantAddress?: string })[]> {
    const tenantIds = [...new Set(doctors.map((d) => d.tenantId).filter((id): id is string => Boolean(id)))];
    if (tenantIds.length === 0) return doctors;
    const tenants = await AppDataSource.getRepository(Tenant).findBy({ id: In(tenantIds) });
    const nameById = new Map(tenants.map((t) => [t.id, t.name]));
    const addressById = new Map(tenants.map((t) => [t.id, t.address]));
    return doctors.map((d) => ({
      ...d,
      tenantName: d.tenantId ? nameById.get(d.tenantId) : undefined,
      tenantAddress: d.tenantId ? addressById.get(d.tenantId) : undefined,
    }));
  }

  async getDoctorById(
    tenantId: string | undefined,
    doctorProfileId: string,
  ): Promise<{
    profile: DoctorProfile & { tenantName?: string; tenantAddress?: string };
    reviews: Review[];
  }> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: tenantId ? { id: doctorProfileId, tenantId } : { id: doctorProfileId },
      relations: ['user'],
    });
    if (!profile) throw AppError.notFound('Doctor');
    const [hydrated] = await this.hydrateTenantInfo([profile]);

    const reviews = await AppDataSource.getRepository(Review).find({
      where: { doctorId: profile.userId },
      relations: ['patient'],
      order: { createdAt: 'DESC' },
      take: 20,
    });

    return { profile: hydrated, reviews };
  }

  async getAvailableSlots(
    tenantId: string | undefined,
    doctorProfileId: string,
    date: Date,
  ): Promise<TimeSlot[]> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: tenantId ? { id: doctorProfileId, tenantId } : { id: doctorProfileId },
    });
    if (!profile) throw AppError.notFound('Doctor');

    const availability = await AppDataSource.getRepository(
      DoctorAvailability,
    ).find({
      where: { doctorProfileId, isActive: true },
    });

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await AppDataSource.getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.doctor_id = :doctorId', { doctorId: profile.userId })
      .andWhere('b.scheduled_at >= :start', { start: startOfDay })
      .andWhere('b.scheduled_at <= :end', { end: endOfDay })
      .andWhere('b.status != :cancelled', {
        cancelled: BookingStatus.CANCELLED,
      })
      .getMany();

    return generateAvailableSlots(availability, existingBookings, date);
  }

  async getOwnProfile(userId: string): Promise<DoctorProfile | null> {
    const repo = AppDataSource.getRepository(DoctorProfile);
    return repo.findOne({ where: { userId }, relations: ['user'] });
  }

  async updateOwnProfile(
    userId: string,
    dto: UpdateDoctorProfileDtoType,
  ): Promise<DoctorProfile> {
    const repo = AppDataSource.getRepository(DoctorProfile);
    let profile = await repo.findOne({ where: { userId } });
    if (!profile) {
      profile = repo.create({ userId, ...dto });
    } else {
      profile = repo.merge(profile, dto);
    }
    return repo.save(profile);
  }

  async getDashboard(userId: string): Promise<{
    upcomingBookings: Booking[];
    todayEarnings: number;
    totalEarnings: number;
    rating: number;
    pendingBookings: Booking[];
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingBookings = await AppDataSource.getRepository(Booking).find({
      where: [
        { doctorId: userId, status: BookingStatus.PAID },
        { doctorId: userId, status: BookingStatus.ACTIVE },
      ],
      order: { scheduledAt: 'ASC' },
      take: 10,
    });

    const pendingBookings = await AppDataSource.getRepository(Booking).find({
      where: { doctorId: userId, status: BookingStatus.PENDING },
      order: { createdAt: 'DESC' },
    });

    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });

    return {
      upcomingBookings,
      todayEarnings: 0,
      totalEarnings: 0,
      rating: Number(profile?.rating ?? 0),
      pendingBookings,
    };
  }

  // Medicine CRUD
  async createMedicine(
    userId: string,
    dto: CreateMedicineDtoType,
  ): Promise<MedicineCatalogue> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    const repo = AppDataSource.getRepository(MedicineCatalogue);
    const med = repo.create({ ...dto, doctorProfileId: profile.id });
    return repo.save(med);
  }

  async getMedicines(userId: string): Promise<MedicineCatalogue[]> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    return AppDataSource.getRepository(MedicineCatalogue).find({
      where: { doctorProfileId: profile.id, isActive: true },
    });
  }

  async updateMedicine(
    id: string,
    userId: string,
    dto: Partial<CreateMedicineDtoType>,
  ): Promise<MedicineCatalogue> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    const repo = AppDataSource.getRepository(MedicineCatalogue);
    const med = await repo.findOne({
      where: { id, doctorProfileId: profile.id },
    });
    if (!med) throw AppError.notFound('Medicine');
    const updated = repo.merge(med, dto);
    return repo.save(updated);
  }

  async deleteMedicine(id: string, userId: string): Promise<void> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    const repo = AppDataSource.getRepository(MedicineCatalogue);
    const med = await repo.findOne({
      where: { id, doctorProfileId: profile.id },
    });
    if (!med) throw AppError.notFound('Medicine');
    med.isActive = false;
    await repo.save(med);
  }

  // Test CRUD
  async createTest(
    userId: string,
    dto: CreateTestDtoType,
  ): Promise<TestCatalogue> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    const repo = AppDataSource.getRepository(TestCatalogue);
    const test = repo.create({ ...dto, doctorProfileId: profile.id });
    return repo.save(test);
  }

  async getTests(userId: string): Promise<TestCatalogue[]> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    return AppDataSource.getRepository(TestCatalogue).find({
      where: { doctorProfileId: profile.id, isActive: true },
    });
  }

  async updateTest(
    id: string,
    userId: string,
    dto: Partial<CreateTestDtoType>,
  ): Promise<TestCatalogue> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    const repo = AppDataSource.getRepository(TestCatalogue);
    const test = await repo.findOne({
      where: { id, doctorProfileId: profile.id },
    });
    if (!test) throw AppError.notFound('Test');
    const updated = repo.merge(test, dto);
    return repo.save(updated);
  }

  async deleteTest(id: string, userId: string): Promise<void> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    const repo = AppDataSource.getRepository(TestCatalogue);
    const test = await repo.findOne({
      where: { id, doctorProfileId: profile.id },
    });
    if (!test) throw AppError.notFound('Test');
    test.isActive = false;
    await repo.save(test);
  }

  // Availability CRUD
  async createAvailability(
    userId: string,
    dto: CreateAvailabilityDtoType,
  ): Promise<DoctorAvailability> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    const repo = AppDataSource.getRepository(DoctorAvailability);
    const avail = new DoctorAvailability();
    avail.doctorProfileId = profile.id;
    avail.dayOfWeek = dto.dayOfWeek as DayOfWeek;
    avail.startTime = dto.startTime;
    avail.endTime = dto.endTime;
    avail.slotDurationMinutes = dto.slotDurationMinutes;
    avail.isActive = true;
    return repo.save(avail);
  }

  async getAvailability(userId: string): Promise<DoctorAvailability[]> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    return AppDataSource.getRepository(DoctorAvailability).find({
      where: { doctorProfileId: profile.id },
      order: { dayOfWeek: 'ASC' },
    });
  }

  async updateAvailability(
    id: string,
    userId: string,
    dto: Partial<CreateAvailabilityDtoType>,
  ): Promise<DoctorAvailability> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    const repo = AppDataSource.getRepository(DoctorAvailability);
    const avail = await repo.findOne({
      where: { id, doctorProfileId: profile.id },
    });
    if (!avail) throw AppError.notFound('Availability slot');
    if (dto.dayOfWeek !== undefined)
      avail.dayOfWeek = dto.dayOfWeek as DayOfWeek;
    if (dto.startTime !== undefined) avail.startTime = dto.startTime;
    if (dto.endTime !== undefined) avail.endTime = dto.endTime;
    if (dto.slotDurationMinutes !== undefined)
      avail.slotDurationMinutes = dto.slotDurationMinutes;
    return repo.save(avail);
  }

  async getPatientHistory(
    doctorUserId: string,
    patientId: string,
  ): Promise<PatientHistory[]> {
    const activeBooking = await AppDataSource.getRepository(Booking).findOne({
      where: [
        { doctorId: doctorUserId, patientId, status: BookingStatus.ACTIVE },
        { doctorId: doctorUserId, patientId, status: BookingStatus.COMPLETED },
      ],
    });
    if (!activeBooking) throw AppError.forbidden();

    return AppDataSource.getRepository(PatientHistory).find({
      where: { userId: patientId },
      order: { createdAt: 'DESC' },
    });
  }

  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
    documentType: DocumentType,
    notes?: string,
  ): Promise<DoctorDocument> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');

    const ext = file.originalname.split('.').pop() ?? 'bin';
    const key = `doctor-documents/${profile.id}/${documentType}-${Date.now()}.${ext}`;
    const fileUrl = await this.storage.upload(key, file.buffer, file.mimetype);

    const repo = AppDataSource.getRepository(DoctorDocument);
    const doc = repo.create({
      doctorProfileId: profile.id,
      documentType,
      fileUrl,
      fileName: file.originalname,
      mimeType: file.mimetype,
      notes,
    });
    return repo.save(doc);
  }

  async getDocuments(userId: string): Promise<DoctorDocument[]> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    return AppDataSource.getRepository(DoctorDocument).find({
      where: { doctorProfileId: profile.id },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteDocument(userId: string, documentId: string): Promise<void> {
    const profile = await AppDataSource.getRepository(DoctorProfile).findOne({
      where: { userId },
    });
    if (!profile) throw AppError.notFound('Doctor profile');
    const repo = AppDataSource.getRepository(DoctorDocument);
    const doc = await repo.findOne({
      where: { id: documentId, doctorProfileId: profile.id },
    });
    if (!doc) throw AppError.notFound('Document');
    await repo.remove(doc);
  }
}
