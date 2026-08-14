import { injectable, inject } from 'tsyringe';
import { In } from 'typeorm';
import {
  WhatsAppFlow,
  WhatsAppFlowNode,
  WhatsAppFlowEdge,
} from '../../entities/WhatsAppFlow';
import { WhatsAppSession, WhatsAppMessageEvent } from '../../entities/WhatsAppSession';
import { AppFlowSession } from '../../entities/AppFlowSession';
import { InteractiveOption } from '../../providers/whatsapp/whatsapp.provider.interface';
import { IAiProvider, Message } from '../../providers/ai/ai.provider.interface';
import { AI_PROVIDER } from '../../config/container';
import { AppDataSource } from '../../config/database';
import { DoctorProfile, ApprovalStatus } from '../../entities/DoctorProfile';
import {
  MedicineOrder,
  MedicineOrderStatus,
  MedicineOrderPaymentStatus,
  MedicineOrderPaymentMethod,
} from '../../entities/MedicineOrder';
import { Booking } from '../../entities/Booking';
import {
  PrescriptionUploadRequest,
  PrescriptionUploadStatus,
} from '../../entities/PrescriptionUploadRequest';
import {
  MedicineShopQuote,
  MedicineShopQuoteStatus,
  QuotedMedicineItem,
} from '../../entities/MedicineShopQuote';
import { MedicineShop } from '../../entities/MedicineShop';
import { User } from '../../entities/User';
import { Tenant } from '../../entities/Tenant';
import { DoctorsService } from '../doctors/doctors.service';
import { BookingsService } from '../bookings/bookings.service';
import { matchOptionIndex } from './match-option.util';
import { formatWhatsAppError } from '../../providers/whatsapp/format-whatsapp-error';
import { WhatsAppProviderResolver } from './whatsapp-provider-resolver.service';
import { MedicineShopAlertsService } from '../medicine-shops/medicine-shop-alerts.service';
import { markSiblingQuotesNotSelected } from '../medicine-shops/quote-processing.util';
import { createOrderFromQuote } from '../medicine-shops/medicine-order.util';
import { MedicineOrderPaymentsService } from '../medicine-order-payments/medicine-order-payments.service';
import { MedicineOrdersService } from '../medicine-orders/medicine-orders.service';
import { getValidNextStatuses } from '../../utils/order-status-transitions';

const MAX_HOPS_PER_TURN = 20;
const MAX_SLOT_OPTIONS = 6;
const MAX_SLOT_SEARCH_DAYS = 14;

type NodeOutcome =
  | { action: 'advance'; nextNodeId: string }
  // silent: true means this poll produced nothing new to say — no
  // message was dispatched on either side, so the caller shouldn't log
  // the inbound "checking" nudge either. Otherwise every manual refresh
  // (or WhatsApp "any message" nudge) piles up a redundant repeat of the
  // same status forever, see executeTrackDelivery/executeAwaitShopQuotes.
  | { action: 'wait'; silent?: boolean }
  | { action: 'handoff' }
  | { action: 'end' };

type FlowMedia = { url: string; mimeType: string } | undefined;

// The minimal shape executeNode/its helpers actually need — both
// WhatsAppSession and AppFlowSession satisfy this structurally, so the
// exact same node-interpretation code drives either channel. Nothing
// channel-specific (phoneNumber, conversationState, ...) belongs here.
interface FlowSession {
  id: string;
  tenantId?: string;
  shopId?: string;
  userId?: string;
  flowVariables: Record<string, unknown>;
  messages: WhatsAppMessageEvent[];
  awaitingHuman: boolean;
  activeFlowId?: string | null;
  flowNodeId?: string | null;
}

// What a node "says" gets handed to a sink instead of dispatched inline —
// this is the one seam that makes the same flow definition work over
// WhatsApp (real messages) or the app (structured JSON steps).
export interface FlowSink {
  sendText(text: string): Promise<void>;
  sendInteractive(
    body: string,
    options: InteractiveOption[],
    listButtonLabel?: string,
  ): Promise<void>;
  // For the 5 prescription-flow node types, which carry richer structured
  // data than plain text/options — WhatsApp's sink no-ops this (it already
  // sent a human-readable message via sendText/sendInteractive above), the
  // app's sink is built entirely around it.
  sendStructured(stepType: string, data: Record<string, unknown>): Promise<void>;
}

export interface AppFlowStep {
  stepType: string;
  data: Record<string, unknown>;
}

// Accumulates every step "sent" during one turn instead of dispatching
// anywhere — this array literally IS the app-facing API response.
export class AppFlowSink implements FlowSink {
  constructor(private readonly session: FlowSession) {}

  readonly steps: AppFlowStep[] = [];

  sendText(text: string): Promise<void> {
    if (text) this.steps.push({ stepType: 'text', data: { text } });
    return Promise.resolve();
  }

  sendInteractive(
    body: string,
    options: InteractiveOption[],
    listButtonLabel?: string,
  ): Promise<void> {
    this.steps.push({ stepType: 'options', data: { text: body, options, listButtonLabel } });
    return Promise.resolve();
  }

  // Also logged as its own message (empty content, just the step) so the
  // rich bubble it renders stays put in chat history — not just visible
  // for the turn it was current, see WhatsAppMessageEvent.step.
  sendStructured(stepType: string, data: Record<string, unknown>): Promise<void> {
    this.steps.push({ stepType, data });
    this.session.messages = [
      ...this.session.messages,
      { role: 'assistant', content: '', timestamp: new Date().toISOString(), step: { stepType, data } },
    ];
    return Promise.resolve();
  }
}

// Wraps the exact same provider-resolve-then-send calls this file always
// made directly — a mechanical extraction, not a behavior change.
class WhatsAppFlowSink implements FlowSink {
  constructor(
    private readonly providerResolver: WhatsAppProviderResolver,
    private readonly session: WhatsAppSession,
  ) {}

  async sendText(text: string): Promise<void> {
    if (!text) return;
    try {
      const provider = await this.providerResolver.resolve(
        this.session.tenantId!,
        this.session.shopId,
      );
      await provider.sendText(this.session.phoneNumber, text);
    } catch (err) {
      console.error(`[WhatsAppFlow] sendText failed: ${formatWhatsAppError(err)}`);
    }
  }

