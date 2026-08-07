import { injectable, inject } from 'tsyringe';
import {
  WhatsAppFlow,
  WhatsAppFlowNode,
  WhatsAppFlowEdge,
} from '../../entities/WhatsAppFlow';
import { WhatsAppSession } from '../../entities/WhatsAppSession';
import { InteractiveOption } from '../../providers/whatsapp/whatsapp.provider.interface';
import { IAiProvider, Message } from '../../providers/ai/ai.provider.interface';
import { AI_PROVIDER } from '../../config/container';
import { AppDataSource } from '../../config/database';
import { DoctorProfile, ApprovalStatus } from '../../entities/DoctorProfile';
import { MedicineOrder } from '../../entities/MedicineOrder';
import { Booking } from '../../entities/Booking';
import { DoctorsService } from '../doctors/doctors.service';
import { BookingsService } from '../bookings/bookings.service';
import { matchOptionIndex } from './match-option.util';
import { formatWhatsAppError } from '../../providers/whatsapp/format-whatsapp-error';
import { WhatsAppProviderResolver } from './whatsapp-provider-resolver.service';

const MAX_HOPS_PER_TURN = 20;
const MAX_SLOT_OPTIONS = 6;
const MAX_SLOT_SEARCH_DAYS = 14;

type NodeOutcome =
  | { action: 'advance'; nextNodeId: string }
  | { action: 'wait' }
  | { action: 'handoff' }
  | { action: 'end' };

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
  ) {}

  // Returns 'continue' if the session is still mid-flow (or parked waiting for
  // a reply / handed to a human), or 'ended' if the flow reached its `end`
  // node this turn — the caller (whatsapp-bot.service.ts) then hands control
  // back to the hardcoded menu bot for a seamless transition.
  async processInbound(
    session: WhatsAppSession,
    text: string,
    flow: WhatsAppFlow,
  ): Promise<'continue' | 'ended'> {
    const nodesById = new Map(flow.definition.nodes.map((n) => [n.id, n]));
    const edgesBySource = new Map<string, WhatsAppFlowEdge[]>();
    for (const edge of flow.definition.edges) {
      const list = edgesBySource.get(edge.source) ?? [];
      list.push(edge);
      edgesBySource.set(edge.source, list);
    }

    const isResume = Boolean(session.flowNodeId);
    let currentNode: WhatsAppFlowNode | undefined = session.flowNodeId
      ? nodesById.get(session.flowNodeId)
      : flow.definition.nodes.find((n) => n.type === 'start');

    if (!currentNode) {
      session.activeFlowId = null;
      session.flowNodeId = null;
      return 'ended';
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
        consumeInput,
        edgesBySource.get(currentNode.id) ?? [],
      );

      if (outcome.action === 'wait') {
        session.flowNodeId = currentNode.id;
        return 'continue';
      }
      if (outcome.action === 'handoff') {
        session.awaitingHuman = true;
        session.flowNodeId = currentNode.id;
        return 'continue';
      }
      if (outcome.action === 'end') {
        session.activeFlowId = null;
        session.flowNodeId = null;
        return 'ended';
      }
      currentNode = nodesById.get(outcome.nextNodeId);
    }

    if (currentNode) {
      console.warn(
        `[WhatsAppFlow] Depth guard (${MAX_HOPS_PER_TURN} hops) hit for session ${session.id} — pausing at node ${currentNode.id}`,
      );
      session.flowNodeId = currentNode.id;
      return 'continue';
    }

    session.activeFlowId = null;
    session.flowNodeId = null;
    return 'ended';
  }

  private async executeNode(
    session: WhatsAppSession,
    node: WhatsAppFlowNode,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
  ): Promise<NodeOutcome> {
    switch (node.type) {
      case 'start':
        return this.advanceTo(outgoing[0]);

      case 'message': {
        const text = interpolate(
          (node.data['text'] as string | undefined) ?? '',
          session.flowVariables,
        );
        await this.send(session, text);
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
          // Unrecognized reply — re-show the same menu and keep waiting.
          await this.sendOptions(
            session,
            (node.data['text'] as string | undefined) ?? '',
            options,
          );
          return { action: 'wait' };
        }

        await this.sendOptions(
          session,
          (node.data['text'] as string | undefined) ?? '',
          options,
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
            'You are a helpful HealthPlus WhatsApp assistant. Keep replies short.',
          patientContext: {
            bloodGroup: '',
            allergies: [],
            chronicConditions: [],
            history: [],
          },
          sessionId: session.id,
        });

        this.appendMessage(session, 'user', inputText);
        await this.send(session, result.reply);

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
          await this.send(session, 'Please reply with a number from 1 to 5.');
          return { action: 'wait' };
        }
        await this.send(
          session,
          (node.data['text'] as string | undefined) ??
            'How would you rate this? Reply 1-5.',
        );
        return { action: 'wait' };
      }

      case 'handoff': {
        const text = node.data['text'] as string | undefined;
        if (text) await this.send(session, text);
        return { action: 'handoff' };
      }

      // ── Platform-aware nodes — live app data instead of admin-authored content ──

      case 'platform_specialty_list':
        return this.executeSpecialtyList(
          session,
          inputText,
          consumeInput,
          outgoing,
        );

      case 'platform_doctor_list':
        return this.executeDoctorList(
          session,
          inputText,
          consumeInput,
          outgoing,
        );

      case 'platform_slot_list':
        return this.executeSlotList(session, inputText, consumeInput, outgoing);

      case 'platform_consultation_type':
        return this.executeConsultationType(
          session,
          inputText,
          consumeInput,
          outgoing,
        );

      case 'platform_payment_method':
        return this.executePaymentMethod(
          session,
          inputText,
          consumeInput,
          outgoing,
        );

      case 'platform_create_booking':
        return this.executeCreateBooking(session, outgoing);

      case 'platform_order_status':
        return this.executeOrderStatus(session, outgoing);

      case 'end':
      default:
        return { action: 'end' };
    }
  }

  // ── Platform node implementations ─────────────────────────────────

  private async executeSpecialtyList(
    session: WhatsAppSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
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
      await this.sendOptionList(
        session,
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
      await this.send(
        session,
        'Sorry, no doctors are available for booking right now.',
      );
      return { action: 'end' };
    }

    session.flowVariables = {
      ...session.flowVariables,
      __specialtyList: specialties,
    };
    await this.sendOptionList(
      session,
      'Which specialty do you need?',
      specialties.map((s, i) => ({ id: String(i + 1), title: s })),
      'Select',
    );
    return { action: 'wait' };
  }

  private async executeDoctorList(
    session: WhatsAppSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
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
      await this.sendOptionList(
        session,
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
      await this.send(session, `No doctors found for ${specialty} right now.`);
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
    await this.sendOptionList(
      session,
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
    session: WhatsAppSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
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
      await this.sendOptionList(
        session,
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
      await this.send(
        session,
        `No upcoming slots found in the next ${MAX_SLOT_SEARCH_DAYS} days.`,
      );
      return { action: 'end' };
    }

    session.flowVariables = {
      ...session.flowVariables,
      __slotList: slotOptions,
    };
    await this.sendOptionList(
      session,
      'Available slots:',
      slotOptions.map((s, i) => ({ id: String(i + 1), title: s.label })),
      'Select',
    );
    return { action: 'wait' };
  }

  private async executeConsultationType(
    session: WhatsAppSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
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
    await this.sendOptionList(
      session,
      'How would you like to consult?',
      titles.map((t, i) => ({ id: String(i + 1), title: t })),
    );
    return { action: 'wait' };
  }

  private async executePaymentMethod(
    session: WhatsAppSession,
    inputText: string,
    consumeInput: boolean,
    outgoing: WhatsAppFlowEdge[],
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
    await this.sendOptionList(session, 'How would you like to pay?', [
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
    session: WhatsAppSession,
    outgoing: WhatsAppFlowEdge[],
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
      await this.send(
        session,
        'Something went wrong building your booking — missing required details. Please start over.',
      );
      return this.advanceTo(outgoing[0]);
    }

    if (!session.userId) {
      await this.send(
        session,
        `I couldn't find a HealthPlus account linked to this number, so I can't complete the booking. Please sign up in the app first with this same phone number.`,
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
      await this.send(
        session,
        payOnline === false
          ? `✅ Booking confirmed! You can pay at the clinic during your visit.`
          : `✅ Booking confirmed! Check the message above for your payment link to secure it.`,
      );
    } catch (err) {
      await this.send(
        session,
        `Sorry, I couldn't complete that booking (${err instanceof Error ? err.message : 'please try again'}).`,
      );
    }

    return this.advanceTo(outgoing[0]);
  }

  private async executeOrderStatus(
    session: WhatsAppSession,
    outgoing: WhatsAppFlowEdge[],
  ): Promise<NodeOutcome> {
    if (!session.userId) {
      await this.send(
        session,
        `I couldn't find a HealthPlus account linked to this number.`,
      );
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
      await this.send(
        session,
        `You don't have any medicine orders or bookings yet.`,
      );
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
    await this.send(session, lines.join('\n'));
    return this.advanceTo(outgoing[0]);
  }

  // ── Shared helpers ─────────────────────────────────────────────────

  private advanceTo(edge?: WhatsAppFlowEdge): NodeOutcome {
    if (!edge) return { action: 'end' };
    return { action: 'advance', nextNodeId: edge.target };
  }

  private async sendOptions(
    session: WhatsAppSession,
    promptText: string,
    options: { id: string; label: string }[],
  ): Promise<void> {
    await this.sendOptionList(
      session,
      promptText,
      options.map((o) => ({ id: o.id, title: o.label })),
    );
  }

  private async sendOptionList(
    session: WhatsAppSession,
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
    try {
      const provider = await this.providerResolver.resolve(session.tenantId!);
      await provider.sendInteractive(
        session.phoneNumber,
        body,
        options,
        listButtonLabel,
      );
    } catch (err) {
      console.error(
        `[WhatsAppFlow] sendInteractive failed: ${formatWhatsAppError(err)}`,
      );
    }
  }

  private async send(session: WhatsAppSession, text: string): Promise<void> {
    if (!text) return;
    this.appendMessage(session, 'assistant', text);
    try {
      const provider = await this.providerResolver.resolve(session.tenantId!);
      await provider.sendText(session.phoneNumber, text);
    } catch (err) {
      console.error(
        `[WhatsAppFlow] sendText failed: ${formatWhatsAppError(err)}`,
      );
    }
  }

  private appendMessage(
    session: WhatsAppSession,
    role: 'user' | 'assistant' | 'admin',
    content: string,
  ): void {
    session.messages = [
      ...session.messages,
      { role, content, timestamp: new Date().toISOString() },
    ];
  }
}
