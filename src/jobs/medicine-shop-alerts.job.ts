import cron from 'node-cron';
import { container } from 'tsyringe';
import { MedicineShopAlertsService } from '../modules/medicine-shops/medicine-shop-alerts.service';

// Daily at 08:00 server time — catches what the event-driven low-stock
// alert (fires only when an order crosses a threshold) can't: expiring
// batches, and stock that's been low for a while with no order to trigger
// a notification. See medicine-shop-alerts.service.ts for the alerting
// logic and its per-item cooldown.
export function scheduleMedicineShopAlerts(): void {
  cron.schedule('0 8 * * *', () => {
    void runMedicineShopAlertsOnce();
  });
}

export async function runMedicineShopAlertsOnce(): Promise<void> {
  const service = container.resolve(MedicineShopAlertsService);
  try {
    const expiry = await service.runExpiryAlerts();
    const batchExpiry = await service.runBatchExpiryAlerts();
    const lowStock = await service.runLowStockAlerts();
    console.log(
      `[MedicineShopAlerts] expiry: ${expiry.itemsFlagged} items / ${expiry.shopsNotified} shops notified; ` +
        `batch expiry: ${batchExpiry.itemsFlagged} batches / ${batchExpiry.shopsNotified} shops notified; ` +
        `low-stock: ${lowStock.itemsFlagged} items / ${lowStock.shopsNotified} shops notified`,
    );
  } catch (err) {
    console.error('[MedicineShopAlerts] Daily job failed:', err);
  }
}
