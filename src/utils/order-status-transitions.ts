import { MedicineOrderStatus } from '../entities/MedicineOrder';
import { AppError } from './app-error';

const FORWARD_TRANSITIONS: Record<MedicineOrderStatus, MedicineOrderStatus[]> =
  {
    [MedicineOrderStatus.PLACED]: [
      MedicineOrderStatus.CONFIRMED,
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