  async sendInteractive(
    body: string,
    options: InteractiveOption[],
    listButtonLabel?: string,
  ): Promise<void> {
    try {
      const provider = await this.providerResolver.resolve(
        this.session.tenantId!,
        this.session.shopId,
      );
      await provider.sendInteractive(this.session.phoneNumber, body, options, listButtonLabel);
    } catch (err) {
      console.error(`[WhatsAppFlow] sendInteractive failed: ${formatWhatsAppError(err)}`);
    }
  }

  // No-op — the app's own step accumulation has no WhatsApp equivalent;
  // the human-readable message already went out via sendText/sendInteractive.
  async sendStructured(): Promise<void> {}
}

function stringifyVar(val: unknown): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return '';
  }
}

function interpolate(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    stringifyVar(vars[key]),
  );
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

@injectable()
export class WhatsAppFlowEngineService {
  constructor(
    @inject(AI_PROVIDER) private readonly ai: IAiProvider,
    private readonly providerResolver: WhatsAppProviderResolver,
    private readonly doctors: DoctorsService,
    private readonly bookings: BookingsService,
    private readonly shopAlerts: MedicineShopAlertsService,
    private readonly medicineOrderPayments: MedicineOrderPaymentsService,
    private readonly medicineOrders: MedicineOrdersService,
  ) {}

  // Returns 'continue' if the session is still mid-flow (or parked waiting for
  // a reply / handed to a human), or 'ended' if the flow reached its `end`
  // node this turn — the caller (whatsapp-bot.service.ts) then hands control
  // back to the hardcoded menu bot for a seamless transition.
  async processInbound(
    session: WhatsAppSession,
    text: string,
    flow: WhatsAppFlow,
    media?: FlowMedia,
  ): Promise<'continue' | 'ended'> {
    const sink = new WhatsAppFlowSink(this.providerResolver, session);
    const { result } = await this.runTurn(session, text, media, flow, sink);
    return result;
  }

  // App-channel counterpart — same turn-loop, same node interpretation,
  // but everything a node "says" gets accumulated into steps instead of
  // sent anywhere. Returns the raw steps for the caller (patient-flow
  // module) to hand back as the API response. `silent` tells the caller
  // this turn produced nothing new to say (a re-poll whose status hasn't
  // changed) — see NodeOutcome's 'wait' variant.
  async processAppTurn(
    session: AppFlowSession,
    text: string,
    flow: WhatsAppFlow,
    media?: FlowMedia,
  ): Promise<{ result: 'continue' | 'ended'; steps: AppFlowStep[]; silent: boolean }> {
    const sink = new AppFlowSink(session);
    const { result, silent } = await this.runTurn(session, text, media, flow, sink);
    return { result, steps: sink.steps, silent };
  }

  private async runTurn(
    session: FlowSession,
    text: string,
    media: FlowMedia,
    flow: WhatsAppFlow,
    sink: FlowSink,
  ): Promise<{ result: 'continue' | 'ended'; silent: boolean }> {
    const nodesById = new Map(flow.definition.nodes.map((n) => [n.id, n]));
    const edgesBySource = new Map<string, WhatsAppFlowEdge[]>();
    for (const edge of flow.definition.edges) {
      const list = edgesBySource.get(edge.source) ?? [];
      list.push(edge);
      edgesBySource.set(edge.source, list);
    }

    const currentFlowNodeId = session.flowNodeId;
    const isResume = Boolean(currentFlowNodeId);
    let currentNode: WhatsAppFlowNode | undefined = currentFlowNodeId
      ? nodesById.get(currentFlowNodeId)
      : flow.definition.nodes.find((n) => n.type === 'start');

    if (!currentNode) {
      session.activeFlowId = null;
      session.flowNodeId = null;
      return { result: 'ended', silent: false };
    }

    let hops = 0;
    let firstHop = true;

    while (currentNode && hops < MAX_HOPS_PER_TURN) {
      hops++;
      const consumeInput = firstHop && isResume;
      firstHop = false;

      const outcome = await this.executeNode(
        session,
        currentNode,
        text,
        media,
        consumeInput,
        edgesBySource.get(currentNode.id) ?? [],
        sink,
      );

      if (outcome.action === 'wait') {
        session.flowNodeId = currentNode.id;
        return { result: 'continue', silent: outcome.silent ?? false };
      }
      if (outcome.action === 'handoff') {
        session.awaitingHuman = true;
        session.flowNodeId = currentNode.id;
        return { result: 'continue', silent: false };
      }
      if (outcome.action === 'end') {
        session.activeFlowId = null;
        session.flowNodeId = null;
        return { result: 'ended', silent: false };
      }
      currentNode = nodesById.get(outcome.nextNodeId);
    }

    if (currentNode) {
      console.warn(
        `[WhatsAppFlow] Depth guard (${MAX_HOPS_PER_TURN} hops) hit for session ${session.id} — pausing at node ${currentNode.id}`,
      );
      session.flowNodeId = currentNode.id;
      return { result: 'continue', silent: false };
    }

    session.activeFlowId = null;
    session.flowNodeId = null;
    return { result: 'ended', silent: false };
  }

