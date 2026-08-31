import { MedicineOrderStatus } from '../entities/MedicineOrder';
import { AppError } from './app-error';

const FORWARD_TRANSITIONS: Record<MedicineOrderStatus, MedicineOrderStatus[]> =
  {
    // PACKED is a valid direct target too, not just CONFIRMED — a COD
    // direct-catalog order (createDirectCatalogOrder) never goes through a
    // separate "payment confirmed" step at all (there's no online payment
    // to confirm), so it sits at PLACED until the shop starts packing it.
    [MedicineOrderStatus.PLACED]: [
      MedicineOrderStatus.CONFIRMED,
      MedicineOrderStatus.PACKED,
      MedicineOrderStatus.CANCELLED,
    ],
    [MedicineOrderStatus.CONFIRMED]: [
      MedicineOrderStatus.PACKED,
      MedicineOrderStatus.CANCELLED,
    ],
    [MedicineOrderStatus.PACKED]: [
      MedicineOrderStatus.PICKED_UP,
      MedicineOrderStatus.CANCELLED,
    ],
    [MedicineOrderStatus.PICKED_UP]: [
      MedicineOrderStatus.OUT_FOR_DELIVERY,
      MedicineOrderStatus.CANCELLED,
    ],
    [MedicineOrderStatus.OUT_FOR_DELIVERY]: [MedicineOrderStatus.DELIVERED],
    [MedicineOrderStatus.DELIVERED]: [],
    [MedicineOrderStatus.CANCELLED]: [],
  };

export function getValidNextStatuses(
  current: MedicineOrderStatus,
): MedicineOrderStatus[] {
  return FORWARD_TRANSITIONS[current];
}

export function assertValidTransition(
  current: MedicineOrderStatus,
  next: MedicineOrderStatus,
): void {
  if (!FORWARD_TRANSITIONS[current].includes(next)) {
    throw AppError.unprocessable(
      `Cannot move order from ${current} to ${next}`,
    );
  }
}
