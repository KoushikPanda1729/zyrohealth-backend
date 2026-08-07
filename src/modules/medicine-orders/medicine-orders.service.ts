import { injectable } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import {
  MedicineOrder,
  MedicineOrderStatus,
} from '../../entities/MedicineOrder';
import { Prescription } from '../../entities/Prescription';
import { User } from '../../entities/User';
import { AppError } from '../../utils/app-error';
import { assertValidTransition } from '../../utils/order-status-transitions';
import { WhatsAppNotificationService } from '../notifications/whatsapp-notification.service';
import { CreateOrderDtoType } from './medicine-orders.dto';

@injectable()
export class MedicineOrdersService {
  constructor(private readonly whatsapp: WhatsAppNotificationService) {}

  async createOrder(
    patientId: string,
    dto: CreateOrderDtoType,
  ): Promise<MedicineOrder> {
    let doctorId: string | undefined;

    if (dto.prescriptionId) {
      const prescription = await AppDataSource.getRepository(
        Prescription,
      ).findOne({ where: { id: dto.prescriptionId } });
      if (!prescription) throw AppError.notFound('Prescription');
      if (prescription.patientId !== patientId) throw AppError.forbidden();
      doctorId = prescription.doctorId;
    }

    const items = dto.items.map((item) => ({
      ...item,
      subtotalCents: item.quantity * item.unitPriceCents,
    }));
    const totalCents = items.reduce((sum, item) => sum + item.subtotalCents, 0);

    const order = AppDataSource.getRepository(MedicineOrder).create({
      patientId,
      doctorId,
      prescriptionId: dto.prescriptionId,
      items,
      totalCents,
      status: MedicineOrderStatus.PLACED,
      deliveryAddressLine1: dto.deliveryAddressLine1,
      deliveryAddressLine2: dto.deliveryAddressLine2,
      deliveryCity: dto.deliveryCity,
      deliveryState: dto.deliveryState,
      deliveryPincode: dto.deliveryPincode,
      deliveryPhone: dto.deliveryPhone,
      statusHistory: [
        {
          status: MedicineOrderStatus.PLACED,
          at: new Date().toISOString(),
          byUserId: patientId,
        },
      ],
    });
    await AppDataSource.getRepository(MedicineOrder).save(order);

    const patient = await AppDataSource.getRepository(User).findOne({
      where: { id: patientId },
    });
    void this.whatsapp.notifyOrderPlaced(order, patient?.phoneNumber);

    return order;
  }

  async listMyOrders(
    userId: string,
    role: string,
    page: number,
    limit: number,
  ): Promise<{ data: MedicineOrder[]; total: number }> {
    const where =
      role === 'doctor' ? { doctorId: userId } : { patientId: userId };
    const [data, total] = await AppDataSource.getRepository(
      MedicineOrder,
    ).findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async getOrderById(
    id: string,
    userId: string,
    role: string,
  ): Promise<MedicineOrder> {
    const order = await AppDataSource.getRepository(MedicineOrder).findOne({
      where: { id },
    });
    if (!order) throw AppError.notFound('Order');
    if (
      role !== 'admin' &&
      order.patientId !== userId &&
      order.doctorId !== userId
    ) {
      throw AppError.forbidden();
    }
    return order;
  }

  async cancelOrder(
    id: string,
    patientId: string,
    reason?: string,
  ): Promise<MedicineOrder> {
    const repo = AppDataSource.getRepository(MedicineOrder);
    const order = await repo.findOne({ where: { id } });
    if (!order) throw AppError.notFound('Order');
    if (order.patientId !== patientId) throw AppError.forbidden();

    assertValidTransition(order.status, MedicineOrderStatus.CANCELLED);

    order.status = MedicineOrderStatus.CANCELLED;
    order.cancelReason = reason;
    order.cancelledBy = patientId;
    order.statusHistory = [
      ...order.statusHistory,
      {
        status: MedicineOrderStatus.CANCELLED,
        at: new Date().toISOString(),
        byUserId: patientId,
        note: reason,
      },
    ];
    await repo.save(order);

    const patient = await AppDataSource.getRepository(User).findOne({
      where: { id: patientId },
    });
    void this.whatsapp.notifyOrderStatusChanged(
      order,
      patient?.phoneNumber,
      MedicineOrderStatus.CANCELLED,
    );

    return order;
  }
}
