import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';

// Suggests a restock target using only data every shop already has —
// double the low-stock threshold, or +10 units if no threshold is set.
// Deliberately simple: a real demand-based quantity would need sales
// velocity/seasonality data this platform doesn't collect yet. Shared by
// the daily low-stock alert and the "auto-create purchase orders from low
// stock" action so the number a shop sees in both places always matches.
export function suggestReorderQuantity(item: MedicineShopCatalogItem): number {
  const target = item.lowStockThreshold != null ? item.lowStockThreshold * 2 : item.quantity + 10;
  return Math.max(target - item.quantity, 1);
}

export function isLowStock(item: MedicineShopCatalogItem): boolean {
  return item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold && item.isActive;
}
