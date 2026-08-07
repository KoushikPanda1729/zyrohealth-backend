import { injectable, inject } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { Prescription } from '../../entities/Prescription';
import { Booking, BookingStatus } from '../../entities/Booking';
import { PatientProfile } from '../../entities/PatientProfile';
import { User } from '../../entities/User';
import { ChatMessage, MessageType } from '../../entities/ChatMessage';
import {
  PatientHistory,
  HistoryEntryType,
} from '../../entities/PatientHistory';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { STORAGE_PROVIDER } from '../../config/container';
import { AppError } from '../../utils/app-error';
import { checkAllergyConflicts } from '../../utils/allergy-checker';
import { buildPrescriptionPdf } from '../../utils/pdf-generator';
import { io } from '../../socket';
import { CreatePrescriptionDtoType } from './prescriptions.dto';
import { v4 as uuidv4 } from 'uuid';
import { WhatsAppNotificationService } from '../notifications/whatsapp-notification.service';

@injectable()
export class PrescriptionsService {
  constructor(
    @inject(STORAGE_PROVIDER)
    private readonly storageProvider: IStorageProvider,
    private readonly whatsapp: WhatsAppNotificationService,
  ) {}

  async createPrescription(
    doctorId: string,
    dto: CreatePrescriptionDtoType,
  ): Promise<Prescription> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: dto.bookingId, doctorId },
      relations: ['patient'],
    });
    if (!booking) throw AppError.notFound('Booking');

    // DTO fields allow `null` (clients often pass through nullable catalogue
    // columns as-is) — normalize to `undefined` here so downstream code only
    // ever deals with one "absent" representation.
    const diagnosis = dto.diagnosis ?? undefined;
    const notes = dto.notes ?? undefined;
    const medicines = dto.medicines.map((m) => ({
      ...m,
      genericName: m.genericName ?? undefined,
      notes: m.notes ?? undefined,
    }));
    const tests = dto.tests.map((t) => ({
      ...t,
      category: t.category ?? undefined,
      instructions: t.instructions ?? undefined,
    }));

    if (
      booking.status !== BookingStatus.ACTIVE &&
      booking.status !== BookingStatus.COMPLETED &&
      booking.status !== BookingStatus.PAID
    ) {
      throw AppError.unprocessable(
        'Booking must be active or completed to prescribe',
      );
    }

    const patientProfile = await AppDataSource.getRepository(
      PatientProfile,
    ).findOne({
      where: { userId: booking.patientId },
    });

    if (!dto.confirmedAllergyOverride && patientProfile?.allergies.length) {
      const conflicts = checkAllergyConflicts(
        medicines,
        patientProfile.allergies,
      );
      if (conflicts.length > 0) {
        throw AppError.unprocessable(
          `Allergy conflicts detected: ${conflicts
            .map((c) => `${c.medicine} → ${c.allergen}`)
            .join(', ')}. Set confirmedAllergyOverride: true to proceed.`,
        );
      }
    }

    const doctor = await AppDataSource.getRepository(User).findOne({
      where: { id: doctorId },
      relations: ['doctorProfile'],
    });

    const pdfBuffer = await buildPrescriptionPdf({
      doctorName: doctor?.fullName ?? 'Doctor',
      licenseNumber: doctor?.doctorProfile?.licenseNumber,
      patientName: booking.patient?.fullName ?? 'Patient',
      bloodGroup: patientProfile?.bloodGroup,
      bookingReference: booking.id,
      date: new Date(),
      diagnosis,
      notes,
      medicines,
      tests,
    });

    const pdfKey = `prescriptions/${uuidv4()}.pdf`;
    const pdfUrl = await this.storageProvider.upload(
      pdfKey,
      pdfBuffer,
      'application/pdf',
    );

    const prescription = AppDataSource.getRepository(Prescription).create({
      tenantId: booking.tenantId,
      bookingId: dto.bookingId,
      doctorId,
      patientId: booking.patientId,
      diagnosis,
      notes,
      medicines,
      tests,
      pdfUrl,
      confirmedAllergyOverride: dto.confirmedAllergyOverride,
    });

    const saved =
      await AppDataSource.getRepository(Prescription).save(prescription);

    // Append to patient history
    const history = AppDataSource.getRepository(PatientHistory).create({
      userId: booking.patientId,
      entryType: HistoryEntryType.PRESCRIPTION,
      summary: `Prescription issued. Diagnosis: ${dto.diagnosis ?? 'N/A'}. Medicines: ${dto.medicines.map((m) => m.name).join(', ')}`,
      referenceId: saved.id,
      detectedSymptoms: [],
    });
    await AppDataSource.getRepository(PatientHistory).save(history);

    return saved;
  }

  async listByDoctor(
    doctorId: string,
    page: number,
    limit: number,
  ): Promise<{ data: Prescription[]; total: number }> {
    const [data, total] = await AppDataSource.getRepository(
      Prescription,
    ).findAndCount({
      where: { doctorId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['booking'],
    });
    return { data, total };
  }

  async getPrescriptionById(
    id: string,
    userId: string,
    role?: string,
    tenantId?: string,
  ): Promise<Prescription> {
    const prescription = await AppDataSource.getRepository(
      Prescription,
    ).findOne({
      where: { id },
      relations: [
        'booking',
        'booking.doctor',
        'booking.patient',
        'booking.doctor.doctorProfile',
      ],
    });
    if (!prescription) throw AppError.notFound('Prescription');
    const isTenantAdmin =
      role === 'admin' && tenantId && prescription.tenantId === tenantId;
    if (
      !isTenantAdmin &&
      prescription.patientId !== userId &&
      prescription.doctorId !== userId
    ) {
      throw AppError.forbidden();
    }
    return prescription;
  }

  async getPdfSignedUrl(
    id: string,
    userId: string,
    role?: string,
    tenantId?: string,
  ): Promise<string> {
    const prescription = await AppDataSource.getRepository(
      Prescription,
    ).findOne({ where: { id } });
    if (!prescription) throw AppError.notFound('Prescription');
    const isTenantAdmin =
      role === 'admin' && tenantId && prescription.tenantId === tenantId;
    if (
      !isTenantAdmin &&
      prescription.patientId !== userId &&
      prescription.doctorId !== userId
    ) {
      throw AppError.forbidden();
    }
    if (!prescription.pdfUrl)
      throw AppError.badRequest('PDF not generated for this prescription');
    const match = prescription.pdfUrl.match(/\.amazonaws\.com\/(.+)$/);
    if (!match) throw AppError.badRequest('Invalid PDF URL');
    return this.storageProvider.getSignedUrl(match[1], 3600);
  }

  async regeneratePdf(id: string, doctorId: string): Promise<Prescription> {
    const prescription = await AppDataSource.getRepository(
      Prescription,
    ).findOne({
      where: { id, doctorId },
      relations: ['booking'],
    });
    if (!prescription) throw AppError.notFound('Prescription');

    const doctor = await AppDataSource.getRepository(User).findOne({
      where: { id: doctorId },
      relations: ['doctorProfile'],
    });

    const patientProfile = await AppDataSource.getRepository(
      PatientProfile,
    ).findOne({
      where: { userId: prescription.patientId },
    });

    const patient = await AppDataSource.getRepository(User).findOne({
      where: { id: prescription.patientId },
    });

    const pdfBuffer = await buildPrescriptionPdf({
      doctorName: doctor?.fullName ?? 'Doctor',
      licenseNumber: doctor?.doctorProfile?.licenseNumber,
      patientName: patient?.fullName ?? 'Patient',
      bloodGroup: patientProfile?.bloodGroup,
      bookingReference: prescription.bookingId,
      date: new Date(),
      diagnosis: prescription.diagnosis,
      notes: prescription.notes,
      medicines: prescription.medicines,
      tests: prescription.tests,
    });

    const pdfKey = `prescriptions/${uuidv4()}.pdf`;
    const pdfUrl = await this.storageProvider.upload(
      pdfKey,
      pdfBuffer,
      'application/pdf',
    );
    prescription.pdfUrl = pdfUrl;

    return AppDataSource.getRepository(Prescription).save(prescription);
  }

  async sendPrescription(id: string, doctorId: string): Promise<void> {
    const prescription = await AppDataSource.getRepository(
      Prescription,
    ).findOne({
      where: { id, doctorId },
    });
    if (!prescription) throw AppError.notFound('Prescription');

    const summaryLines = [
      `📋 PRESCRIPTION`,
      `Diagnosis: ${prescription.diagnosis ?? 'N/A'}`,
      `Medicines: ${prescription.medicines.map((m) => `${m.name} ${m.dosage} ${m.frequency} x ${m.duration}`).join('; ')}`,
      `Tests: ${prescription.tests.map((t) => t.name).join(', ') || 'None'}`,
    ];

    const msg = AppDataSource.getRepository(ChatMessage).create({
      bookingId: prescription.bookingId,
      senderId: doctorId,
      type: MessageType.PRESCRIPTION,
      content: summaryLines.join('\n'),
      fileUrl: prescription.pdfUrl,
    });

    const saved = await AppDataSource.getRepository(ChatMessage).save(msg);
    prescription.isSent = true;
    await AppDataSource.getRepository(Prescription).save(prescription);

    io.to(prescription.bookingId).emit('new_message', saved);

    const patient = await AppDataSource.getRepository(User).findOne({
      where: { id: prescription.patientId },
    });
    void this.whatsapp.notifyPrescriptionSent(
      prescription.tenantId!,
      patient?.phoneNumber,
    );
  }
}