  private async executeNode(
    session: FlowSession,
    node: WhatsAppFlowNode,
    inputText: string,
    media: FlowMedia,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    switch (node.type) {
      case 'start':
        return this.advanceTo(outgoing[0]);

      case 'message': {
        const text = interpolate(
          (node.data['text'] as string | undefined) ?? '',
          session.flowVariables,
        );
        await this.dispatchText(session, sink, text);
        return this.advanceTo(outgoing[0]);
      }

      case 'buttons': {
        const options =
          (node.data['options'] as
            | { id: string; label: string }[]
            | undefined) ?? [];

        if (consumeInput) {
          const idx = matchOptionIndex(
            inputText,
            options.map((o) => o.label),
          );
          const matched = idx !== undefined ? options[idx] : undefined;
          const edge = matched
            ? outgoing.find((e) => e.sourceHandle === matched.id)
            : undefined;

          if (matched && edge) {
            return this.advanceTo(edge);
          }
          await this.dispatchOptions(
            session,
            sink,
            (node.data['text'] as string | undefined) ?? '',
            options.map((o) => ({ id: o.id, title: o.label })),
          );
          return { action: 'wait' };
        }

        await this.dispatchOptions(
          session,
          sink,
          (node.data['text'] as string | undefined) ?? '',
          options.map((o) => ({ id: o.id, title: o.label })),
        );
        return { action: 'wait' };
      }

      case 'ai': {
        const history: Message[] = session.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

        const result = await this.ai.chat({
          messages: [...history, { role: 'user', content: inputText }],
          systemPrompt:
            (node.data['systemPrompt'] as string | undefined) ??
            'You are a helpful ZyroHealth assistant. Keep replies short.',
          patientContext: {
            bloodGroup: '',
            allergies: [],
            chronicConditions: [],
            history: [],
          },
          sessionId: session.id,
        });

        this.appendMessage(session, 'user', inputText);
        await this.dispatchText(session, sink, result.reply);

        return outgoing[0] ? this.advanceTo(outgoing[0]) : { action: 'wait' };
      }

      case 'condition': {
        const variablePath =
          (node.data['variablePath'] as string | undefined) ?? '';
        const operator =
          (node.data['operator'] as string | undefined) ?? 'equals';
        const compareValue = node.data['value'];
        const actual = getByPath(session.flowVariables, variablePath);

        let result = false;
        if (operator === 'exists') {
          result = actual !== undefined && actual !== null && actual !== '';
        } else if (operator === 'contains') {
          result = stringifyVar(actual).includes(stringifyVar(compareValue));
        } else {
          result = stringifyVar(actual) === stringifyVar(compareValue);
        }

        const edge = outgoing.find(
          (e) => e.sourceHandle === (result ? 'true' : 'false'),
        );
        return this.advanceTo(edge);
      }

      case 'api_call': {
        try {
          const url = interpolate(
            (node.data['url'] as string | undefined) ?? '',
            session.flowVariables,
          );
          const method = (
            (node.data['method'] as string | undefined) ?? 'GET'
          ).toUpperCase();
          const headers =
            (node.data['headers'] as Record<string, string> | undefined) ?? {};
          const bodyTemplate = node.data['body'] as string | undefined;

          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body:
              bodyTemplate && method !== 'GET'
                ? interpolate(bodyTemplate, session.flowVariables)
                : undefined,
          });
          const json = await res.json().catch(() => ({}));

          const mapping =
            (node.data['responseMapping'] as
              | { variablePath: string; jsonPath: string }[]
              | undefined) ?? [];
          for (const { variablePath, jsonPath } of mapping) {
            session.flowVariables = {
              ...session.flowVariables,
              [variablePath]: getByPath(json, jsonPath),
            };
          }
        } catch (err) {
          console.error(
            `[WhatsAppFlow] api_call node "${node.id}" failed: ${formatWhatsAppError(err)}`,
          );
        }
        return this.advanceTo(outgoing[0]);
      }

