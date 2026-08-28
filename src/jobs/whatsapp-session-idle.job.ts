import cron from 'node-cron';
import { LessThan, Not } from 'typeorm';
import { container } from 'tsyringe';
import { AppDataSource } from '../config/database';
import {
  WhatsAppSession,
  WhatsAppConversationState,
} from '../entities/WhatsAppSession';
import { WhatsAppProviderResolver } from '../modules/whatsapp/whatsapp-provider-resolver.service';
import { formatWhatsAppError } from '../providers/whatsapp/format-whatsapp-error';

const IDLE_MINUTES = 15;
const CLOSE_MESSAGE =
  'We\'re closing this conversation due to inactivity. Kindly start again by typing "hi" 🙂';

// Runs every 5 minutes — finds patient conversations that have gone quiet
// for 15+ minutes and haven't already been closed, sends a heads-up, and
// resets their flow state so their next message (any message, not
// strictly "hi" — see WhatsAppConversationState.CLOSED's existing
// showMenu handling) starts clean instead of resuming stale mid-flow
// state. Skips awaitingHuman sessions — a human agent's own live
// conversation shouldn't get interrupted by the bot.
export function scheduleWhatsAppSessionIdleCloser(): void {
  cron.schedule('*/5 * * * *', () => {
    void closeIdleWhatsAppSessionsOnce();
  });
}

export async function closeIdleWhatsAppSessionsOnce(): Promise<void> {
  const repo = AppDataSource.getRepository(WhatsAppSession);
  const cutoff = new Date(Date.now() - IDLE_MINUTES * 60 * 1000);

  const idleSessions = await repo.find({
    where: {
      lastMessageAt: LessThan(cutoff),
      conversationState: Not(WhatsAppConversationState.CLOSED),
      awaitingHuman: false,
    },
  });
  if (idleSessions.length === 0) return;

  const resolver = container.resolve(WhatsAppProviderResolver);
  let notified = 0;

  for (const session of idleSessions) {
    if (session.tenantId) {
      try {
        const provider = await resolver.resolve(session.tenantId, session.shopId);
        await provider.sendText(session.phoneNumber, CLOSE_MESSAGE);
        session.messages.push({
          role: 'assistant',
          content: CLOSE_MESSAGE,
          timestamp: new Date().toISOString(),
        });
        notified++;
      } catch (err) {
        console.error(
          `[WhatsAppSessionIdle] Failed to notify ${session.phoneNumber}: ${formatWhatsAppError(err)}`,
        );
      }
    }
    session.conversationState = WhatsAppConversationState.CLOSED;
    session.flowNodeId = null;
    session.flowVariables = {};
  }

  await repo.save(idleSessions);
  console.log(
    `[WhatsAppSessionIdle] Closed ${idleSessions.length} idle session(s), notified ${notified}.`,
  );
}
