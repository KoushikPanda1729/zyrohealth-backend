import { injectable, inject } from 'tsyringe';
import { AppDataSource } from '../../config/database';
import { AppFlowSession } from '../../entities/AppFlowSession';
import { WhatsAppFlow } from '../../entities/WhatsAppFlow';
import { WhatsAppFlowEngineService, AppFlowStep } from '../whatsapp/whatsapp-flow-engine.service';
import { AppError } from '../../utils/app-error';
import { PrescriptionUploadRequest } from '../../entities/PrescriptionUploadRequest';
import { MedicineShopQuote, MedicineShopQuoteStatus } from '../../entities/MedicineShopQuote';
import { Tenant } from '../../entities/Tenant';
import { MedicineShop } from '../../entities/MedicineShop';
import { buildQuoteReceiptPdf } from '../../utils/quote-receipt-pdf';
import { IStorageProvider } from '../../providers/storage/storage.provider.interface';
import { STORAGE_PROVIDER } from '../../config/container';

// App-channel counterpart to whatsapp-bot.service.ts's processInboundMessage
// — same "find the tenant's active flow, drive one turn, persist the
// session" shape, minus everything WhatsApp-specific (no phone number, no
// hardcoded menu/booking/AI state machine — the app channel is purely
// flow-builder driven, same as a standalone shop's own WhatsApp module).
@injectable()
export class PatientFlowService {
  constructor(
    private readonly flowEngine: WhatsAppFlowEngineService,
    @inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  async reply(
    userId: string,
    tenantId: string,
    text: string,
    media?: { url: string; mimeType: string },
  ): Promise<{ result: 'continue' | 'ended'; steps: AppFlowStep[]; awaitingHuman: boolean }> {
    const sessionRepo = AppDataSource.getRepository(AppFlowSession);
    let session = await sessionRepo.findOne({ where: { userId, tenantId } });
    if (!session) {
      session = sessionRepo.create({
        userId,
        tenantId,
        awaitingHuman: false,
        messages: [],
        flowVariables: {},
      });
    }

    if (session.awaitingHuman) {
      // Mirrors processInboundMessage's same guard — a staff member is
      // handling this manually; the flow stays silent until resumed. This
      // is a real inbound message (to a human), so it's always logged.
      this.appendUserMessage(session, text, media);
      await sessionRepo.save(session);
      return { result: 'continue', steps: [], awaitingHuman: true };
    }

    const activeFlow = await AppDataSource.getRepository(WhatsAppFlow).findOne({
      where: { isActive: true, tenantId },
    });
    if (!activeFlow) {
      throw AppError.notFound('No active flow configured for this tenant yet');
    }

    if (session.activeFlowId !== activeFlow.id) {
      session.activeFlowId = activeFlow.id;
      session.flowNodeId = null;
      session.flowVariables = {};
    }

    // The literal poll nudge the app's pull-to-refresh/auto-poll sends
    // (see flow_session_provider.dart's refresh()) — a synthetic UI
    // action, not something the patient actually typed, so it never
    // belongs in the transcript even on a turn that DOES produce a new
    // announcement (e.g. quotes just became ready).
    const isSilentPoll = text.trim().toLowerCase() === 'checking';

    // The inbound message isn't logged until after the turn runs — a
    // silent re-poll (status unchanged, see NodeOutcome's 'wait' variant)
    // shouldn't leave behind a "checking" bubble with no reply either,
    // same as the assistant side already skips repeating itself.
    const messagesBeforeTurn = session.messages.length;
    const { result, steps, silent } = await this.flowEngine.processAppTurn(
      session,
      text,
      activeFlow,
      media,
    );

    if (!silent) {
      if (!isSilentPoll) {
        this.appendUserMessage(session, text, media, messagesBeforeTurn);
      }
      session.lastSteps = steps;
    }
    session.lastMessageAt = new Date();
    await sessionRepo.save(session);

    return { result, steps, awaitingHuman: session.awaitingHuman };
  }

  // Inserted at `atIndex` (defaulting to the end) rather than always
  // appended, so it can be placed BEFORE whatever assistant messages the
  // turn itself already logged while running — the inbound message has to
  // read first in the transcript, and reply() only learns whether to log
  // it at all after the turn has already run.
  private appendUserMessage(
    session: AppFlowSession,
    text: string,
    media: { url: string; mimeType: string } | undefined,
    atIndex?: number,
  ): void {
    const message = {
      role: 'user' as const,
      content: text,
      timestamp: new Date().toISOString(),
      mediaUrl: media?.url,
      mimeType: media?.mimeType,
    };
    const messages = [...session.messages];
    messages.splice(atIndex ?? messages.length, 0, message);
    session.messages = messages;
  }

  // Lets the chat screen rebuild itself on open/resume — full message
  // history for the bubble thread, plus the last turn's structured steps
  // for whichever rich bubble (quote list, pay button, tracking) is still
  // pending a reply.
  async history(
    userId: string,
    tenantId: string,
  ): Promise<{ messages: AppFlowSession['messages']; lastSteps: AppFlowStep[]; awaitingHuman: boolean }> {
    const session = await AppDataSource.getRepository(AppFlowSession).findOne({
      where: { userId, tenantId },
    });
    if (!session) {
      return { messages: [], lastSteps: [], awaitingHuman: false };
    }
    return {
      messages: session.messages,
      lastSteps: session.lastSteps,
      awaitingHuman: session.awaitingHuman,
    };
  }

  // Same printable receipt the admin/shop portal generates — the patient
  // gets the real document (itemized lines, ref, QR), not a re-styled
  // copy, so what they see matches what the pharmacy actually prints.
  // Built on demand rather than eagerly for every quote shown, since most
  // quotes a patient sees never get opened as a PDF.
  async getQuoteReceiptUrl(
    userId: string,
    tenantId: string,
    requestId: string,
    quoteId: string,
  ): Promise<string> {
    const request = await AppDataSource.getRepository(PrescriptionUploadRequest).findOne({
      where: { id: requestId, tenantId, patientId: userId },
    });
    if (!request) throw AppError.notFound('Prescription request');

    const quote = await AppDataSource.getRepository(MedicineShopQuote).findOne({
      where: { id: quoteId, requestId },
    });
    if (!quote) throw AppError.notFound('Quote');
    if (quote.status !== MedicineShopQuoteStatus.SUBMITTED) {
      throw AppError.badRequest('Only a submitted quote has a receipt to view');
    }

    const [tenant, shop] = await Promise.all([
      AppDataSource.getRepository(Tenant).findOne({ where: { id: tenantId } }),
      AppDataSource.getRepository(MedicineShop).findOne({ where: { id: quote.shopId } }),
    ]);

    const buffer = await buildQuoteReceiptPdf({
      tenantName: tenant?.name ?? 'ZyroHealth',
      shopName: shop?.name,
      requestId: request.id,
      quoteDate: quote.submittedAt,
      items: quote.items,
      totalCents: quote.totalCents,
      submittedVia: quote.submittedVia,
      status: quote.status,
    });

    const key = `quote-receipts/${tenantId}/${quoteId}.pdf`;
    await this.storage.upload(key, buffer, 'application/pdf');
    return this.storage.getSignedUrl(key, 3600);
  }
}