      case 'satisfaction': {
        if (consumeInput) {
          const rating = Number(inputText.trim());
          if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
            session.flowVariables = {
              ...session.flowVariables,
              [(node.data['variableName'] as string | undefined) ??
              'satisfaction']: rating,
            };
            return this.advanceTo(outgoing[0]);
          }
          await this.dispatchText(session, sink, 'Please reply with a number from 1 to 5.');
          return { action: 'wait' };
        }
        await this.dispatchText(
          session,
          sink,
          (node.data['text'] as string | undefined) ??
            'How would you rate this? Reply 1-5.',
        );
        return { action: 'wait' };
      }

      case 'handoff': {
        const text = node.data['text'] as string | undefined;
        if (text) await this.dispatchText(session, sink, text);
        return { action: 'handoff' };
      }

      // ── Platform-aware nodes — live app data instead of admin-authored content ──

      case 'platform_specialty_list':
        return this.executeSpecialtyList(session, inputText, consumeInput, outgoing, sink);

      case 'platform_doctor_list':
        return this.executeDoctorList(session, inputText, consumeInput, outgoing, sink);

      case 'platform_slot_list':
        return this.executeSlotList(session, inputText, consumeInput, outgoing, sink);

      case 'platform_consultation_type':
        return this.executeConsultationType(session, inputText, consumeInput, outgoing, sink);

      case 'platform_payment_method':
        return this.executePaymentMethod(session, inputText, consumeInput, outgoing, sink);

      case 'platform_create_booking':
        return this.executeCreateBooking(session, outgoing, sink);

      case 'platform_order_status':
        return this.executeOrderStatus(session, outgoing, sink);

      // ── Prescription-quote-marketplace nodes — channel-agnostic on
      // purpose, see WhatsAppFlowNodeType's doc comment. ─────────────────

      case 'upload_prescription':
        return this.executeUploadPrescription(session, media, consumeInput, outgoing, sink);

      case 'await_shop_quotes':
        return this.executeAwaitShopQuotes(session, outgoing, sink);

      case 'select_quote':
        return this.executeSelectQuote(session, inputText, consumeInput, outgoing, sink);

      case 'order_payment':
        return this.executeOrderPayment(session, inputText, consumeInput, outgoing, sink);

      case 'track_delivery':
        return this.executeTrackDelivery(session, inputText, consumeInput, outgoing, sink);

      case 'end':
      default:
        return { action: 'end' };
    }
  }

  // ── Platform node implementations ─────────────────────────────────

  private async executeSpecialtyList(
    session: FlowSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    const cached = session.flowVariables['__specialtyList'] as
      | string[]
      | undefined;

    if (consumeInput && cached) {
      const idx = matchOptionIndex(inputText, cached);
      const specialty = idx !== undefined ? cached[idx] : undefined;
      if (specialty) {
        session.flowVariables = { ...session.flowVariables, specialty };
        return this.advanceTo(outgoing[0]);
      }
      await this.dispatchOptions(
        session,
        sink,
        'Which specialty do you need?',
        cached.map((s, i) => ({ id: String(i + 1), title: s })),
        'Select',
      );
      return { action: 'wait' };
    }

    const profiles = await AppDataSource.getRepository(DoctorProfile)
      .createQueryBuilder('dp')
      .where('dp.tenant_id = :tenantId', { tenantId: session.tenantId })
      .andWhere('dp.approval_status = :status', {
        status: ApprovalStatus.APPROVED,
      })
      .andWhere('dp.is_available = true')
      .getMany();
    const specialties = [
      ...new Set(
        profiles.map((p) => p.specialty).filter((s): s is string => Boolean(s)),
      ),
    ].sort();

    if (specialties.length === 0) {
      await this.dispatchText(session, sink, 'Sorry, no doctors are available for booking right now.');
      return { action: 'end' };
    }

    session.flowVariables = {
      ...session.flowVariables,
      __specialtyList: specialties,
    };
    await this.dispatchOptions(
      session,
      sink,
      'Which specialty do you need?',
      specialties.map((s, i) => ({ id: String(i + 1), title: s })),
      'Select',
    );
    return { action: 'wait' };
  }

  private async executeDoctorList(
    session: FlowSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    interface DoctorOpt {
      profileId: string;
      userId: string;
      name: string;
      detail: string;
    }
    const cached = session.flowVariables['__doctorList'] as
      | DoctorOpt[]
      | undefined;

    if (consumeInput && cached) {
      const idx = matchOptionIndex(
        inputText,
        cached.map((d) => d.name),
      );
      const doctor = idx !== undefined ? cached[idx] : undefined;
      if (doctor) {
        session.flowVariables = {
          ...session.flowVariables,
          doctorProfileId: doctor.profileId,
          doctorUserId: doctor.userId,
          doctorName: doctor.name,
        };
        return this.advanceTo(outgoing[0]);
      }
      await this.dispatchOptions(
        session,
        sink,
        'Please pick a doctor:',
        cached.map((d, i) => ({
          id: String(i + 1),
          title: d.name,
          description: d.detail,
        })),
        'Select',
      );
      return { action: 'wait' };
    }

    const specialty = session.flowVariables['specialty'] as string | undefined;
    if (!specialty) {
      console.warn(
        '[WhatsAppFlow] platform_doctor_list reached with no "specialty" variable set — add a Specialty List node before it.',
      );
      return { action: 'end' };
    }

    const profiles = await AppDataSource.getRepository(DoctorProfile)
      .createQueryBuilder('dp')
      .leftJoinAndSelect('dp.user', 'user')
      .where('dp.tenant_id = :tenantId', { tenantId: session.tenantId })
      .andWhere('dp.approval_status = :status', {
        status: ApprovalStatus.APPROVED,
      })
      .andWhere('dp.is_available = true')
      .andWhere('dp.specialty = :specialty', { specialty })
      .getMany();

    if (profiles.length === 0) {
      await this.dispatchText(session, sink, `No doctors found for ${specialty} right now.`);
      return { action: 'end' };
    }

    const doctorOptions: DoctorOpt[] = profiles.map((p) => ({
      profileId: p.id,
      userId: p.userId,
      name: p.user?.fullName ?? 'Doctor',
      detail: `₹${Math.round(Number(p.consultationFee ?? 0))} · ${p.yearsOfExperience ?? 0}yrs experience`,
    }));

    session.flowVariables = {
      ...session.flowVariables,
      __doctorList: doctorOptions,
    };
    await this.dispatchOptions(
      session,
      sink,
      `Doctors available for ${specialty}:`,
      doctorOptions.map((d, i) => ({
        id: String(i + 1),
        title: d.name,
        description: d.detail,
      })),
      'Select',
    );
    return { action: 'wait' };
  }

  private async executeSlotList(
    session: FlowSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    interface SlotOpt {
      iso: string;
      label: string;
    }
    const cached = session.flowVariables['__slotList'] as SlotOpt[] | undefined;

    if (consumeInput && cached) {
      const idx = matchOptionIndex(
        inputText,
        cached.map((s) => s.label),
      );
      const slot = idx !== undefined ? cached[idx] : undefined;
      if (slot) {
        session.flowVariables = {
          ...session.flowVariables,
          scheduledAtIso: slot.iso,
          slotLabel: slot.label,
        };
        return this.advanceTo(outgoing[0]);
      }
      await this.dispatchOptions(
        session,
        sink,
        'Please pick a slot:',
        cached.map((s, i) => ({ id: String(i + 1), title: s.label })),
        'Select',
      );
      return { action: 'wait' };
    }

    const doctorProfileId = session.flowVariables['doctorProfileId'] as
      | string
      | undefined;
    if (!doctorProfileId) {
      console.warn(
        '[WhatsAppFlow] platform_slot_list reached with no "doctorProfileId" variable set — add a Doctor List node before it.',
      );
      return { action: 'end' };
    }

    const slotOptions: SlotOpt[] = [];
    const now = Date.now();
    for (
      let dayOffset = 0;
      dayOffset < MAX_SLOT_SEARCH_DAYS && slotOptions.length < MAX_SLOT_OPTIONS;
      dayOffset++
    ) {
      const date = new Date();
      date.setDate(date.getDate() + dayOffset);
      const slots = await this.doctors.getAvailableSlots(
        session.tenantId!,
        doctorProfileId,
        date,
      );
      for (const slot of slots) {
        if (!slot.available) continue;
        const [h, m] = slot.startTime.split(':').map(Number);
        const slotDate = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          h ?? 0,
          m ?? 0,
        );
        if (slotDate.getTime() <= now) continue;
        slotOptions.push({
          iso: slotDate.toISOString(),
          label: `${slotDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}, ${slot.startTime}`,
        });
        if (slotOptions.length >= MAX_SLOT_OPTIONS) break;
      }
    }

    if (slotOptions.length === 0) {
      await this.dispatchText(session, sink, `No upcoming slots found in the next ${MAX_SLOT_SEARCH_DAYS} days.`);
      return { action: 'end' };
    }

    session.flowVariables = {
      ...session.flowVariables,
      __slotList: slotOptions,
    };
    await this.dispatchOptions(
      session,
      sink,
      'Available slots:',
      slotOptions.map((s, i) => ({ id: String(i + 1), title: s.label })),
      'Select',
    );
    return { action: 'wait' };
  }

  private async executeConsultationType(
    session: FlowSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    const titles = ['Video Call', 'In-Person Visit'];
    if (consumeInput) {
      const idx = matchOptionIndex(inputText, titles);
      if (idx !== undefined) {
        session.flowVariables = {
          ...session.flowVariables,
          consultationType: idx === 0 ? 'video' : 'offline',
        };
        return this.advanceTo(outgoing[0]);
      }
    }
    await this.dispatchOptions(
      session,
      sink,
      'How would you like to consult?',
      titles.map((t, i) => ({ id: String(i + 1), title: t })),
    );
    return { action: 'wait' };
  }

  private async executePaymentMethod(
    session: FlowSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    const titles = ['Pay Online', 'Pay Offline'];
    if (consumeInput) {
      const idx = matchOptionIndex(inputText, titles);
      if (idx !== undefined) {
        session.flowVariables = {
          ...session.flowVariables,
          payOnline: idx === 0,
        };
        return this.advanceTo(outgoing[0]);
      }
    }
    await this.dispatchOptions(session, sink, 'How would you like to pay?', [
      {
        id: '1',
        title: 'Pay Online',
        description: 'Get a secure payment link now',
      },
      {
        id: '2',
        title: 'Pay Offline',
        description: 'Pay at the clinic during your visit',
      },
    ]);
    return { action: 'wait' };
  }

  private async executeCreateBooking(
    session: FlowSession,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    const vars = session.flowVariables;
    const doctorProfileId = vars['doctorProfileId'] as string | undefined;
    const scheduledAtIso = vars['scheduledAtIso'] as string | undefined;
    const consultationType = vars['consultationType'] as
      | 'video'
      | 'offline'
      | undefined;
    const payOnline = vars['payOnline'] as boolean | undefined;

    if (!doctorProfileId || !scheduledAtIso || !consultationType) {
      await this.dispatchText(
        session,
        sink,
        'Something went wrong building your booking — missing required details. Please start over.',
      );
      return this.advanceTo(outgoing[0]);
    }

    if (!session.userId) {
      await this.dispatchText(
        session,
        sink,
        `I couldn't find a ZyroHealth account linked to this number, so I can't complete the booking. Please sign up in the app first with this same phone number.`,
      );
      return this.advanceTo(outgoing[0]);
    }

    try {
      await this.bookings.createBooking(
        session.userId,
        {
          doctorId: doctorProfileId,
          scheduledAt: scheduledAtIso,
          consultationType,
        },
        { skipPaymentLink: payOnline === false },
      );
      await this.dispatchText(
        session,
        sink,
        payOnline === false
          ? `✅ Booking confirmed! You can pay at the clinic during your visit.`
          : `✅ Booking confirmed! Check the message above for your payment link to secure it.`,
      );
    } catch (err) {
      await this.dispatchText(
        session,
        sink,
        `Sorry, I couldn't complete that booking (${err instanceof Error ? err.message : 'please try again'}).`,
      );
    }

    return this.advanceTo(outgoing[0]);
  }

  private async executeOrderStatus(
    session: FlowSession,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    if (!session.userId) {
      await this.dispatchText(session, sink, `I couldn't find a ZyroHealth account linked to this number.`);
      return this.advanceTo(outgoing[0]);
    }

    const [order] = await AppDataSource.getRepository(MedicineOrder).find({
      where: { patientId: session.userId },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    const [booking] = await AppDataSource.getRepository(Booking).find({
      where: { patientId: session.userId },
      order: { createdAt: 'DESC' },
      take: 1,
    });

    if (!order && !booking) {
      await this.dispatchText(session, sink, `You don't have any medicine orders or bookings yet.`);
      return this.advanceTo(outgoing[0]);
    }

    const lines: string[] = [];
    if (order) {
      lines.push(
        `📦 Latest medicine order: *${order.status.replace(/_/g, ' ')}* (${order.items.length} item${order.items.length === 1 ? '' : 's'})`,
      );
    }
    if (booking) {
      lines.push(
        `🩺 Latest booking: *${booking.status}* — scheduled ${booking.scheduledAt.toLocaleString('en-IN')}`,
      );
    }
    await this.dispatchText(session, sink, lines.join('\n'));
    return this.advanceTo(outgoing[0]);
  }

  // ── Prescription-quote-marketplace node implementations ─────────────
  // Same real entities/services the WhatsApp-only hardcoded state machine
  // (whatsapp-bot.service.ts) uses — this is a second, channel-agnostic
  // front door onto the exact same backend pipeline, not a parallel one.

  private async executeUploadPrescription(
    session: FlowSession,
    media: FlowMedia,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    if (!session.userId) {
      await this.dispatchText(
        session,
        sink,
        `I couldn't find a ZyroHealth account linked to this number — please sign up first.`,
      );
      return { action: 'end' };
    }

    if (!consumeInput || !media) {
      await sink.sendStructured('upload_prescription', {});
      await this.dispatchText(session, sink, 'Please send a photo of your prescription.');
      return { action: 'wait' };
    }

    const request = await AppDataSource.getRepository(PrescriptionUploadRequest).save(
      AppDataSource.getRepository(PrescriptionUploadRequest).create({
        tenantId: session.tenantId,
        patientId: session.userId,
        imageUrl: media.url,
        status: PrescriptionUploadStatus.PENDING_DISPATCH,
        dispatchedShopIds: [],
      }),
    );
    session.flowVariables = { ...session.flowVariables, requestId: request.id };
    await this.dispatchText(session, sink, `Got it, we'll get you a quote shortly.`);
    return this.advanceTo(outgoing[0]);
  }

  // A poll node, not a one-shot step — re-checks the request's status on
  // every turn it's parked at, so both a WhatsApp "any message" nudge and
  // an app poll naturally re-evaluate whether quotes are ready yet.
  private async executeAwaitShopQuotes(
    session: FlowSession,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    const requestId = session.flowVariables['requestId'] as string | undefined;
    if (!requestId) {
      await this.dispatchText(session, sink, `Something went wrong — no prescription request on file. Please start over.`);
      return { action: 'end' };
    }

    const request = await AppDataSource.getRepository(PrescriptionUploadRequest).findOne({
      where: { id: requestId },
    });
    if (!request) {
      await this.dispatchText(session, sink, `Something went wrong finding your request. Please start over.`);
      return { action: 'end' };
    }

    // A quote being submitted isn't the same as the patient being allowed
    // to act on it — that only happens once staff explicitly releases it,
    // either by picking one for the patient (SENT_TO_PATIENT, via
    // AdminService.selectQuote) or opening it up for the patient to choose
    // among several (AWAITING_PATIENT_CHOICE, via letPatientChooseQuote).
    // Advancing on "any quote submitted" would let a patient pick from
    // quotes staff hasn't reviewed yet — same gate the WhatsApp path has
    // always respected.
    const submittedCount = await AppDataSource.getRepository(MedicineShopQuote).count({
      where: { requestId, status: MedicineShopQuoteStatus.SUBMITTED },
    });
    const ready =
      request.status === PrescriptionUploadStatus.SENT_TO_PATIENT ||
      request.status === PrescriptionUploadStatus.AWAITING_PATIENT_CHOICE;
    if (ready) {
      await sink.sendStructured('await_shop_quotes', { status: request.status, quotesReady: submittedCount });
      return this.advanceTo(outgoing[0]);
    }

    // Same "don't repeat what hasn't changed" treatment as
    // executeTrackDelivery — a re-poll that's still just as unready as
    // last time doesn't need to say so again.
    const lastAnnounced = session.flowVariables['lastAnnouncedAwaitState'] as string | undefined;
    const currentState = `${request.status}:${submittedCount}`;
    const changed = lastAnnounced !== currentState;
    if (changed) {
      session.flowVariables = { ...session.flowVariables, lastAnnouncedAwaitState: currentState };
      await sink.sendStructured('await_shop_quotes', { status: request.status, quotesReady: submittedCount });
      await this.dispatchText(session, sink, `Still finalizing your quote — we'll let you know the moment it's ready.`);
    }
    return { action: 'wait', silent: !changed };
  }

  private async executeSelectQuote(
    session: FlowSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    interface QuoteOpt {
      quoteId: string;
      requestId: string;
      shopName: string;
      totalCents: number;
      items: QuotedMedicineItem[];
      submittedVia: string | null;
      requestRef: string;
      tenantName: string;
      quoteDate: string | null;
    }
    const requestId = session.flowVariables['requestId'] as string | undefined;
    if (!requestId) {
      await this.dispatchText(session, sink, `Something went wrong — no prescription request on file.`);
      return { action: 'end' };
    }

    const cached = session.flowVariables['__quoteList'] as QuoteOpt[] | undefined;

    if (consumeInput && cached) {
      // Accept either a numbered reply (WhatsApp) or the raw quoteId itself
      // (app UI sends the exact id the user tapped) — one node, two input
      // styles. With exactly one quote (staff already picked it — see
      // below), a plain affirmative also confirms it, since "1" only
      // matching a menu that doesn't visibly exist would be confusing —
      // but this must be an actual yes, not ANY reply: a status-check
      // nudge like "checking" isn't a confirmation and must never be
      // silently treated as one.
      const affirmatives = ['yes', 'y', 'ok', 'okay', 'confirm', 'confirmed', 'sure', 'continue'];
      const byId = cached.find((q) => q.quoteId === inputText.trim());
      const idx = byId ? undefined : matchOptionIndex(inputText, cached.map((q) => q.shopName));
      const isAffirmative = affirmatives.includes(inputText.trim().toLowerCase());
      const chosen =
        byId ?? (idx !== undefined ? cached[idx] : cached.length === 1 && isAffirmative ? cached[0] : undefined);

      if (chosen) {
        const requestRepo = AppDataSource.getRepository(PrescriptionUploadRequest);
        const request = await requestRepo.findOne({ where: { id: requestId } });
        if (request) {
          request.status = PrescriptionUploadStatus.SENT_TO_PATIENT;
          request.chosenQuoteId = chosen.quoteId;
          await requestRepo.save(request);
          await markSiblingQuotesNotSelected(requestId, chosen.quoteId, this.shopAlerts);
        }
        session.flowVariables = { ...session.flowVariables, chosenQuoteId: chosen.quoteId };
        return this.advanceTo(outgoing[0]);
      }

      // An unrelated nudge (e.g. a "checking" poll typed while this prompt
      // is still pending) shouldn't re-show the exact same prompt every
      // time — only the first no-match retry repeats it.
      const alreadyShown = session.flowVariables['selectQuoteRetryShown'] === true;
      if (!alreadyShown) {
        session.flowVariables = { ...session.flowVariables, selectQuoteRetryShown: true };
        if (cached.length === 1) {
          const only = cached[0];
          await this.dispatchText(
            session,
            sink,
            `Your pharmacy has been confirmed:\n\n${only.shopName} — ₹${(only.totalCents / 100).toFixed(2)}\n\nTap below to continue.`,
          );
        } else {
          await this.dispatchOptions(
            session,
            sink,
            'Please pick a pharmacy:',
            cached.map((q) => ({
              id: q.quoteId,
              title: q.shopName,
              description: `₹${(q.totalCents / 100).toFixed(2)}`,
            })),
            'Choose',
          );
        }
        await sink.sendStructured('select_quote', { quotes: cached, singleChoice: cached.length === 1 });
      }
      return { action: 'wait', silent: alreadyShown };
    }

    // Only proceed once staff has actually released this request to the
    // patient — either picking one quote for them (SENT_TO_PATIENT, see
    // AdminService.selectQuote) or opening it up to choose among several
    // (AWAITING_PATIENT_CHOICE, see letPatientChooseQuote). A quote merely
    // sitting SUBMITTED isn't staff's decision yet; executeAwaitShopQuotes
    // already gates on this same pair of statuses before advancing here.
    const request = await AppDataSource.getRepository(PrescriptionUploadRequest).findOne({
      where: { id: requestId },
    });
    const singleChoice =
      request?.status === PrescriptionUploadStatus.SENT_TO_PATIENT && Boolean(request.chosenQuoteId);
    const patientChoice = request?.status === PrescriptionUploadStatus.AWAITING_PATIENT_CHOICE;
    if (!singleChoice && !patientChoice) {
      await this.dispatchText(session, sink, `Still finalizing your quote — we'll let you know the moment it's ready.`);
      return { action: 'wait' };
    }

    const quotes = await AppDataSource.getRepository(MedicineShopQuote).find({
      where: singleChoice
        ? { id: request?.chosenQuoteId, requestId }
        : { requestId, status: MedicineShopQuoteStatus.SUBMITTED },
    });
    if (quotes.length === 0) {
      await this.dispatchText(session, sink, `No quotes have come in yet.`);
      return { action: 'wait' };
    }

    const [shops, tenant] = await Promise.all([
      AppDataSource.getRepository(MedicineShop).findBy({ id: In(quotes.map((q) => q.shopId)) }),
      session.tenantId
        ? AppDataSource.getRepository(Tenant).findOne({ where: { id: session.tenantId } })
        : Promise.resolve(null),
    ]);
    const shopNameById = new Map(shops.map((s) => [s.id, s.name]));

    const requestRef = requestId.slice(0, 8).toUpperCase();
    const quoteOptions: QuoteOpt[] = quotes.map((q) => ({
      quoteId: q.id,
      requestId,
      shopName: shopNameById.get(q.shopId) ?? 'Pharmacy',
      totalCents: q.totalCents ?? 0,
      items: q.items ?? [],
      submittedVia: q.submittedVia ?? null,
      requestRef,
      tenantName: tenant?.name ?? 'ZyroHealth',
      quoteDate: q.submittedAt?.toISOString() ?? null,
    }));

    session.flowVariables = { ...session.flowVariables, __quoteList: quoteOptions };
    if (singleChoice) {
      // Nothing to pick between — staff already chose this one. A numbered
      // list here would read like a menu of options that don't exist.
      const only = quoteOptions[0];
      await this.dispatchText(
        session,
        sink,
        `Your pharmacy has been confirmed:\n\n${only.shopName} — ₹${(only.totalCents / 100).toFixed(2)}\n\nTap below to continue.`,
      );
    } else {
      await this.dispatchOptions(
        session,
        sink,
        `You've got ${quoteOptions.length} quotes — reply with a number to choose:`,
        quoteOptions.map((q) => ({
          id: q.quoteId,
          title: q.shopName,
          description: `₹${(q.totalCents / 100).toFixed(2)}`,
        })),
        'Choose',
      );
    }
    await sink.sendStructured('select_quote', { quotes: quoteOptions, singleChoice });
    return { action: 'wait' };
  }

  private async executeOrderPayment(
    session: FlowSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    const requestId = session.flowVariables['requestId'] as string | undefined;
    const chosenQuoteId = session.flowVariables['chosenQuoteId'] as string | undefined;
    if (!requestId || !chosenQuoteId) {
      await this.dispatchText(session, sink, `Something went wrong — no chosen quote on file.`);
      return { action: 'end' };
    }

    // Tracks which of this node's own sub-questions (address, then payment
    // method) the last turn was actually waiting on, so a reply is only
    // ever matched against the question that was asked — an address reply
    // can't accidentally get parsed as a payment-method choice, or vice
    // versa, just because both happen to share this one flow node.
    const awaiting = session.flowVariables['awaitingOrderInput'] as string | undefined;

    let deliveryAddress = session.flowVariables['deliveryAddress'] as string | undefined;
    if (!deliveryAddress) {
      if (consumeInput && awaiting === 'address' && inputText.trim()) {
        deliveryAddress = inputText.trim();
        session.flowVariables = { ...session.flowVariables, deliveryAddress };
      } else {
        session.flowVariables = { ...session.flowVariables, awaitingOrderInput: 'address' };
        await sink.sendStructured('order_payment', { awaitingAddress: true });
        await this.dispatchText(
          session,
          sink,
          'Please reply with your full delivery address (house/street, city, state, pincode) so we can ship it.',
        );
        return { action: 'wait' };
      }
    }

    let paymentMethod = session.flowVariables['paymentMethod'] as MedicineOrderPaymentMethod | undefined;
    if (!paymentMethod) {
      if (consumeInput && awaiting === 'paymentMethod') {
        const idx = matchOptionIndex(inputText, ['Pay Online', 'Cash on Delivery']);
        if (idx === 0) paymentMethod = MedicineOrderPaymentMethod.ONLINE;
        else if (idx === 1) paymentMethod = MedicineOrderPaymentMethod.COD;
      }
      if (!paymentMethod) {
        session.flowVariables = { ...session.flowVariables, awaitingOrderInput: 'paymentMethod' };
        await this.dispatchOptions(
          session,
          sink,
          'How would you like to pay?',
          [
            { id: 'online', title: 'Pay Online', description: 'Card / UPI, right now' },
            { id: 'cod', title: 'Cash on Delivery', description: 'Pay when it arrives' },
          ],
          'Choose',
        );
        await sink.sendStructured('order_payment', { awaitingPaymentMethod: true });
        return { action: 'wait' };
      }
      session.flowVariables = { ...session.flowVariables, paymentMethod };
    }

    let orderId = session.flowVariables['orderId'] as string | undefined;
    if (!orderId) {
      const [request, quote] = await Promise.all([
        AppDataSource.getRepository(PrescriptionUploadRequest).findOne({ where: { id: requestId } }),
        AppDataSource.getRepository(MedicineShopQuote).findOne({ where: { id: chosenQuoteId } }),
      ]);
      if (!request || !quote) {
        await this.dispatchText(session, sink, `Something went wrong finding your order details.`);
        return { action: 'end' };
      }

      // Looked up from the User record rather than a channel-specific
      // "session phone number" — the one thing both WhatsApp and app
      // sessions can rely on identically, since both are tied to a real
      // userId.
      const patientUser = session.userId
        ? await AppDataSource.getRepository(User).findOne({ where: { id: session.userId } })
        : null;

      const order = await createOrderFromQuote({
        request,
        quote,
        deliveryAddress,
        deliveryPhone: patientUser?.phoneNumber ?? '',
        sourceNote: 'Created from a channel-agnostic prescription-flow quote',
        shopAlerts: this.shopAlerts,
        paymentMethod,
      });
      request.status = PrescriptionUploadStatus.CONFIRMED;
      request.resultingOrderId = order.id;
      await AppDataSource.getRepository(PrescriptionUploadRequest).save(request);
      session.flowVariables = { ...session.flowVariables, orderId: order.id };
      orderId = order.id;
    }

    if (paymentMethod === MedicineOrderPaymentMethod.COD) {
      // Nothing to collect online — the order is already placed, go
      // straight to tracking.
      await this.dispatchText(session, sink, `Order confirmed — pay by cash on delivery. We'll keep you posted.`);
      return this.advanceTo(outgoing[0]);
    }

    // Online — don't advance until Stripe's webhook actually confirms
    // payment (MedicineOrderPaymentsService.processWebhookEvent flips
    // paymentStatus to PAID). Every re-entry here (an "I've paid" tap or
    // any other nudge) re-checks the real order row rather than trusting
    // the tap itself — same poll shape executeAwaitShopQuotes already uses.
    const order = await AppDataSource.getRepository(MedicineOrder).findOne({ where: { id: orderId } });
    if (!order) {
      await this.dispatchText(session, sink, `Something went wrong finding your order.`);
      return { action: 'end' };
    }
    if (order.paymentStatus === MedicineOrderPaymentStatus.PAID) {
      return this.advanceTo(outgoing[0]);
    }

    // A genuine cancel request — the patient's own order, so this is the
    // same patient-scoped MedicineOrdersService.cancelOrder the regular
    // order-management UI uses, not a separate path.
    if (consumeInput && inputText.trim().toLowerCase() === 'cancel' && session.userId) {
      try {
        await this.medicineOrders.cancelOrder(order.id, session.userId, 'Cancelled by patient before payment');
        await this.dispatchText(session, sink, `Order cancelled. Send a new prescription photo whenever you're ready.`);
      } catch (err) {
        console.error(`[WhatsAppFlow] Failed to cancel order ${order.id}: ${formatWhatsAppError(err)}`);
        await this.dispatchText(session, sink, `Couldn't cancel that order — please contact support.`);
      }
      return { action: 'end' };
    }

    // "checking" is the app's own passive poll (pull-to-refresh/auto-poll,
    // see patient-flow.service.ts) — silent when nothing's new is correct
    // there. Anything else reaching this node is an explicit action (an
    // "I've paid" tap, a WhatsApp nudge) and must never be met with total
    // silence, even if the checkout link hasn't changed — that reads as
    // the button being broken.
    const isPassivePoll = consumeInput && inputText.trim().toLowerCase() === 'checking';

    try {
      const { url } = await this.medicineOrderPayments.createCheckoutForOrder(order);
      const lastAnnounced = session.flowVariables['lastAnnouncedCheckoutUrl'] as string | undefined;
      const changed = lastAnnounced !== url;
      const shouldAnnounce = changed || !isPassivePoll;
      if (shouldAnnounce) {
        session.flowVariables = { ...session.flowVariables, lastAnnouncedCheckoutUrl: url };
        await sink.sendStructured('order_payment', {
          orderId: order.id,
          totalCents: order.totalCents,
          checkoutUrl: url,
        });
        await this.dispatchText(
          session,
          sink,
          changed
            ? `Almost there! Please pay ₹${(order.totalCents / 100).toFixed(2)} to place this order:\n${url}`
            : `Still waiting for your payment to be confirmed. If you've already paid, this can take a moment to reflect — otherwise use the link above.`,
        );
      }
      return { action: 'wait', silent: !shouldAnnounce };
    } catch (err) {
      console.error(`[WhatsAppFlow] Failed to create checkout session for order ${order.id}: ${formatWhatsAppError(err)}`);
      await this.dispatchText(
        session,
        sink,
        `Your order was saved, but something went wrong creating the payment link. Please contact support.`,
      );
      return { action: 'wait' };
    }
  }

  private async executeTrackDelivery(
    session: FlowSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
    sink: FlowSink,
  ): Promise<NodeOutcome> {
    const orderId = session.flowVariables['orderId'] as string | undefined;
    if (!orderId) {
      await this.dispatchText(session, sink, `No order on file to track yet.`);
      return { action: 'end' };
    }

    const order = await AppDataSource.getRepository(MedicineOrder).findOne({ where: { id: orderId } });
    if (!order) {
      await this.dispatchText(session, sink, `Couldn't find that order.`);
      return { action: 'end' };
    }

    if (
      consumeInput &&
      inputText.trim().toLowerCase() === 'cancel' &&
      session.userId &&
      getValidNextStatuses(order.status).includes(MedicineOrderStatus.CANCELLED)
    ) {
      try {
        await this.medicineOrders.cancelOrder(order.id, session.userId, 'Cancelled by patient');
        await this.dispatchText(session, sink, `Order cancelled. Send a new prescription photo whenever you're ready.`);
      } catch (err) {
        console.error(`[WhatsAppFlow] Failed to cancel order ${order.id}: ${formatWhatsAppError(err)}`);
        await this.dispatchText(session, sink, `Couldn't cancel that order — please contact support.`);
      }
      return { action: 'end' };
    }

    // "checking" is the app's own passive poll — silent when nothing's
    // new is correct there. Anything else reaching this node is an
    // explicit action and must always get a response, even if the status
    // hasn't moved, same reasoning as executeOrderPayment.
    const isPassivePoll = consumeInput && inputText.trim().toLowerCase() === 'checking';
    const lastAnnounced = session.flowVariables['lastAnnouncedOrderStatus'] as string | undefined;
    const changed = lastAnnounced !== order.status;
    const shouldAnnounce = changed || !isPassivePoll;
    if (shouldAnnounce) {
      session.flowVariables = { ...session.flowVariables, lastAnnouncedOrderStatus: order.status };
      await sink.sendStructured('track_delivery', {
        status: order.status,
        paymentStatus: order.paymentStatus,
      });
      await this.dispatchText(session, sink, `📦 Order status: *${order.status.replace(/_/g, ' ')}*`);
    }

    // Both are terminal — staying parked here after either would mean
    // silently swallowing every message forever once "changed" goes false
    // (nothing to announce, and no way to ever leave this node). Ending
    // resets activeFlowId/flowNodeId, so the very next message naturally
    // starts a fresh prescription request instead of getting stuck.
    if (
      order.status === MedicineOrderStatus.DELIVERED ||
      order.status === MedicineOrderStatus.CANCELLED
    ) {
      return { action: 'end' };
    }
    if (!outgoing[0]) return { action: 'end' };
    return { action: 'wait', silent: !shouldAnnounce };
  }

  // ── Shared helpers ─────────────────────────────────────────────────

  private advanceTo(edge?: WhatsAppFlowEdge): NodeOutcome {
    if (!edge) return { action: 'end' };
    return { action: 'advance', nextNodeId: edge.target };
  }

  private async dispatchText(session: FlowSession, sink: FlowSink, text: string): Promise<void> {
    if (!text) return;
    this.appendMessage(session, 'assistant', text);
    await sink.sendText(text);
  }

  private async dispatchOptions(
    session: FlowSession,
    sink: FlowSink,
    body: string,
    options: InteractiveOption[],
    listButtonLabel?: string,
  ): Promise<void> {
    const textLog =
      `${body}\n\n` +
      options
        .map(
          (o, i) =>
            `${i + 1}) ${o.title}${o.description ? ` — ${o.description}` : ''}`,
        )
        .join('\n');
    this.appendMessage(session, 'assistant', textLog);
    await sink.sendInteractive(body, options, listButtonLabel);
  }

  private appendMessage(
    session: FlowSession,
    role: 'user' | 'assistant' | 'admin',
    content: string,
  ): void {
    session.messages = [
      ...session.messages,
      { role, content, timestamp: new Date().toISOString() },
    ];
  }
}
