import { injectable } from 'tsyringe';
import { In } from 'typeorm';
import { AppDataSource } from '../../config/database';
import {
  MedicineOrder,
  MedicineOrderPaymentStatus,
  MedicineOrderStatus,
  OrderedMedicineItem,
} from '../../entities/MedicineOrder';
import { MedicineShop } from '../../entities/MedicineShop';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import { Prescription } from '../../entities/Prescription';
import { User } from '../../entities/User';
import { AppError } from '../../utils/app-error';
import { assertValidTransition } from '../../utils/order-status-transitions';
import { PaymentRedirectPlatform } from '../../utils/payment-redirect.util';
import { WhatsAppNotificationService } from '../notifications/whatsapp-notification.service';
import { MedicineOrderPaymentsService } from '../medicine-order-payments/medicine-order-payments.service';
import { CreateOrderDtoType } from './medicine-orders.dto';

@injectable()
export class MedicineOrdersService {
  constructor(
    private readonly whatsapp: WhatsAppNotificationService,
    private readonly medicineOrderPayments: MedicineOrderPaymentsService,
  ) {}

  async createOrder(
    patientId: string,
    dto: CreateOrderDtoType,
  ): Promise<MedicineOrder> {
    return AppDataSource.transaction(async (manager) => {
      let doctorId: string | undefined;

      if (dto.prescriptionId) {
        const prescription = await manager
          .getRepository(Prescription)
          .findOne({ where: { id: dto.prescriptionId } });
        if (!prescription) throw AppError.notFound('Prescription');
        if (prescription.patientId !== patientId) throw AppError.forbidden();
        doctorId = prescription.doctorId;
      }

      let shopId: string | undefined;
      let tenantId: string | undefined;
      let items: OrderedMedicineItem[] = dto.items.map((item) => ({
        ...item,
        subtotalCents: item.quantity * item.unitPriceCents,
      }));

      // A direct pharmacy purchase (browsing a shop's real catalogue,
      // not the WhatsApp prescription-quote flow) — re-derive the
      // authoritative price and reserve stock from the catalogue itself
      // rather than trusting whatever unitPriceCents the client sent, and
      // lock each row so two concurrent checkouts can't oversell the same
      // stock.
      if (dto.shopId) {
        const shop = await manager
          .getRepository(MedicineShop)
          .findOne({ where: { id: dto.shopId, isActive: true } });
        if (!shop) throw AppError.notFound('Pharmacy');
        shopId = shop.id;
        tenantId = shop.tenantId;

        const catalogRepo = manager.getRepository(MedicineShopCatalogItem);
        const resolved: OrderedMedicineItem[] = [];
        for (const item of dto.items) {
          if (!item.catalogItemId) {
            resolved.push({ ...item, subtotalCents: item.quantity * item.unitPriceCents });
            continue;
          }
          const catalogItem = await catalogRepo.findOne({
            where: { id: item.catalogItemId, shopId: shop.id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!catalogItem || !catalogItem.isActive) {
            throw AppError.badRequest(`"${item.name}" is no longer available`);
          }
          if (catalogItem.quantity < item.quantity) {
            throw AppError.unprocessable(
              `Only ${catalogItem.quantity} left of "${catalogItem.name}"`,
            );
          }
          catalogItem.quantity -= item.quantity;
          await catalogRepo.save(catalogItem);
          resolved.push({
            name: catalogItem.name,
            genericName: item.genericName,
            quantity: item.quantity,
            unitPriceCents: catalogItem.priceCents,
            subtotalCents: item.quantity * catalogItem.priceCents,
            catalogItemId: catalogItem.id,
          });
        }
        items = resolved;
      }

      const totalCents = items.reduce((sum, item) => sum + item.subtotalCents, 0);

      const order = manager.getRepository(MedicineOrder).create({
        patientId,
        doctorId,
        prescriptionId: dto.prescriptionId,
        shopId,
        tenantId,
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
      await manager.getRepository(MedicineOrder).save(order);

      const patient = await manager
        .getRepository(User)
        .findOne({ where: { id: patientId } });
      void this.whatsapp.notifyOrderPlaced(order, patient?.phoneNumber);

      return order;
    });
  }

  async initiatePayment(
    orderId: string,
    patientId: string,
    platform: PaymentRedirectPlatform,
  ): Promise<{ url: string; paymentId: string }> {
    const order = await AppDataSource.getRepository(MedicineOrder).findOne({
      where: { id: orderId },
    });
    if (!order) throw AppError.notFound('Order');
    if (order.patientId !== patientId) throw AppError.forbidden();
    if (order.paymentStatus === MedicineOrderPaymentStatus.PAID) {
      throw AppError.unprocessable('Order is already paid');
    }
    if (order.totalCents <= 0) {
      throw AppError.unprocessable('Nothing to pay for this order');
    }
    return this.medicineOrderPayments.createCheckoutForOrder(order, platform);
  }

  // A cart spanning several pharmacies creates one order per shop
  // client-side (see createOrder — each call is scoped to one shopId), then
  // pays for all of them together in a single checkout here.
  async initiateGroupPayment(
    orderIds: string[],
    patientId: string,
    platform: PaymentRedirectPlatform,
  ): Promise<{ url: string; paymentId: string }> {
    const orders = await AppDataSource.getRepository(MedicineOrder).findBy({
      id: In(orderIds),
    });
    if (orders.length !== orderIds.length) {
      throw AppError.notFound('One or more orders not found');
    }
    for (const order of orders) {
      if (order.patientId !== patientId) throw AppError.forbidden();
      if (order.paymentStatus === MedicineOrderPaymentStatus.PAID) {
        throw AppError.unprocessable('One or more orders are already paid');
      }
    }
    const totalCents = orders.reduce((sum, order) => sum + order.totalCents, 0);
    if (totalCents <= 0) {
      throw AppError.unprocessable('Nothing to pay for these orders');
    }
    return this.medicineOrderPayments.createCheckoutForOrderGroup(orders, platform);
  }

  // No relation from MedicineOrder to MedicineShop — same batch "hydrate"
  // pattern used elsewhere (doctors' tenant name, bookings' doctor
  // profile) so the patient sees which pharmacy is fulfilling the order.
  // Orders from the WhatsApp prescription-quote flow have no shopId set
  // for some paths either, so this is a no-op there.
  private async hydrateShopNames<T extends { shopId?: string }>(
    orders: T[],
  ): Promise<(T & { shopName?: string })[]> {
    const shopIds = [
      ...new Set(orders.map((o) => o.shopId).filter((id): id is string => Boolean(id))),
    ];
    if (shopIds.length === 0) return orders;
    const shops = await AppDataSource.getRepository(MedicineShop).findBy({
      id: In(shopIds),
    });
    const byId = new Map(shops.map((s) => [s.id, s.name]));
    return orders.map((o) => ({
      ...o,
      shopName: o.shopId ? byId.get(o.shopId) : undefined,
    }));
  }

  async listMyOrders(
    userId: string,
    role: string,
    page: number,
    limit: number,
  ): Promise<{
    data: (MedicineOrder & { shopName?: string })[];
    total: number;
  }> {
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
    return { data: await this.hydrateShopNames(data), total };
  }

  async getOrderById(
    id: string,
    userId: string,
    role: string,
  ): Promise<MedicineOrder & { shopName?: string }> {
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
    const [hydrated] = await this.hydrateShopNames([order]);
    return hydrated;
  }

  async cancelOrder(
    id: string,
    patientId: string,
    reason?: string,
  ): Promise<MedicineOrder> {
    const order = await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(MedicineOrder);
      const order = await repo.findOne({ where: { id } });
      if (!order) throw AppError.notFound('Order');
      if (order.patientId !== patientId) throw AppError.forbidden();

      assertValidTransition(order.status, MedicineOrderStatus.CANCELLED);

      // Restore any stock a direct pharmacy purchase reserved at order
      // time — otherwise a cancelled order permanently vanishes that
      // stock from the shop's catalogue.
      const catalogRepo = manager.getRepository(MedicineShopCatalogItem);
      for (const item of order.items) {
        if (!item.catalogItemId) continue;
        const catalogItem = await catalogRepo.findOne({
          where: { id: item.catalogItemId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!catalogItem) continue;
        catalogItem.quantity += item.quantity;
        await catalogRepo.save(catalogItem);
      }

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
      return repo.save(order);
    });

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
