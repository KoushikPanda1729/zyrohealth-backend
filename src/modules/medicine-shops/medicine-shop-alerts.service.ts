import { injectable } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { MedicineShop } from '../../entities/MedicineShop';
import { MedicineShopCatalogItem } from '../../entities/MedicineShopCatalogItem';
import { MedicineShopCatalogItemBatch } from '../../entities/MedicineShopCatalogItemBatch';
import { WhatsAppSession } from '../../entities/WhatsAppSession';
import { WhatsAppProviderResolver } from '../whatsapp/whatsapp-provider-resolver.service';
import { formatWhatsAppError } from '../../providers/whatsapp/format-whatsapp-error';
import { suggestReorderQuantity } from './reorder.util';

const EXPIRY_WINDOW_DAYS = 30;
// Re-alert cadence — a shop that ignores a warning shouldn't get the same
// item flagged every single day; once a week is enough to stay useful
// without becoming noise (same problem the pre-existing order-triggered
// low-stock alert has today, since it has no cooldown at all).
const ALERT_COOLDOWN_DAYS = 7;

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Runs daily (see server.ts's cron registration) to catch what the
// event-driven low-stock alert (whatsapp-bot.service.ts, fires only when
// stock crosses its threshold via an order) can't: items nobody has
// ordered in a while, and expiry — which nothing previously read at all.
@injectable()
export class MedicineShopAlertsService {
  constructor(private readonly providerResolver: WhatsAppProviderResolver) {}

  // Shared low-level sender — same constraint as every other WhatsApp
  // outbound message in this codebase: only reaches a shop that's linked
  // AND has an open session (WhatsApp's 24h free-form-message rule), and
  // never throws past this method so one shop's send failure can't stop
  // the rest of the batch.
  async sendShopMessage(shop: MedicineShop, text: string): Promise<boolean> {
    if (!shop.whatsappLinked) return false;
    const sessionRepo = AppDataSource.getRepository(WhatsAppSession);
    const session = await sessionRepo.findOne({
      where: { phoneNumber: shop.contactPhone, tenantId: shop.tenantId },
    });
    if (!session) return false;

    try {
      const provider = await this.providerResolver.resolve(shop.tenantId);
      await provider.sendText(shop.contactPhone, text);
    } catch (err) {
      console.error(`[MedicineShopAlerts] Failed to send to ${shop.id}: ${formatWhatsAppError(err)}`);
      return false;
    }

    session.messages = [
      ...session.messages,
      { role: 'assistant', content: text, timestamp: new Date().toISOString() },
    ];
    session.lastMessageAt = new Date();
    await sessionRepo.save(session);
    return true;
  }

  async runExpiryAlerts(): Promise<{ shopsNotified: number; itemsFlagged: number }> {
    const repo = AppDataSource.getRepository(MedicineShopCatalogItem);
    const items = await repo
      .createQueryBuilder('item')
      .where('item.expiry_date IS NOT NULL')
      .andWhere('item.expiry_date <= :cutoff', { cutoff: daysFromNow(EXPIRY_WINDOW_DAYS) })
      .andWhere('item.is_active = true')
      .andWhere(
        '(item.last_expiry_alert_at IS NULL OR item.last_expiry_alert_at <= :cooldown)',
        { cooldown: daysAgo(ALERT_COOLDOWN_DAYS) },
      )
      .getMany();

    return this.notifyByShop(items, repo, (grouped) => {
      const lines = grouped
        .map((i) => `- ${i.name} (batch ${i.batchNumber ?? '—'}): expires ${i.expiryDate}`)
        .join('\n');
      return `⏳ Expiry alert!\n\n${lines}\n\nConsider marking these down or returning them to your distributor before they lapse.`;
    }, (item) => { item.lastExpiryAlertAt = new Date(); });
  }

  // Same idea as runExpiryAlerts but over the batches table (see
  // MedicineShopCatalogItemBatch) — a shop tracking multiple batches of
  // the same medicine with different expiry dates would otherwise never
  // get warned about the older batch, since the parent catalog item's own
  // scalar expiryDate only ever reflects one of them.
  async runBatchExpiryAlerts(): Promise<{ shopsNotified: number; itemsFlagged: number }> {
    const batchRepo = AppDataSource.getRepository(MedicineShopCatalogItemBatch);
    const batches = await batchRepo
      .createQueryBuilder('batch')
      .where('batch.expiry_date IS NOT NULL')
      .andWhere('batch.expiry_date <= :cutoff', { cutoff: daysFromNow(EXPIRY_WINDOW_DAYS) })
      .andWhere('batch.quantity > 0')
      .andWhere(
        '(batch.last_expiry_alert_at IS NULL OR batch.last_expiry_alert_at <= :cooldown)',
        { cooldown: daysAgo(ALERT_COOLDOWN_DAYS) },
      )
      .getMany();

    return this.notifyByShop(batches, batchRepo, (grouped) => {
      const lines = grouped
        .map((b) => `- Batch ${b.batchNumber ?? '—'} (${b.quantity} units): expires ${b.expiryDate}`)
        .join('\n');
      return `⏳ Batch expiry alert!\n\n${lines}\n\nConsider marking these down or returning them to your distributor before they lapse.`;
    }, (batch) => { batch.lastExpiryAlertAt = new Date(); });
  }

  async runLowStockAlerts(): Promise<{ shopsNotified: number; itemsFlagged: number }> {
    const repo = AppDataSource.getRepository(MedicineShopCatalogItem);
    const items = await repo
      .createQueryBuilder('item')
      .where('item.low_stock_threshold IS NOT NULL')
      .andWhere('item.quantity <= item.low_stock_threshold')
      .andWhere('item.is_active = true')
      .andWhere(
        '(item.last_low_stock_alert_at IS NULL OR item.last_low_stock_alert_at <= :cooldown)',
        { cooldown: daysAgo(ALERT_COOLDOWN_DAYS) },
      )
      .getMany();

    return this.notifyByShop(items, repo, (grouped) => {
      const lines = grouped
        .map((i) => `- ${i.name}: ${i.quantity} ${i.unit} left — suggest reordering ${suggestReorderQuantity(i)} ${i.unit}`)
        .join('\n');
      return `⚠️ Low stock alert!\n\n${lines}\n\nUpdate your quantities in the shop portal once you restock.`;
    }, (item) => { item.lastLowStockAlertAt = new Date(); });
  }

  // Generic over MedicineShopCatalogItem and MedicineShopCatalogItemBatch
  // — both are "a thing with a shopId that can be alerted on and stamped
  // with a cooldown," and the grouping/send/save mechanics are identical.
  private async notifyByShop<T extends { shopId: string }>(
    items: T[],
    repo: { save(entities: T[]): Promise<T[]> },
    buildMessage: (items: T[]) => string,
    markAlerted: (item: T) => void,
  ): Promise<{ shopsNotified: number; itemsFlagged: number }> {
    if (items.length === 0) return { shopsNotified: 0, itemsFlagged: 0 };

    const byShop = new Map<string, T[]>();
    for (const item of items) {
      const list = byShop.get(item.shopId) ?? [];
      list.push(item);
      byShop.set(item.shopId, list);
    }

    const shopRepo = AppDataSource.getRepository(MedicineShop);
    let shopsNotified = 0;

    for (const [shopId, grouped] of byShop) {
      const shop = await shopRepo.findOne({ where: { id: shopId } });
      if (!shop) continue;
      const sent = await this.sendShopMessage(shop, buildMessage(grouped));
      // Mark alerted even if the send failed to avoid retry-storming a
      // shop that's simply not linked/has no open session — it'll pick
      // back up next time they message in, same as every other WhatsApp
      // notification in this codebase.
      grouped.forEach(markAlerted);
      await repo.save(grouped);
      if (sent) shopsNotified++;
    }

    return { shopsNotified, itemsFlagged: items.length };
  }
}
