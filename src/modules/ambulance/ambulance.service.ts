import { injectable } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { AmbulanceRequest, AmbulanceRequestStatus } from '../../entities/AmbulanceRequest';
import { Hospital } from '../../entities/Hospital';
import { AppError } from '../../utils/app-error';
import { CreateAmbulanceRequestDtoType } from './ambulance.dto';

@injectable()
export class AmbulanceService {
  async createRequest(
    patientId: string,
    dto: CreateAmbulanceRequestDtoType,
  ): Promise<AmbulanceRequest> {
    const hospital = await AppDataSource.getRepository(Hospital).findOne({
      where: { id: dto.hospitalId, isActive: true },
    });
    if (!hospital) throw AppError.notFound('Hospital');

    const repo = AppDataSource.getRepository(AmbulanceRequest);
    return repo.save(
      repo.create({
        tenantId: hospital.tenantId,
        hospitalId: hospital.id,
        patientId,
        pickupAddress: dto.pickupAddress,
        pickupLatitude: dto.pickupLatitude,
        pickupLongitude: dto.pickupLongitude,
        contactPhone: dto.contactPhone,
        notes: dto.notes,
        status: AmbulanceRequestStatus.REQUESTED,
      }),
    );
  }

  // Attaches a lightweight hospital projection to each request — the
  // mobile "My Requests" list shows the hospital's name/phone, not just
  // the raw hospitalId.
  private async hydrateHospital(
    requests: AmbulanceRequest[],
  ): Promise<(AmbulanceRequest & { hospital: { name: string; contactPhone: string } | null })[]> {
    if (requests.length === 0) return [];
    const hospitalIds = [...new Set(requests.map((r) => r.hospitalId))];
    const hospitals = await AppDataSource.getRepository(Hospital).find({
      where: hospitalIds.map((id) => ({ id })),
    });
    const byId = new Map(hospitals.map((h) => [h.id, h]));
    return requests.map((r) => {
      const hospital = byId.get(r.hospitalId);
      return {
        ...r,
        hospital: hospital ? { name: hospital.name, contactPhone: hospital.contactPhone } : null,
      };
    });
  }

  async listMyRequests(
    patientId: string,
    page: number,
    limit: number,
  ): Promise<{
    data: (AmbulanceRequest & { hospital: { name: string; contactPhone: string } | null })[];
    total: number;
  }> {
    const [data, total] = await AppDataSource.getRepository(AmbulanceRequest).findAndCount({
      where: { patientId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: await this.hydrateHospital(data), total };
  }

  async getRequestById(
    id: string,
    patientId: string,
  ): Promise<AmbulanceRequest & { hospital: { name: string; contactPhone: string } | null }> {
    const request = await AppDataSource.getRepository(AmbulanceRequest).findOne({
      where: { id },
    });
    if (!request) throw AppError.notFound('Ambulance request');
    if (request.patientId !== patientId) throw AppError.forbidden();
    const [hydrated] = await this.hydrateHospital([request]);
    return hydrated;
  }

  async cancelRequest(
    id: string,
    patientId: string,
    reason?: string,
  ): Promise<AmbulanceRequest> {
    const repo = AppDataSource.getRepository(AmbulanceRequest);
    const request = await repo.findOne({ where: { id } });
    if (!request) throw AppError.notFound('Ambulance request');
    if (request.patientId !== patientId) throw AppError.forbidden();
    if (
      request.status === AmbulanceRequestStatus.COMPLETED ||
      request.status === AmbulanceRequestStatus.CANCELLED
    ) {
      throw AppError.unprocessable(`Request is already ${request.status}`);
    }

    request.status = AmbulanceRequestStatus.CANCELLED;
    request.cancelReason = reason;
    request.resolvedAt = new Date();
    return repo.save(request);
  }
}
